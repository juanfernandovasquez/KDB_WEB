# KDB_WEB — Guía para agentes

## Qué es este proyecto

Sitio web corporativo de **Katarzyna / KDB Legal & Tributario** (dominio: `katarzyna.pe`, también `kdb.pe`).
Tiene dos partes:
- **Frontend**: HTML estático servido directamente por Nginx.
- **Backend**: API Flask/Python servida por Gunicorn, consumida por el frontend vía `fetch`.

No es un SPA ni usa React/Vue. El HTML es estático y el JS hace llamadas a la API para cargar contenido dinámico.

---

## Estructura del repositorio

```
KAT_WEB/
├── frontend/          ← Páginas HTML + CSS + JS (servidas por Nginx)
│   ├── index.html
│   ├── nosotros.html
│   ├── servicios.html
│   ├── publicaciones.html
│   ├── publicacion.html
│   ├── kdbweb.html
│   ├── kdbweb-*.html  ← Páginas del módulo legal (una por categoría)
│   ├── admin/         ← Panel de administración (index.html + JS)
│   ├── css/           ← Hojas de estilo por página/componente
│   ├── js/            ← Lógica de frontend
│   ├── partials/      ← header.html, footer.html, hero.html (cargados por JS)
│   ├── assets/        ← Logos, imágenes
│   └── schemas/       ← JSON schemas de referencia para datos
├── backend/           ← API Flask
│   ├── app.py         ← Punto de entrada, todas las rutas
│   ├── db.py          ← Init de SQLite, migraciones inline
│   ├── models.py      ← Todas las funciones de DB (CRUD)
│   ├── s3_service.py  ← Integración AWS S3 para media
│   ├── wsgi.py        ← Entry point para Gunicorn
│   ├── requirements.txt
│   ├── .env.example   ← Plantilla de variables de entorno
│   ├── .env           ← Variables locales (NO commitear)
│   └── venv/          ← Entorno virtual local (NO commitear)
├── deploy/
│   ├── kdbweb.service ← Servicio systemd
│   ├── nginx.conf     ← Config de Nginx (referencia)
│   ├── nginx-limits.conf ← Rate limiting Nginx
│   └── gunicorn.conf.py
├── docs/
│   ├── DEPLOY.md
│   ├── SECURITY.md
│   └── data-contracts.md
└── examples/          ← JSON de ejemplo para estructuras de datos
```

---

## Stack técnico

| Componente | Tecnología |
|---|---|
| Backend | Python 3.12, Flask 2.3.3 |
| Base de datos | SQLite (archivo: `backend/data/subscriptions.db`) |
| Almacenamiento media | AWS S3 (boto3) |
| Servidor web | Nginx → Gunicorn (2 workers, puerto 8000) |
| Proceso | systemd (`kdbweb.service`) |
| Frontend | HTML5 + CSS vanilla + JS vanilla |
| Autenticación admin | Token Bearer + cookie `admin_token` (sesiones 8h) |

---

## Servidor de producción

| Campo | Valor |
|---|---|
| IP | `104.131.189.133` |
| Acceso SSH | `ssh root@104.131.189.133` (clave `~/.ssh/id_ed25519`) |
| Ruta del proyecto | `/var/www/kdbweb/` |
| Servicio | `kdbweb` (systemd) |
| DB en producción | `/var/www/kdbweb/backend/data/subscriptions.db` |
| Venv en producción | `/var/www/kdbweb/backend/venv/` |
| Dominios | `katarzyna.pe`, `www.katarzyna.pe`, `kdb.pe`, `www.kdb.pe` |

### Comandos frecuentes en producción

```bash
# Ver estado del servicio
ssh root@104.131.189.133 "systemctl status kdbweb --no-pager"

# Ver logs en tiempo real
ssh root@104.131.189.133 "journalctl -u kdbweb -f"

# Ver últimos 50 logs
ssh root@104.131.189.133 "journalctl -u kdbweb -n 50 --no-pager"

# Reiniciar backend
ssh root@104.131.189.133 "systemctl restart kdbweb"

# Pull + reiniciar (deploy completo)
ssh root@104.131.189.133 "cd /var/www/kdbweb && git pull origin master && systemctl restart kdbweb"

# Verificar que levantó bien
ssh root@104.131.189.133 "sleep 2 && systemctl is-active kdbweb"
```

---

## Flujo de deploy

**Cambios en frontend** (HTML/CSS/JS):
```bash
git add <archivos>
git commit -m "descripción"
git push origin master
ssh root@104.131.189.133 "cd /var/www/kdbweb && git pull origin master"
# NO necesita reiniciar kdbweb — Nginx sirve los archivos directamente
```

