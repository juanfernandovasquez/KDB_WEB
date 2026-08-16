import os
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
