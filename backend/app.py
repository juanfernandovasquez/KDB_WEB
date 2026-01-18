import os
import re
import mimetypes
from functools import wraps

from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, g
from flask_cors import CORS
import logging
from werkzeug.middleware.proxy_fix import ProxyFix

from db import ensure_db, init_db
from models import (
    delete_subscription,
    fetch_company,
    fetch_services,
    fetch_services_meta,
    fetch_subscriptions,
    fetch_contact_messages,
    delete_contact_message,
    get_conn,
    get_page_data,
    replace_hero,
    replace_services,
    replace_team,
    save_about,
    save_company,
    save_contact_message,
    save_services_meta,
    save_story,
    save_team_meta,
    # publicaciones
    fetch_publications,
    fetch_publication,
    save_publication,
    delete_publication,
    fetch_categories,
    save_category,
    delete_category,
    fetch_publication_by_slug,
    fetch_kdbweb_entries,
    fetch_kdbweb_entry_by_slug,
    fetch_page_settings,
    is_page_enabled,
    replace_kdbweb_entries,
    save_page_settings,
    authenticate_admin,
    admins_exist,
    create_admin_session,
    create_admin_user,
    delete_admin_user,
    fetch_admin_by_id,
    fetch_admin_by_username,
    get_admin_by_token,
    list_admins,
    revoke_admin_session,
    update_admin_user,
)
from s3_service import (
    create_media_folder,
    create_presigned_post,
    delete_media_object,
    list_media_objects,
    rename_media_object,
)

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_PAGES = {
    "home",
    "nosotros",
    "servicios",
    "productos",
    "publicaciones",
    "kdbweb",
    "cookies",
    "terminos",
    "privacidad",
}
PAGE_VISIBILITY_KEYS = {
    "home",
    "nosotros",
    "servicios",
    "publicaciones",
    "kdbweb",
    "contacto",
    "productos",
    "cookies",
    "terminos",
    "privacidad",
}


def _load_env_file():
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

APP_ENV = (os.environ.get("APP_ENV") or os.environ.get("FLASK_ENV") or "development").lower()
DEBUG = (os.environ.get("FLASK_DEBUG") or "").lower() in ("1", "true", "yes", "on")
REQUEST_LOG = (os.environ.get("REQUEST_LOG") or ("1" if APP_ENV != "production" else "0")).lower() in ("1", "true", "yes", "on")

log_level_name = (os.environ.get("LOG_LEVEL") or ("DEBUG" if DEBUG else "INFO")).upper()
LOG_LEVEL = getattr(logging, log_level_name, logging.INFO)

app = Flask(__name__, static_folder=None, template_folder=None)
if (os.environ.get("USE_PROXY_FIX") or "").lower() in ("1", "true", "yes", "on"):
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Logging configuration
logging.basicConfig(level=LOG_LEVEL)
app.logger.setLevel(LOG_LEVEL)

secret_key = (os.environ.get("SECRET_KEY") or "").strip()
if not secret_key:
    if APP_ENV == "production":
        app.logger.warning("SECRET_KEY no esta configurado; define uno en produccion.")
    secret_key = os.urandom(24)
app.config["SECRET_KEY"] = secret_key
app.config["SESSION_COOKIE_SECURE"] = (os.environ.get("SESSION_COOKIE_SECURE") or ("1" if APP_ENV == "production" else "0")).lower() in ("1", "true", "yes", "on")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
app.config["ADMIN_SESSION_HOURS"] = int(os.environ.get("ADMIN_SESSION_HOURS", "8"))

cors_origins = [o.strip() for o in (os.environ.get("CORS_ORIGINS") or "").split(",") if o.strip()]
cors_enabled = (os.environ.get("CORS_ENABLED") or ("1" if APP_ENV != "production" else "0")).lower() in ("1", "true", "yes", "on")
if cors_enabled:
    if cors_origins:
        CORS(app, resources={r"/*": {"origins": cors_origins}})
    else:
        CORS(app)


def _get_bearer_token():
    auth = request.headers.get("Authorization", "")
    if not auth:
        return ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return ""


def _is_admin_request():
    token = _get_bearer_token()
    if not token:
        return False
    return bool(get_admin_by_token(token))


def _page_enabled_for_request(page_key):
    if is_page_enabled(page_key):
        return True
    return _is_admin_request()


