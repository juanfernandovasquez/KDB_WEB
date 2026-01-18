import json
import secrets
from datetime import datetime, timedelta

from flask import current_app

from db import get_conn

# sanitize/normalize HTML content stored by admin editors
import bleach
from bleach.css_sanitizer import CSSSanitizer
import html as _html
from werkzeug.security import check_password_hash, generate_password_hash
ALLOWED_TAGS = [
    "b",
    "strong",
    "i",
    "em",
    "u",
    "a",
    "ul",
    "ol",
    "li",
    "p",
    "br",
    "span",
    "div",
    "img",
]
ALLOWED_ATTRIBUTES = {
    "a": ["href", "target", "rel"],
    "img": ["src", "alt", "title", "class", "style"],
    "p": ["class", "style"],
    "span": ["class", "style"],
    "div": ["class", "style"],
}
# Allow safe sizing and alignment styles so texto e imagenes se centren si el editor los aplica
IMG_CSS_SANITIZER = CSSSanitizer(
    allowed_css_properties=[
        "font-size",
        "width",
        "height",
        "max-width",
        "text-align",
        "margin",
        "margin-left",
        "margin-right",
        "margin-top",
        "margin-bottom",
        "float",
        "display",
    ]
)


def fetch_company():
    conn = get_conn()
    row = conn.execute("SELECT * FROM company_info WHERE id = 1").fetchone()
    conn.close()
    return dict(row) if row else {}


def save_company(payload):
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO company_info (id, name, tagline, phone, email, address, linkedin, facebook, instagram)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              tagline=excluded.tagline,
              phone=excluded.phone,
              email=excluded.email,
              address=excluded.address,
              linkedin=excluded.linkedin,
              facebook=excluded.facebook,
              instagram=excluded.instagram
            """,
            (
                payload.get("name"),
                payload.get("tagline"),
                payload.get("phone"),
                payload.get("email"),
                payload.get("address"),
                payload.get("linkedin"),
                payload.get("facebook"),
                payload.get("instagram"),
            ),
        )
    conn.close()


def fetch_hero(page):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM hero_slides WHERE page = ? ORDER BY position",
        (page,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def replace_hero(page, slides):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM hero_slides WHERE page = ?", (page,))
        for pos, slide in enumerate(slides):
            conn.execute(
                """
                INSERT INTO hero_slides (page, position, title, description, primary_label, primary_href, secondary_label, secondary_href, image_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    page,
                    pos,
                    slide.get("title"),
                    slide.get("description"),
                    slide.get("primary_label"),
                    slide.get("primary_href"),
                    slide.get("secondary_label"),
                    slide.get("secondary_href"),
                    slide.get("image_url"),
                    now,
                    now,
                ),
            )
    conn.close()


def fetch_story(page):
    conn = get_conn()
    row = conn.execute(
        "SELECT page, title, paragraphs, content_html FROM page_story WHERE page = ?",
        (page,),
    ).fetchone()
    conn.close()
    if not row:
        return {}
    data = dict(row)
    try:
        data["paragraphs"] = json.loads(data.get("paragraphs") or "[]")
    except json.JSONDecodeError:
        data["paragraphs"] = []
    return {
        "title": data.get("title"),
        "paragraphs": data.get("paragraphs", []),
        "html": data.get("content_html"),
    }


def save_story(page, story):
    title = story.get("title")
    paragraphs = story.get("paragraphs") or []
    html = story.get("html") or story.get("content_html")
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO page_story (page, title, paragraphs, content_html)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(page) DO UPDATE SET
              title=excluded.title,
              paragraphs=excluded.paragraphs,
              content_html=excluded.content_html
            """,
            (page, title, json.dumps(paragraphs), html),
        )
    conn.close()


def fetch_about(page):
    conn = get_conn()
    row = conn.execute("SELECT * FROM page_about WHERE page = ?", (page,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def save_about(page, about):
    fields = [
        "title",
        "content",
        "image_url",
        "primary_label",
        "primary_href",
        "secondary_label",
        "secondary_href",
    ]
    values = [about.get(f) for f in fields]
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO page_about (page, title, content, image_url, primary_label, primary_href, secondary_label, secondary_href)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(page) DO UPDATE SET
              title=excluded.title,
              content=excluded.content,
              image_url=excluded.image_url,
              primary_label=excluded.primary_label,
              primary_href=excluded.primary_href,
              secondary_label=excluded.secondary_label,
              secondary_href=excluded.secondary_href
            """,
            [page] + values,
        )
    conn.close()


