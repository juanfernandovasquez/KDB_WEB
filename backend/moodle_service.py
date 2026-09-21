import os
import re as _re
import time
import secrets
import string
import logging

import requests

ENROLLMENT_DAYS = int(os.environ.get("MOODLE_ENROLLMENT_DAYS", "90"))

logger = logging.getLogger(__name__)

MOODLE_BASE_URL = (os.environ.get("MOODLE_BASE_URL") or "https://cursos.katarzyna.pe").rstrip("/")
MOODLE_TOKEN = os.environ.get("MOODLE_TOKEN", "")


def _call(function, **params):
    if not MOODLE_TOKEN:
        raise RuntimeError("MOODLE_TOKEN no configurado en .env")
    url = f"{MOODLE_BASE_URL}/webservice/rest/server.php"
    data = {
        "wstoken": MOODLE_TOKEN,
        "wsfunction": function,
        "moodlewsrestformat": "json",
        **params,
    }
    resp = requests.post(url, data=data, timeout=20)
    resp.raise_for_status()
    result = resp.json()
    if isinstance(result, dict) and result.get("exception"):
        raise RuntimeError(
            f"Moodle API error [{result.get('errorcode')}]: {result.get('message')}"
        )
    return result


def _generate_password():
    """Password que cumple la política de Moodle: mayúscula, minúscula, dígito, especial, 10+ chars."""
    specials = "!@#$%"
    alphabet = string.ascii_letters + string.digits + specials
    for _ in range(100):
        pwd = "".join(secrets.choice(alphabet) for _ in range(12))
        if (
            any(c.isupper() for c in pwd)
            and any(c.islower() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in specials for c in pwd)
        ):
            return pwd
    # fallback determinista si por alguna razón los 100 intentos fallan
    return f"Kdb{secrets.token_hex(4)}!9"


def get_or_create_moodle_user(email, firstname, lastname):
    """
    Busca un usuario por email. Si no existe, lo crea con contraseña aleatoria.
    Retorna: (moodle_user_id, username, password_or_None, was_created)
    - password_or_None: contraseña generada si el usuario fue creado, None si ya existía.
    """
    result = _call(
        "core_user_get_users",
        **{"criteria[0][key]": "email", "criteria[0][value]": email},
    )
    users = result.get("users", [])
    if users:
        u = users[0]
        logger.info("Moodle: usuario existente id=%s email=%s", u["id"], email)
        return u["id"], u["username"], None, False

    # Usamos el email como username (así el campo usuario en el forgot password también funciona con email)
    username = email.lower()
    password = _generate_password()
    fn = (firstname or "").strip() or email.split("@")[0]
    ln = (lastname or "").strip() or "."

    result = _call(
        "core_user_create_users",
        **{
            "users[0][username]": username,
            "users[0][password]": password,
            "users[0][firstname]": fn,
            "users[0][lastname]": ln,
            "users[0][email]": email,
            "users[0][auth]": "manual",
            "users[0][lang]": "es",
        },
    )
    user_id = result[0]["id"]
    logger.info("Moodle: usuario creado id=%s username=%s", user_id, username)
    return user_id, username, password, True


def enroll_user_in_course(moodle_user_id, moodle_course_id):
    """Matricula al usuario (rol Student=5) con duración de ENROLLMENT_DAYS días."""
    timestart = int(time.time())
    timeend = timestart + ENROLLMENT_DAYS * 24 * 3600
    _call(
        "enrol_manual_enrol_users",
        **{
            "enrolments[0][roleid]": 5,
            "enrolments[0][userid]": moodle_user_id,
            "enrolments[0][courseid]": moodle_course_id,
            "enrolments[0][timestart]": timestart,
            "enrolments[0][timeend]": timeend,
        },
    )
    logger.info(
        "Moodle: usuario %s matriculado en curso %s por %s días",
        moodle_user_id, moodle_course_id, ENROLLMENT_DAYS,
    )


def unenroll_user_from_course(moodle_user_id, moodle_course_id):
    """Desmatricula al usuario del curso en Moodle."""
    _call(
        "enrol_manual_unenrol_users",
        **{
            "enrolments[0][userid]": moodle_user_id,
            "enrolments[0][courseid]": moodle_course_id,
        },
    )
    logger.info("Moodle: usuario %s desmatriculado de curso %s", moodle_user_id, moodle_course_id)