def require_admin(roles=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = _get_bearer_token()
            admin = get_admin_by_token(token)
            if not admin:
                return jsonify(error="No autorizado"), 401
            if roles and admin.get("role") not in roles:
                return jsonify(error="No autorizado"), 403
            g.admin = admin
            return fn(*args, **kwargs)
        return wrapper
    return decorator


@app.route("/health", methods=["GET"])
def health():
    return jsonify(status="ok"), 200


def _admin_payload(admin):
    return {
        "id": admin.get("id"),
        "username": admin.get("username"),
        "role": admin.get("role"),
        "active": admin.get("active"),
    }


@app.route("/auth/bootstrap", methods=["POST"])
def auth_bootstrap():
    ensure_db()
    if admins_exist():
        return jsonify(error="Bootstrap ya realizado"), 400
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()
    if not username or not password:
        return jsonify(error="Usuario y password son obligatorios"), 400
    admin_id = create_admin_user(username, password, role="super", active=True)
    return jsonify(id=admin_id, username=username, role="super"), 201


@app.route("/auth/login", methods=["POST"])
def auth_login():
    ensure_db()
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()
    if not username or not password:
        return jsonify(error="Usuario y password son obligatorios"), 400
    admin = authenticate_admin(username, password)
    if not admin:
        return jsonify(error="Credenciales invalidas"), 401
    token, expires_at = create_admin_session(admin["id"], ttl_hours=app.config["ADMIN_SESSION_HOURS"])
    return jsonify(token=token, expires_at=expires_at, admin=_admin_payload(admin)), 200


@app.route("/auth/me", methods=["GET"])
@require_admin()
def auth_me():
    return jsonify(_admin_payload(g.admin)), 200


@app.route("/auth/logout", methods=["POST"])
@require_admin()
def auth_logout():
    token = _get_bearer_token()
    revoke_admin_session(token)
    return jsonify(message="Sesion cerrada"), 200


@app.route("/auth/admins", methods=["GET", "POST"])
@require_admin(roles={"super"})
def auth_admins():
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        username = (payload.get("username") or "").strip()
        password = (payload.get("password") or "").strip()
        role = (payload.get("role") or "editor").strip()
        active = payload.get("active", True)
        if not username or not password:
            return jsonify(error="Usuario y password son obligatorios"), 400
        if fetch_admin_by_username(username):
            return jsonify(error="Usuario ya existe"), 409
        admin_id = create_admin_user(username, password, role=role, active=bool(active))
        return jsonify(id=admin_id), 201
    return jsonify(list_admins()), 200


@app.route("/auth/admins/<int:admin_id>", methods=["PUT", "DELETE"])
@require_admin(roles={"super"})
def auth_admin_modify(admin_id):
    if request.method == "DELETE":
        delete_admin_user(admin_id)
        return jsonify(message="Eliminado"), 200
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    role = payload.get("role")
    active = payload.get("active")
    password = payload.get("password")
    if username is not None:
        username = (username or "").strip()
        if not username:
            return jsonify(error="Usuario es obligatorio"), 400
        existing = fetch_admin_by_username(username)
        if existing and int(existing.get("id")) != int(admin_id):
            return jsonify(error="Usuario ya existe"), 409
        if not fetch_admin_by_id(admin_id):
            return jsonify(error="Usuario no encontrado"), 404
    update_admin_user(admin_id, role=role, active=active, password=password, username=username)
    return jsonify(message="Actualizado"), 200


@app.route("/subscribe", methods=["POST"])
def subscribe():
    ensure_db()
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    accepted_terms = str(data.get("accepted_terms") or "").strip().lower()
    if accepted_terms not in ("1", "true", "yes", "on"):
        return jsonify(error="Debes aceptar los terminos y condiciones"), 400

    if not EMAIL_REGEX.match(email):
        return jsonify(error="Email invalido"), 400

    conn = get_conn()
    try:
        with conn:
            conn.execute(
                "INSERT INTO subscriptions (email, created_at) VALUES (?, ?)",
                (email, datetime.utcnow().isoformat()),
            )
    except Exception as exc:  # pylint: disable=broad-except
        if "UNIQUE constraint" in str(exc):
            return jsonify(message="Suscripcion registrada"), 201
        raise
    finally:
        conn.close()

    print(f"[subscribe] new email saved: {email}")
    return jsonify(message="Suscripcion registrada"), 201

@app.route("/config/company", methods=["GET", "POST"])
@require_admin()
def company_config():
    ensure_db()
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        print("[company_config] POST payload:", payload)
        save_company(payload)
        return jsonify(message="Company info updated"), 200
    print("[company_config] GET")
    return jsonify(fetch_company())


@app.route("/config/page/<page>", methods=["GET", "POST"])
@require_admin()
def page_config(page):
    if page not in ALLOWED_PAGES:
        return jsonify(error="PÃ¡gina no encontrada"), 404
    ensure_db()
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        print(f"[page_config] POST page={page} payload keys={list(payload.keys())}")
        hero = payload.get("hero") or []
        story = payload.get("story") or {}
        team = payload.get("team") or []
        about = payload.get("about") or {}
        team_meta = payload.get("team_meta") or {}
        services = payload.get("services") or []
        services_meta = payload.get("services_meta") or {}
        replace_hero(page, hero)
        save_story(page, story)
        save_about(page, about)
        save_team_meta(page, team_meta)
        replace_team(page, team)
        replace_services(page, services)
        save_services_meta(page, services_meta)
        return jsonify(message="Page content updated"), 200
    print(f"[page_config] GET page={page}")
    data = get_page_data(page)
    print(f"[page_config] data hero={len(data.get('hero', []))} team={len(data.get('team', []))} about={'yes' if data.get('about') else 'no'}")
    return jsonify(data)


@app.route("/config/pages", methods=["GET", "POST"])
@require_admin()
def config_pages():
    ensure_db()
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        pages = payload.get("pages") or {}
        if not isinstance(pages, dict):
            return jsonify(error="Formato invalido"), 400
        filtered = {k: bool(v) for k, v in pages.items() if k in PAGE_VISIBILITY_KEYS}
        save_page_settings(filtered)
        return jsonify(message="Visibilidad actualizada"), 200
    settings = fetch_page_settings()
    data = {key: bool(settings.get(key, True)) for key in PAGE_VISIBILITY_KEYS}
    return jsonify(pages=data)


# API endpoints pensados para frontend separado
@app.route("/api/company", methods=["GET"])
def api_company():
    ensure_db()
    return jsonify(fetch_company())


@app.route("/api/pages", methods=["GET"])
def api_pages():
    ensure_db()
    settings = fetch_page_settings()
    data = {key: bool(settings.get(key, True)) for key in PAGE_VISIBILITY_KEYS}
    return jsonify(pages=data)


@app.route("/api/page/<page>", methods=["GET"])
def api_page(page):
    if page not in ALLOWED_PAGES:
        return jsonify(error="PÃ¡gina no encontrada"), 404
    ensure_db()
    if not _page_enabled_for_request(page):
        return jsonify(error="Pagina no disponible"), 404
    return jsonify(get_page_data(page))


# Publicaciones / categories API
@app.route("/api/publications", methods=["GET"])
def api_publications():
    ensure_db()
    if not _page_enabled_for_request("publicaciones"):
        return jsonify(error="Pagina no disponible"), 404
    active_only = request.args.get("all") is None
    return jsonify(fetch_publications(active_only=active_only))


@app.route("/api/publications/<int:pub_id>", methods=["GET"])
def api_publication(pub_id):
    ensure_db()
    if not _page_enabled_for_request("publicaciones"):
        return jsonify(error="Pagina no disponible"), 404
    data = fetch_publication(pub_id)
    if not data:
        return jsonify(error="No encontrado"), 404
    return jsonify(data)


@app.route("/api/publications/slug/<slug>", methods=["GET"])
def api_publication_by_slug(slug):
    ensure_db()
    if not _page_enabled_for_request("publicaciones"):
        return jsonify(error="Pagina no disponible"), 404
    data = fetch_publication_by_slug(slug)
    if not data:
        return jsonify(error="No encontrado"), 404
    return jsonify(data)


@app.route("/api/kdbweb", methods=["GET"])
def api_kdbweb_list():
    ensure_db()
    if not _page_enabled_for_request("kdbweb"):
        return jsonify(error="Pagina no disponible"), 404
    entries = fetch_kdbweb_entries()
    return jsonify(
        [
            {
                "position": entry.get("position"),
                "slug": entry.get("slug"),
                "parent_slug": entry.get("parent_slug"),
                "title": entry.get("title"),
                "card_title": entry.get("card_title"),
                "summary": entry.get("summary"),
                "hero_image_url": entry.get("hero_image_url"),
            }
            for entry in entries
        ]
    )


@app.route("/api/kdbweb/<slug>", methods=["GET"])
def api_kdbweb_detail(slug):
    ensure_db()
    if not _page_enabled_for_request("kdbweb"):
        return jsonify(error="Pagina no disponible"), 404
    entry = fetch_kdbweb_entry_by_slug(slug)
    if not entry:
        return jsonify(error="No encontrado"), 404
    return jsonify(entry)


@app.route("/api/kdbweb", methods=["POST"])
@require_admin()
def api_kdbweb_save():
    ensure_db()
    payload = request.get_json(silent=True) or {}
    entries = payload.get("entries") or []
    if not isinstance(entries, list):
        return jsonify(error="Formato invalido"), 400
    replace_kdbweb_entries(entries)
    return jsonify(message="KDBWEB actualizado"), 200


@app.route("/api/publications", methods=["POST"])
@require_admin()
def api_create_publication():
    ensure_db()
    payload = request.get_json(silent=True) or {}
    print(f"[api_create_publication] payload={payload}")
    try:
        pub_id = save_publication(payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(id=pub_id), 200


@app.route("/api/publications/<int:pub_id>", methods=["PUT", "DELETE"])
@require_admin()
def api_modify_publication(pub_id):
    ensure_db()
    if request.method == "DELETE":
        delete_publication(pub_id)
        return jsonify(message="Deleted"), 200
    payload = request.get_json(silent=True) or {}
    print(f"[api_modify_publication] pub_id={pub_id} payload={payload}")
    payload["id"] = pub_id
    try:
        save_publication(payload)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return jsonify(message="Updated"), 200


@app.route("/api/categories", methods=["GET", "POST"])
def api_categories():
    ensure_db()
    if request.method == "GET" and not _page_enabled_for_request("publicaciones"):
        return jsonify(error="Pagina no disponible"), 404
    if request.method == "POST":
        if not get_admin_by_token(_get_bearer_token()):
            return jsonify(error="No autorizado"), 401
        payload = request.get_json(silent=True) or {}
        save_category(payload)
        return jsonify(message="Saved"), 200
    return jsonify(fetch_categories())


@app.route("/api/media", methods=["GET"])
@require_admin()
def api_media_list():
    limit = request.args.get("limit") or "200"
    prefix = request.args.get("prefix")
    token = request.args.get("token")
    try:
        limit = int(limit)
    except ValueError:
        limit = 200
    limit = max(1, min(limit, 500))
    try:
        items, next_token, resolved_prefix = list_media_objects(
            limit=limit, prefix_override=prefix, continuation=token
        )
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        app.logger.exception("Error listing media from S3")
        return jsonify(error="No se pudo listar el repositorio de imagenes"), 500
    return jsonify(items=items, next_token=next_token, prefix=resolved_prefix), 200


@app.route("/api/media/presign", methods=["POST"])
@require_admin()
def api_media_presign():
    payload = request.get_json(silent=True) or {}
    filename = (payload.get("filename") or "").strip()
    content_type = (payload.get("content_type") or "").strip()
    size = payload.get("size")
    prefix = payload.get("prefix")
    if not filename:
        return jsonify(error="filename es obligatorio"), 400
    if content_type and not content_type.lower().startswith("image/"):
        return jsonify(error="Solo se aceptan imagenes"), 400
    if not content_type:
        guessed = mimetypes.guess_type(filename)[0] or ""
        if guessed and not guessed.lower().startswith("image/"):
            return jsonify(error="Solo se aceptan imagenes"), 400
    try:
        max_bytes_env = int(os.environ.get("S3_UPLOAD_MAX_BYTES", "10485760"))
    except ValueError:
        max_bytes_env = 10485760
    if size is not None:
        try:
            size = int(size)
        except ValueError:
            size = None
        if size is not None and size > max_bytes_env:
            return jsonify(error="Imagen supera el maximo permitido"), 400
    try:
        data = create_presigned_post(
            filename=filename,
            content_type=content_type or None,
            max_bytes=max_bytes_env,
            prefix_override=prefix,
        )
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        app.logger.exception("Error generating presigned upload")
        return jsonify(error="No se pudo preparar la subida"), 500
    return jsonify(data), 200


@app.route("/api/media/delete", methods=["POST"])
@require_admin()
def api_media_delete():
    payload = request.get_json(silent=True) or {}
    key = (payload.get("key") or "").strip()
    if not key:
        return jsonify(error="key es obligatorio"), 400
    try:
        delete_media_object(key)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        app.logger.exception("Error deleting media from S3")
        return jsonify(error="No se pudo eliminar la imagen"), 500
    return jsonify(message="Eliminado"), 200


@app.route("/api/media/rename", methods=["POST"])
@require_admin()
def api_media_rename():
    payload = request.get_json(silent=True) or {}
    key = (payload.get("key") or "").strip()
    new_name = (payload.get("new_name") or "").strip()
    if not key or not new_name:
        return jsonify(error="key y new_name son obligatorios"), 400
    try:
        new_key, url = rename_media_object(key, new_name)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        app.logger.exception("Error renaming media from S3")
        return jsonify(error="No se pudo renombrar la imagen"), 500
    return jsonify(key=new_key, url=url), 200


@app.route("/api/media/folder", methods=["POST"])
@require_admin()
def api_media_folder():
    payload = request.get_json(silent=True) or {}
    folder_name = (payload.get("folder_name") or "").strip()
    prefix = payload.get("prefix")
    if not folder_name:
        return jsonify(error="folder_name es obligatorio"), 400
    try:
        key = create_media_folder(folder_name, prefix_override=prefix)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception:
        app.logger.exception("Error creating media folder in S3")
        return jsonify(error="No se pudo crear la carpeta"), 500
    return jsonify(prefix=key), 200


@app.route("/api/categories/<int:cat_id>", methods=["DELETE"])
@require_admin()
def api_delete_category(cat_id):
    ensure_db()
    delete_category(cat_id)
    return jsonify(message="Deleted"), 200




@app.route("/subscriptions", methods=["GET"])
@require_admin()
def list_subscriptions():
    ensure_db()
    subs = fetch_subscriptions()
    return jsonify(subs)


@app.route("/subscriptions/<int:sub_id>", methods=["DELETE"])
@require_admin()
def remove_subscription(sub_id):
    ensure_db()
    delete_subscription(sub_id)
    return jsonify(message="Deleted"), 200


@app.route("/api/subscriptions", methods=["GET"])
@require_admin()
def api_subscriptions():
    ensure_db()
    return jsonify(fetch_subscriptions())


@app.route("/api/contact", methods=["GET", "POST"])
def api_contact():
    ensure_db()
    if not _page_enabled_for_request("contacto"):
        return jsonify(error="Pagina no disponible"), 404
    if request.method == "GET":
        admin = get_admin_by_token(_get_bearer_token())
        if not admin:
            return jsonify(error="No autorizado"), 401
        limit = request.args.get("limit") or 200
        try:
            limit = int(limit)
        except ValueError:
            limit = 200
        limit = max(1, min(limit, 500))
        return jsonify(fetch_contact_messages(limit=limit))

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    message = (payload.get("message") or "").strip()
    if not name or not email or not message:
        return jsonify(error="Nombre, email y mensaje son obligatorios"), 400
    if not EMAIL_REGEX.match(email):
        return jsonify(error="Email invÃ¡lido"), 400
    if len(message) > 4000:
        return jsonify(error="El mensaje es demasiado largo"), 400
    save_contact_message(payload, request.remote_addr, request.headers.get("User-Agent"))
    return jsonify(message="Mensaje recibido"), 201


@app.route("/api/contact/<int:message_id>", methods=["DELETE"])
@require_admin()
def api_contact_delete(message_id):
    ensure_db()
    if not _page_enabled_for_request("contacto"):
        return jsonify(error="Pagina no disponible"), 404
    delete_contact_message(message_id)
    return jsonify(message="Eliminado"), 200

@app.route("/swagger.json", methods=["GET"])
def swagger_json():
    base = request.host_url.rstrip("/")
    spec = {
        "openapi": "3.0.1",
        "info": {"title": "KDB API", "version": "1.0.0", "description": "API del backend (contenidos, suscripciones, configuraciÃ³n)."},
        "servers": [{"url": base}],
        "paths": {
            "/health": {
                "get": {
                    "summary": "Healthcheck",
                    "description": "Verifica que el servicio estÃ© en lÃ­nea.",
                    "responses": {"200": {"description": "OK"}},
                }
            },
            "/api/categories": {
                "get": {"summary": "Listar categorÃ­as", "description": "Devuelve todas las categorÃ­as.", "responses": {"200": {"description": "OK"}}},
                "post": {
                    "summary": "Crear/actualizar categorÃ­a",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}}}},
                    "responses": {"200": {"description": "Guardada"}},
                },
            },
            "/api/categories/{cat_id}": {
                "delete": {
                    "summary": "Eliminar categorÃ­a",
                    "parameters": [{"in": "path", "name": "cat_id", "required": True, "schema": {"type": "integer"}}],
                    "responses": {"200": {"description": "Eliminado"}},
                }
            },
            "/api/media": {
                "get": {
                    "summary": "Listar imagenes del repositorio",
                    "description": "Devuelve objetos desde el bucket S3 configurado.",
                    "parameters": [
                        {"in": "query", "name": "prefix", "schema": {"type": "string"}, "description": "Prefijo opcional"},
                        {"in": "query", "name": "limit", "schema": {"type": "integer"}, "description": "Cantidad maxima (1-500)"},
                        {"in": "query", "name": "token", "schema": {"type": "string"}, "description": "Paginacion (ContinuationToken)"},
                    ],
                    "responses": {"200": {"description": "OK"}, "400": {"description": "Configuracion incompleta"}},
                }
            },
            "/api/media/presign": {
            "/api/media/delete": {
                "post": {
                    "summary": "Eliminar imagen",
                    "description": "Elimina una imagen del bucket S3.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "key": {"type": "string"}
                                    },
                                    "required": ["key"]
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Eliminado"}, "400": {"description": "Datos invalidos"}}
                }
            },
            "/api/media/rename": {
            "/api/media/folder": {
                "post": {
                    "summary": "Crear carpeta",
                    "description": "Crea un prefijo (carpeta) en el bucket S3.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "folder_name": {"type": "string"},
                                        "prefix": {"type": "string"}
                                    },
                                    "required": ["folder_name"]
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Creada"}, "400": {"description": "Datos invalidos"}}
                }
            },

                "post": {
                    "summary": "Renombrar imagen",
                    "description": "Renombra una imagen dentro del bucket S3.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "key": {"type": "string"},
                                        "new_name": {"type": "string"}
                                    },
                                    "required": ["key", "new_name"]
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "Renombrado"}, "400": {"description": "Datos invalidos"}}
                }
            },

                "post": {
                    "summary": "Generar URL de subida",
                    "description": "Genera un presigned POST para subir imagenes a S3.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "filename": {"type": "string"},
                                        "content_type": {"type": "string"},
                                        "size": {"type": "integer"},
                                        "prefix": {"type": "string"}
                                    },
                                    "required": ["filename"]
                                }
                            }
                        }
                    },
                    "responses": {"200": {"description": "OK"}, "400": {"description": "Datos invalidos"}}
                }
            },
            "/api/publications": {
                "get": {
                    "summary": "Listar publicaciones",
                    "description": "Retorna publicaciones; por defecto solo activas. Usar all=1 para incluir inactivas.",
                    "parameters": [{"in": "query", "name": "all", "schema": {"type": "string"}, "description": "Si se envÃ­a, incluye inactivas"}],
                    "responses": {"200": {"description": "OK"}},
                },
                "post": {
                    "summary": "Crear publicaciÃ³n",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Creada"}},
                },
            },
            "/api/publications/{pub_id}": {
                "get": {
                    "summary": "Obtener publicaciÃ³n",
                    "parameters": [{"in": "path", "name": "pub_id", "required": True, "schema": {"type": "integer"}}],
                    "responses": {"200": {"description": "OK"}, "404": {"description": "No encontrada"}},
                },
                "put": {
                    "summary": "Actualizar publicaciÃ³n",
                    "parameters": [{"in": "path", "name": "pub_id", "required": True, "schema": {"type": "integer"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Actualizada"}},
                },
                "delete": {
                    "summary": "Eliminar publicaciÃ³n",
                    "parameters": [{"in": "path", "name": "pub_id", "required": True, "schema": {"type": "integer"}}],
                    "responses": {"200": {"description": "Eliminada"}},
                },
            },
            "/subscribe": {
                "post": {
                    "summary": "Registrar suscripciÃ³n",
                    "description": "Registra un correo en la lista de suscriptores. Devuelve 409 si el correo ya existe o 400 si es invÃ¡lido.",
                    "requestBody": {
                        "required": True,
                        "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]}}},
                    },
                    "responses": {"201": {"description": "Registrado"}, "400": {"description": "Email invÃ¡lido"}, "409": {"description": "Duplicado"}},
                }
            },
            "/subscriptions": {
                "get": {
                    "summary": "Listar suscriptores",
                    "description": "Devuelve la lista (mÃ¡x 500) de suscriptores ordenados por fecha desc.",
                    "responses": {"200": {"description": "Lista"}},
                }
            },
            "/subscriptions/{sub_id}": {
                "delete": {
                    "summary": "Eliminar suscriptor",
                    "description": "Elimina un suscriptor por id.",
                    "parameters": [{"in": "path", "name": "sub_id", "required": True, "schema": {"type": "integer"}}],
                    "responses": {"200": {"description": "Eliminado"}},
                }
            },
            "/api/contact": {
                "get": {
                    "summary": "Listar mensajes de contacto",
                    "description": "Devuelve mensajes de contacto. Usa limit para acotar resultados.",
                    "parameters": [{"in": "query", "name": "limit", "schema": {"type": "integer"}}],
                    "responses": {"200": {"description": "OK"}},
                },
                "post": {
                    "summary": "Enviar mensaje de contacto",
                    "description": "Registra un mensaje enviado desde la pagina de contacto.",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string"},
                                        "email": {"type": "string"},
                                        "phone": {"type": "string"},
                                        "subject": {"type": "string"},
                                        "message": {"type": "string"},
                                    },
                                    "required": ["name", "email", "message"],
                                }
                            }
                        },
                    },
                    "responses": {"201": {"description": "Registrado"}, "400": {"description": "Datos invalidos"}},
                },
            },
            "/api/contact/{message_id}": {
                "delete": {
                    "summary": "Eliminar mensaje de contacto",
                    "parameters": [{"in": "path", "name": "message_id", "required": True, "schema": {"type": "integer"}}],
                    "responses": {"200": {"description": "Eliminado"}},
                }
            },
            "/api/company": {
                "get": {
                    "summary": "Datos de la empresa",
                    "description": "Devuelve la informaciÃ³n pÃºblica de la empresa (nombre, tagline, contacto, redes).",
                    "responses": {"200": {"description": "OK"}},
                }
            },
            "/api/page/{page}": {
                "get": {
                    "summary": "Contenido pÃºblico por pÃ¡gina",
                    "description": "Devuelve contenido estructurado (hero, story, team, about, services) para la pÃ¡gina indicada.",
                    "parameters": [{"in": "path", "name": "page", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "OK"}},
                }
            },
            "/config/company": {
                "get": {
                    "summary": "Obtener datos de empresa (panel)",
                    "description": "Devuelve datos para ediciÃ³n en el panel admin.",
                    "responses": {"200": {"description": "OK"}},
                },
                "post": {
                    "summary": "Actualizar datos de empresa (panel)",
                    "description": "Actualiza la info de empresa editable desde el panel admin.",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Actualizado"}},
                },
            },
            "/config/page/{page}": {
                "get": {
                    "summary": "Obtener contenido editable (panel)",
                    "description": "Devuelve contenido editable para el panel (hero/story/team/about/services).",
                    "parameters": [{"in": "path", "name": "page", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "OK"}},
                },
                "post": {
                    "summary": "Actualizar contenido editable (panel)",
                    "description": "Reemplaza el contenido editable de la pÃ¡gina (hero/story/team/about/services).",
                    "parameters": [{"in": "path", "name": "page", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {"type": "object"}}}},
                    "responses": {"200": {"description": "Actualizado"}},
                },
            },
        },
    }
    return jsonify(spec)


@app.before_request
def before():
    ensure_db()
    if not REQUEST_LOG:
        return
    # Log basic request info so frontend requests are visible in the server terminal
    try:
        payload = request.get_json(silent=True)
    except Exception:
        payload = None
    args = dict(request.args)
    print(f"[request] {request.method} {request.path} from {request.remote_addr} args={args} json={payload}")


@app.errorhandler(404)
def not_found(error):
    return jsonify(error="Pagina no encontrada"), 404


if __name__ == "__main__":
    init_db()
    host = os.environ.get("FLASK_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=DEBUG)