def fetch_team(page):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM team_members WHERE page = ? ORDER BY position",
        (page,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_team_meta(page):
    conn = get_conn()
    row = conn.execute("SELECT * FROM team_meta WHERE page = ?", (page,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def replace_team(page, members):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM team_members WHERE page = ?", (page,))
        for pos, m in enumerate(members):
            conn.execute(
                """
                INSERT INTO team_members (page, position, name, role, image_url, linkedin, more_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    page,
                    pos,
                    m.get("name"),
                    m.get("role"),
                    m.get("image_url"),
                    m.get("linkedin"),
                    m.get("more_url"),
                ),
            )
    conn.close()


def save_team_meta(page, meta):
    conn = get_conn()
    title = meta.get("title")
    subtitle = meta.get("subtitle")
    with conn:
        conn.execute(
            """
            INSERT INTO team_meta (page, title, subtitle)
            VALUES (?, ?, ?)
            ON CONFLICT(page) DO UPDATE SET
              title=excluded.title,
              subtitle=excluded.subtitle
            """,
            (page, title, subtitle),
        )
    conn.close()


def fetch_services(page):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM services_items WHERE page = ? ORDER BY position",
        (page,),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        data = dict(r)
        try:
            data["bullets"] = json.loads(data.get("bullets") or "[]")
        except json.JSONDecodeError:
            data["bullets"] = []
        result.append(data)
    return result


def fetch_services_meta(page):
    conn = get_conn()
    row = conn.execute("SELECT * FROM services_meta WHERE page = ?", (page,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def replace_services(page, services):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM services_items WHERE page = ?", (page,))
        for pos, s in enumerate(services):
            bullets = s.get("bullets") or []
            conn.execute(
                """
                INSERT INTO services_items (page, position, title, description, bullets)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    page,
                    pos,
                    s.get("title"),
                    s.get("description"),
                    json.dumps(bullets),
                ),
            )
    conn.close()


def save_services_meta(page, meta):
    conn = get_conn()
    title = meta.get("title")
    subtitle = meta.get("subtitle")
    with conn:
        conn.execute(
            """
            INSERT INTO services_meta (page, title, subtitle)
            VALUES (?, ?, ?)
            ON CONFLICT(page) DO UPDATE SET
              title=excluded.title,
              subtitle=excluded.subtitle
            """,
            (page, title, subtitle),
        )
    conn.close()


def fetch_subscriptions(limit=500):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, email, created_at FROM subscriptions ORDER BY datetime(created_at) DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_subscription(sub_id):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM subscriptions WHERE id = ?", (sub_id,))
    conn.close()


def save_contact_message(payload, ip=None, user_agent=None):
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = (payload.get("phone") or "").strip()
    subject = (payload.get("subject") or "").strip()
    message = (payload.get("message") or "").strip()
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO contact_messages (name, email, phone, subject, message, ip, user_agent, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
            """,
            (name, email, phone, subject, message, ip, user_agent, now),
        )
    conn.close()


def fetch_contact_messages(limit=200):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT id, name, email, phone, subject, message, status, created_at
        FROM contact_messages
        ORDER BY datetime(created_at) DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_contact_message(message_id):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM contact_messages WHERE id = ?", (message_id,))
    conn.close()

# -- Categorías publicaciones
def fetch_categories():
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT c.id, c.name, COUNT(p.id) AS posts
        FROM categories c
        LEFT JOIN publications p ON p.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_category(payload):
    name = payload.get("name")
    if not name:
        return
    conn = get_conn()
    with conn:
        conn.execute(
            "INSERT INTO categories (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name=excluded.name",
            (name,),
        )
    conn.close()


def delete_category(cat_id):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    conn.close()




def fetch_publications(active_only=False):
    conn = get_conn()
    base_sql = (
        "SELECT p.id, p.title, p.slug, p.excerpt, p.content_html, p.author, "
        "p.hero_title, p.hero_subtitle, p.hero_image_url, p.hero_cta_label, p.hero_cta_href, "
        "p.category_id, c.name as category, "
        "p.published_at, p.created_at, p.updated_at, p.active "
        "FROM publications p LEFT JOIN categories c ON p.category_id = c.id "
    )
    where = "WHERE p.active = 1 " if active_only else ""
    sql = base_sql + where + "ORDER BY datetime(p.published_at) DESC"
    rows = conn.execute(sql).fetchall()
    result = []
    for r in rows:
        data = dict(r)
        result.append(data)
    conn.close()
    return result


def fetch_publication(pub_id):
    conn = get_conn()
    row = conn.execute(
        "SELECT p.id, p.title, p.slug, p.excerpt, p.content_html, p.author, "
        "p.hero_title, p.hero_subtitle, p.hero_image_url, p.hero_cta_label, p.hero_cta_href, "
        "p.category_id, c.name as category, p.published_at, p.created_at, p.updated_at, p.active "
        "FROM publications p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?",
        (pub_id,),
    ).fetchone()
    if not row:
        conn.close()
        return {}
    data = dict(row)
    conn.close()
    return data


def fetch_publication_by_slug(slug):
    conn = get_conn()
    row = conn.execute(
        "SELECT p.id, p.title, p.slug, p.excerpt, p.content_html, p.author, "
        "p.hero_title, p.hero_subtitle, p.hero_image_url, p.hero_cta_label, p.hero_cta_href, "
        "p.category_id, c.name as category, p.published_at, p.created_at, p.updated_at, p.active "
        "FROM publications p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ? AND p.active = 1",
        (slug,),
    ).fetchone()
    if not row:
        conn.close()
        return {}
    data = dict(row)
    conn.close()
    return data


def save_publication(payload):
    title = payload.get("title")
    slug = payload.get("slug")
    excerpt = ""  # excerpt removed from UI; keep empty
    content_raw = payload.get("content_html") or payload.get("html") or ""
    excerpt_raw = ""
    author = (payload.get("author") or "").strip()
    # Unescape HTML entities that may have been double-escaped in older content
    try:
        for _ in range(3):
            new = _html.unescape(content_raw)
            if new == content_raw:
                break
            content_raw = new
        for _ in range(3):
            newe = _html.unescape(excerpt_raw)
            if newe == excerpt_raw:
                break
            excerpt_raw = newe
    except Exception:
        pass

    # Normalize / sanitize editor HTML to fix nesting and remove unsafe tags/attrs
    try:
        # Enforce http/https-only images; no data: URLs
        allowed_protocols = list(bleach.sanitizer.ALLOWED_PROTOCOLS)
        content = bleach.clean(
            content_raw,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRIBUTES,
            protocols=allowed_protocols,
            css_sanitizer=IMG_CSS_SANITIZER,
            strip=True,
        )
        excerpt = ""
    except Exception:
        # Fallback to raw strings if sanitization unexpectedly fails
        content = content_raw
        excerpt = excerpt_raw

    category_id = payload.get("category_id")
    # coerce numeric strings to int (the client sends category id as string sometimes)
    if isinstance(category_id, str) and category_id.isdigit():
        category_id = int(category_id)
    # allow passing category name
    if not category_id and payload.get("category"):
        conn = get_conn()
        try:
            row = conn.execute("SELECT id FROM categories WHERE name = ?", (payload.get("category"),)).fetchone()
            if row:
                category_id = row["id"]
        finally:
            conn.close()
    if not category_id:
        raise ValueError("Category is required for a publication")

    published_at = payload.get("published_at")
    # Normalize published_at: if provided, coerce to YYYY-MM-DD; if not provided or empty, set to today's date (UTC)
    if published_at:
        try:
            # Accept full ISO datetimes or date strings
            parsed = datetime.fromisoformat(published_at)
            published_at = parsed.date().isoformat()
        except Exception:
            try:
                parsed = datetime.strptime(published_at, "%Y-%m-%d")
                published_at = parsed.date().isoformat()
            except Exception:
                raise ValueError("published_at must be a date string in YYYY-MM-DD format")
    else:
        published_at = datetime.utcnow().date().isoformat()

    active = payload.get("active", 1)
    active = 1 if str(active).lower() in ("1", "true", "yes", "on") else 0
    hero_title = (payload.get("hero_title") or "").strip()
    hero_subtitle = (payload.get("hero_subtitle") or "").strip()
    hero_image_url = (payload.get("hero_image_url") or "").strip()
    hero_cta_label = (payload.get("hero_cta_label") or "").strip()
    hero_cta_href = (payload.get("hero_cta_href") or "").strip()
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        if payload.get("id"):
            conn.execute(
                "UPDATE publications SET title=?, slug=?, excerpt=?, content_html=?, author=?, hero_title=?, hero_subtitle=?, hero_image_url=?, hero_cta_label=?, hero_cta_href=?, category_id=?, published_at=?, active=?, updated_at=? WHERE id = ?",
                (
                    title,
                    slug,
                    excerpt,
                    content,
                    author,
                    hero_title,
                    hero_subtitle,
                    hero_image_url,
                    hero_cta_label,
                    hero_cta_href,
                    category_id,
                    published_at,
                    active,
                    now,
                    payload.get("id"),
                ),
            )
            pub_id = payload.get("id")
        else:
            conn.execute(
                "INSERT INTO publications (title, slug, excerpt, content_html, author, hero_title, hero_subtitle, hero_image_url, hero_cta_label, hero_cta_href, category_id, published_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    title,
                    slug,
                    excerpt,
                    content,
                    author,
                    hero_title,
                    hero_subtitle,
                    hero_image_url,
                    hero_cta_label,
                    hero_cta_href,
                    category_id,
                    published_at,
                    active,
                    now,
                    now,
                ),
            )
            pub_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
    conn.close()


# --- KDBWEB entries ---
def fetch_kdbweb_entries():
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT id, position, slug, parent_slug, title, card_title, summary, hero_kicker, hero_title, hero_subtitle,
               hero_image_url, hero_primary_label, hero_primary_href, hero_secondary_label,
               hero_secondary_href, content_html
        FROM kdbweb_entries
        ORDER BY position
        """,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_kdbweb_entry_by_slug(slug):
    conn = get_conn()
    row = conn.execute(
        """
        SELECT id, position, slug, parent_slug, title, card_title, summary, hero_kicker, hero_title, hero_subtitle,
               hero_image_url, hero_primary_label, hero_primary_href, hero_secondary_label,
               hero_secondary_href, content_html
        FROM kdbweb_entries
        WHERE slug = ?
        """,
        (slug,),
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


def replace_kdbweb_entries(entries):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM kdbweb_entries")
        for pos, entry in enumerate(entries or []):
            content_raw = entry.get("content_html") or ""
            try:
                allowed_protocols = list(bleach.sanitizer.ALLOWED_PROTOCOLS)
                content = bleach.clean(
                    content_raw,
                    tags=ALLOWED_TAGS,
                    attributes=ALLOWED_ATTRIBUTES,
                    protocols=allowed_protocols,
                    css_sanitizer=IMG_CSS_SANITIZER,
                    strip=True,
                )
            except Exception:
                content = content_raw
            conn.execute(
                """
                INSERT INTO kdbweb_entries (
                  position,
                  slug,
                  parent_slug,
                  title,
                  card_title,
                  summary,
                  hero_kicker,
                  hero_title,
                  hero_subtitle,
                  hero_image_url,
                  hero_primary_label,
                  hero_primary_href,
                  hero_secondary_label,
                  hero_secondary_href,
                  content_html,
                  created_at,
                  updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pos,
                    entry.get("slug"),
                    entry.get("parent_slug"),
                    entry.get("title"),
                    entry.get("card_title"),
                    entry.get("summary"),
                    entry.get("hero_kicker"),
                    entry.get("hero_title"),
                    entry.get("hero_subtitle"),
                    entry.get("hero_image_url"),
                    entry.get("hero_primary_label"),
                    entry.get("hero_primary_href"),
                    entry.get("hero_secondary_label"),
                    entry.get("hero_secondary_href"),
                    content,
                    now,
                    now,
                ),
            )
    conn.close()
    return len(entries or [])


def delete_publication(pub_id):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM publications WHERE id = ?", (pub_id,))
    conn.close()


def get_page_data(page):
    base = {
        "hero": fetch_hero(page),
        "story": fetch_story(page),
        "team": fetch_team(page),
        "about": fetch_about(page),
        "team_meta": fetch_team_meta(page),
        "services": fetch_services(page),
        "services_meta": fetch_services_meta(page),
    }
    if page == "publicaciones":
        base["publications"] = fetch_publications(active_only=True)
    return base


def fetch_page_settings():
    conn = get_conn()
    rows = conn.execute("SELECT page, enabled FROM page_settings").fetchall()
    conn.close()
    return {row["page"]: bool(row["enabled"]) for row in rows}


def save_page_settings(pages):
    if not isinstance(pages, dict):
        return
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        for page, enabled in pages.items():
            conn.execute(
                """
                INSERT INTO page_settings (page, enabled, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(page) DO UPDATE SET
                  enabled=excluded.enabled,
                  updated_at=excluded.updated_at
                """,
                (page, 1 if bool(enabled) else 0, now),
            )
    conn.close()


def is_page_enabled(page):
    conn = get_conn()
    row = conn.execute("SELECT enabled FROM page_settings WHERE page = ?", (page,)).fetchone()
    conn.close()
    if row is None:
        return True
    return bool(row["enabled"])


# --- Admin auth helpers ---

def fetch_admin_by_username(username):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM admin_users WHERE username = ?",
        (username,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def fetch_admin_by_id(admin_id):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM admin_users WHERE id = ?",
        (admin_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def list_admins():
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, username, role, active, created_at, updated_at FROM admin_users ORDER BY id ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def admins_exist():
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) AS c FROM admin_users").fetchone()["c"]
    conn.close()
    return count > 0


def create_admin_user(username, password, role="editor", active=True):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        cur = conn.execute(
            """
            INSERT INTO admin_users (username, password_hash, role, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                username.strip(),
                generate_password_hash(password),
                role,
                1 if active else 0,
                now,
                now,
            ),
        )
    admin_id = cur.lastrowid
    conn.close()
    return admin_id


def update_admin_user(admin_id, role=None, active=None, password=None, username=None):
    fields = []
    values = []
    if username is not None:
        fields.append("username = ?")
        values.append(username.strip())
    if role is not None:
        fields.append("role = ?")
        values.append(role)
    if active is not None:
        fields.append("active = ?")
        values.append(1 if active else 0)
    if password:
        fields.append("password_hash = ?")
        values.append(generate_password_hash(password))
    if not fields:
        return
    fields.append("updated_at = ?")
    values.append(datetime.utcnow().isoformat())
    values.append(admin_id)
    conn = get_conn()
    with conn:
        conn.execute(
            f"UPDATE admin_users SET {', '.join(fields)} WHERE id = ?",
            values,
        )
    conn.close()


def delete_admin_user(admin_id):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM admin_users WHERE id = ?", (admin_id,))
        conn.execute("DELETE FROM admin_sessions WHERE admin_id = ?", (admin_id,))
    conn.close()


def authenticate_admin(username, password):
    admin = fetch_admin_by_username(username)
    if not admin or not admin.get("active"):
        return None
    if not check_password_hash(admin.get("password_hash", ""), password):
        return None
    return admin


def create_admin_session(admin_id, ttl_hours=8):
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=ttl_hours)
    token = secrets.token_urlsafe(32)
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO admin_sessions (admin_id, token, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (admin_id, token, now.isoformat(), expires_at.isoformat()),
        )
    conn.close()
    return token, expires_at.isoformat()


def get_admin_by_token(token):
    if not token:
        return None
    conn = get_conn()
    row = conn.execute(
        """
        SELECT u.id, u.username, u.role, u.active, s.token, s.expires_at
        FROM admin_sessions s
        JOIN admin_users u ON u.id = s.admin_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    conn.close()
    if not row:
        return None
    data = dict(row)
    if not data.get("active"):
        return None
    expires_at = data.get("expires_at") or ""
    if expires_at and expires_at < datetime.utcnow().isoformat():
        return None
    return data


def revoke_admin_session(token):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
    conn.close()