def set_course_visibility(moodle_course_id, visible: bool):
    """Hace visible (True) o invisible (False) un curso en Moodle."""
    _call(
        "core_course_update_courses",
        **{
            "courses[0][id]": moodle_course_id,
            "courses[0][visible]": 1 if visible else 0,
        },
    )
    logger.info("Moodle: curso %s visible=%s", moodle_course_id, visible)


def _strip_html(text):
    return _re.sub(r'<[^>]+>', '', text or '').strip()


def get_moodle_courses():
    """Retorna todos los cursos de Moodle (excluye el sitio raíz id=1)."""
    result = _call("core_course_get_courses")
    courses = []
    for c in result:
        if c.get("id") == 1:
            continue
        image_url = None
        for f in c.get("overviewfiles", []):
            if f.get("mimetype", "").startswith("image/"):
                raw = f.get("fileurl", "")
                if raw:
                    image_url = (raw + f"?token={MOODLE_TOKEN}") if MOODLE_TOKEN and "token=" not in raw else raw
                break
        courses.append({
            "moodle_course_id": c["id"],
            "title": c.get("fullname", ""),
            "shortname": c.get("shortname", ""),
            "description": _strip_html(c.get("summary", "")),
            "visible": bool(c.get("visible", 1)),
            "image_url": image_url,
        })
    return courses


def get_moodle_categories():
    """Retorna todas las categorías de Moodle."""
    return _call("core_course_get_categories")


def create_moodle_category(name, idnumber="", description="", parent=0):
    """Crea una categoría en Moodle y retorna su ID."""
    result = _call(
        "core_course_create_categories",
        **{
            "categories[0][name]": name,
            "categories[0][idnumber]": idnumber or "",
            "categories[0][description]": description or "",
            "categories[0][descriptionformat]": 1,
            "categories[0][parent]": parent,
        },
    )
    return result[0]["id"]


def update_moodle_category(moodle_cat_id, name, description="", idnumber=None):
    """Actualiza nombre, descripción e idnumber de una categoría en Moodle."""
    params = {
        "categories[0][id]": moodle_cat_id,
        "categories[0][name]": name,
        "categories[0][description]": description or "",
        "categories[0][descriptionformat]": 1,
    }
    if idnumber is not None:
        params["categories[0][idnumber]"] = idnumber
    _call("core_course_update_categories", **params)
    logger.info("Moodle: categoría %s actualizada a '%s'", moodle_cat_id, name)


def delete_moodle_category(moodle_cat_id):
    """Elimina una categoría en Moodle recursivamente."""
    _call(
        "core_course_delete_categories",
        **{
            "categories[0][id]": moodle_cat_id,
            "categories[0][recursive]": 1,
        },
    )
    logger.info("Moodle: categoría %s eliminada", moodle_cat_id)


def update_moodle_course_metadata(moodle_course_id, title, description, moodle_category_id=None, visible=True):
    """Empuja metadatos de un curso a Moodle (título, descripción, categoría, visibilidad)."""
    params = {
        "courses[0][id]": moodle_course_id,
        "courses[0][fullname]": title,
        "courses[0][summary]": description or "",
        "courses[0][visible]": 1 if visible else 0,
    }
    if moodle_category_id:
        params["courses[0][categoryid]"] = moodle_category_id
    _call("core_course_update_courses", **params)
    logger.info("Moodle: metadatos de curso %s actualizados", moodle_course_id)


def get_moodle_course_by_id(moodle_course_id):
    """Retorna los metadatos de un curso de Moodle por su ID."""
    result = _call("core_course_get_courses", **{"options[ids][0]": moodle_course_id})
    if not result:
        return None
    c = result[0]
    return {
        "moodle_course_id": c["id"],
        "title": c.get("fullname", ""),
        "description": _strip_html(c.get("summary", "")),
        "visible": bool(c.get("visible", 1)),
        "moodle_category_id": c.get("categoryid"),
    }


def provision_student(email, firstname, lastname, moodle_course_id):
    """
    Punto de entrada principal.
    Crea o recupera cuenta Moodle + matricula en el curso.
    Retorna dict con user_id, username, password (None si ya existía), was_created.
    """
    user_id, username, password, was_created = get_or_create_moodle_user(
        email, firstname, lastname
    )
    enroll_user_in_course(user_id, moodle_course_id)
    return {
        "moodle_user_id": user_id,
        "username": username,
        "password": password,
        "was_created": was_created,
    }