**Cambios en backend** (Python):
```bash
git add <archivos>
git commit -m "descripción"
git push origin master
ssh root@104.131.189.133 "cd /var/www/kdbweb && git pull origin master && systemctl restart kdbweb"
```

**Rama principal**: `master` (no existe `main`)

---

## Desarrollo local

```bash
# Activar entorno virtual
backend\venv\Scripts\activate   # Windows
# source backend/venv/bin/activate   # Linux/Mac

# Correr backend local
cd backend
python app.py
# → Escucha en http://127.0.0.1:5000

# El frontend puede abrirse directamente en el browser (file://)
# config.js detecta automáticamente si usar 127.0.0.1:5000 o el mismo origin
```

**Variables de entorno locales**: `backend/.env` (copiar de `.env.example`).
En local el `.env` puede dejarse con los defaults; S3 y mail son opcionales.

---

## API del backend

Todas las rutas están en `backend/app.py`. Resumen:

### Públicas (sin auth)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Healthcheck |
| GET | `/api/company` | Datos de la empresa |
| GET | `/api/pages` | Visibilidad de páginas |
| GET | `/api/page/<page>` | Contenido de una página (hero, team, etc.) |
| GET | `/api/publications` | Lista publicaciones activas |
| GET | `/api/publications/<id>` | Publicación por ID |
| GET | `/api/publications/slug/<slug>` | Publicación por slug |
| GET | `/api/kdbweb` | Entradas del módulo legal |
| GET | `/api/kdbweb/search?q=texto` | Búsqueda en el módulo legal |
| GET | `/api/kdbweb/<slug>` | Entrada legal por slug |
| GET | `/api/katweb/boletines` | Boletines del Tribunal Fiscal |
| GET | `/api/categories` | Categorías de publicaciones |
| POST | `/subscribe` | Registrar email (newsletter) |
| POST | `/api/contact` | Enviar mensaje de contacto |

### Requieren admin (`@require_admin`)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | Login admin |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Info del admin actual |
| GET/POST | `/auth/admins` | Listar/crear admins (solo `super`) |
| PUT/DELETE | `/auth/admins/<id>` | Editar/borrar admin (solo `super`) |
| GET/POST | `/config/company` | Datos de empresa |
| GET/POST | `/config/page/<page>` | Contenido editable de página |
| GET/POST | `/config/pages` | Visibilidad de páginas |
| POST | `/api/publications` | Crear publicación |
| PUT/DELETE | `/api/publications/<id>` | Editar/borrar publicación |
| POST | `/api/kdbweb` | Guardar entradas legales |
| POST | `/api/katweb/boletines` | Guardar boletines |
| GET | `/api/media` | Listar media en S3 |
| POST | `/api/media/presign` | URL para subir imagen a S3 |
| POST | `/api/media/delete` | Eliminar imagen de S3 |
| POST | `/api/media/rename` | Renombrar imagen en S3 |
| POST | `/api/media/folder` | Crear carpeta en S3 |
| GET | `/subscriptions` | Listar suscriptores |

### Auth
El token se pasa como `Authorization: Bearer <token>` o como cookie `admin_token`.
Roles: `super` (puede gestionar admins) y `editor`.
Bootstrap del primer admin: `POST /auth/bootstrap` (requiere `ADMIN_BOOTSTRAP_TOKEN` en prod).

---

## Base de datos (SQLite)

Tablas principales:

| Tabla | Contenido |
|---|---|
| `company_info` | Datos de la empresa (fila única, id=1) |
| `page_settings` | Visibilidad por página (habilitada/deshabilitada) |
| `hero_slides` | Slides del hero por página |
| `page_story` | Sección "historia/quiénes somos" por página |
| `page_about` | Sección "about" por página |
| `team_members` | Miembros del equipo por página |
| `team_meta` | Título/subtítulo de sección equipo |
| `services_items` | Servicios por página |
| `services_meta` | Título/subtítulo de sección servicios |
| `publications` | Artículos/publicaciones del blog |
| `categories` | Categorías de publicaciones |
| `kdbweb_entries` | Entradas del módulo legal (con `meta_json` estructurado) |
| `katweb_boletines` | Boletines del Tribunal Fiscal |
| `subscriptions` | Emails suscritos al newsletter |
| `contact_messages` | Mensajes del formulario de contacto |
| `admin_users` | Usuarios administradores |
| `admin_sessions` | Sesiones activas (tokens) |
| `db_migrations` | Registro de migraciones de una sola ejecución |

Las migraciones son inline en `db.py:init_db()`. Se ejecutan al iniciar la app con `ensure_db()`.

---

## Módulo KDBWEB (base legal)

Sección especial del sitio que expone jurisprudencia, legislación y doctrina tributaria peruana.

**Categorías raíz** (en orden de posición):
1. `constitucion` — Constitución
2. `tratados-internacionales` — Tratados Internacionales (tiene `meta_json` con lista de convenios CDI)
3. `legislacion-tributaria-aduanera` — Legislación (tiene `meta_json` con tabs: tributaria/aduanera)
4. `jurisprudencia` — Jurisprudencia
5. `doctrina` — Doctrina

**Subcategorías de `jurisprudencia`**:
- `tribunal-fiscal` — Resoluciones del Tribunal Fiscal (tiene boletines)
- `casaciones-de-la-corte-suprema` — Casaciones
- `sentencias-del-tc` — Sentencias del Tribunal Constitucional

Cada entrada tiene:
- Campos de hero (kicker, title, subtitle, image_url, CTAs)
- `content_html` — HTML libre sanitizado con bleach
- `meta_json` — JSON estructurado específico por tipo de página (convenios, tabs de legislación, categorías de doctrina, herramientas del Tribunal Fiscal)

**Invariante crítica**: `replace_kdbweb_entries()` tiene una "restore guard" — si el payload entrante tiene `meta_json` null para un slug que ya tenía datos, restaura el valor anterior. Esto previene que un bug en el frontend borre datos estructurados.

---

## Frontend — Páginas HTML

Cada página HTML carga sus datos dinámicamente llamando a la API:
- `js/config.js` — Define `window.API_BASE` (auto-detecta local vs producción)
- `js/api.js` — Funciones `fetch` centralizadas
- `js/header.js`, `js/footer.js` — Cargan `partials/header.html` y `partials/footer.html`
- `js/hero.js` — Renderiza slides del hero
- `js/content.js` — Renderiza secciones story/about/team/services

Páginas del módulo KDBWEB (`kdbweb-*.html`):
- Cada una llama a `/api/kdbweb/<slug>` para obtener su contenido
- Tienen renderers específicos según el tipo de contenido (convenios, legislación con tabs, etc.)

**Panel de administración**: `frontend/admin/index.html`
- JS: `admin/main.js`, `admin/editors.js`, `admin/utils.js`, `admin/katweb-admin.js`
- Gestiona toda la edición de contenido (requiere login)

---

## Nginx — Routing

| Ruta | Destino |
|---|---|
| `/admin/` | Alias a `frontend/admin/` (SPA-like con `try_files`) |
| `/auth/*` | Proxy → Gunicorn:8000 (con rate limit) |
| `/subscribe` | Proxy → Gunicorn:8000 (con rate limit) |
| `/api/contact` | Proxy → Gunicorn:8000 (con rate limit) |
| `/api/*`, `/config/*`, `/subscriptions/*`, `/health` | Proxy → Gunicorn:8000 |
| `/*` | Archivos estáticos de `frontend/` |

---

## Variables de entorno clave (`.env`)

| Variable | Descripción |
|---|---|
| `APP_ENV` | `production` o `development` |
| `SECRET_KEY` | Clave secreta Flask (obligatoria en prod) |
| `DB_PATH` | Ruta a SQLite. Default: `./subscriptions.db` en la carpeta del app |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciales S3 |
| `S3_BUCKET` | Nombre del bucket S3 |
| `S3_PUBLIC_BASE_URL` | URL base pública de imágenes S3 |
| `ADMIN_BOOTSTRAP_TOKEN` | Token requerido para crear el primer admin en prod |
| `MAIL_ENABLED` | `1` para activar envío de correos por contacto |
| `CORS_ENABLED` | `0` en prod (mismo origen), `1` en dev si frontend está en otro puerto |

---

## Cosas importantes a no romper

1. **No commitear** `backend/.env`, `backend/venv/`, `backend/data/`, `backend/subscriptions.db`
2. **`meta_json`** en `kdbweb_entries`: siempre preservar el restore guard en `models.py:replace_kdbweb_entries()`
3. **`db.py:init_db()`** corre en cada arranque — las migraciones deben ser idempotentes (usan `IF NOT EXISTS`, `INSERT OR IGNORE`, `ALTER TABLE` con try/except)
4. **El frontend usa `window.API_BASE`** — no hardcodear URLs de API en HTML/JS
5. **HTML sanitizado con bleach** — todo `content_html` pasa por bleach antes de guardarse
6. **Rate limiting** activo en `/auth/*`, `/subscribe`, `/api/contact` — en dev no aplica
7. **Rama `master`** — no existe rama `main`
