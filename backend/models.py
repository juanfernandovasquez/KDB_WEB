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
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "p",
    "br",
    "span",
    "mark",
    "div",
    "img",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
    "table",
    "colgroup",
    "col",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
]
ALLOWED_ATTRIBUTES = {
    "a": ["href", "target", "rel"],
    "img": ["src", "alt", "title", "class", "style"],
    "p": ["class", "style"],
    "span": ["class", "style", "data-color"],
    "mark": ["class", "style", "data-color"],
    "div": ["class", "style"],
    "h1": ["class", "style"],
    "h2": ["class", "style"],
    "h3": ["class", "style"],
    "h4": ["class", "style"],
    "h5": ["class", "style"],
    "h6": ["class", "style"],
    "blockquote": ["class", "style"],
    "table": ["class", "style"],
    "colgroup": ["class", "style"],
    "col": ["class", "style", "span", "width"],
    "thead": ["class", "style"],
    "tbody": ["class", "style"],
    "tr": ["class", "style"],
    "th": ["class", "style", "colspan", "rowspan", "colwidth", "data-colwidth", "width"],
    "td": ["class", "style", "colspan", "rowspan", "colwidth", "data-colwidth", "width"],
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
        "color",
        "background-color",
        "text-decoration",
        "text-decoration-color",
        "text-decoration-line",
        "text-decoration-thickness",
        "line-height",
        "font-weight",
        "border",
        "border-collapse",
        "padding",
        "vertical-align",
    ]
)

TITLE_ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "br", "span"]
TITLE_ALLOWED_ATTRIBUTES = {
    "span": ["class", "style"],
}


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
            INSERT INTO company_info (id, name, tagline, phone, email, address, logo_url, favicon_url, linkedin, facebook, instagram)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              tagline=excluded.tagline,
              phone=excluded.phone,
              email=excluded.email,
              address=excluded.address,
              logo_url=excluded.logo_url,
              favicon_url=excluded.favicon_url,
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
                payload.get("logo_url"),
                payload.get("favicon_url"),
                payload.get("linkedin"),
                payload.get("facebook"),
                payload.get("instagram"),
            ),
        )
    conn.close()


def set_brochure_url(url):
    conn = get_conn()
    with conn:
        conn.execute(
            "UPDATE company_info SET brochure_url = ? WHERE id = 1",
            (url or None,),
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
        "SELECT page, title, paragraphs, content_html, image_url FROM page_story WHERE page = ?",
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
        "image_url": data.get("image_url"),
    }


def save_story(page, story):
    title_raw = story.get("title") or ""
    paragraphs = story.get("paragraphs") or []
    html = story.get("html") or story.get("content_html")
    image_url = story.get("image_url")
    try:
        for _ in range(3):
            new_title = _html.unescape(title_raw)
            if new_title == title_raw:
                break
            title_raw = new_title
    except Exception:
        pass
    try:
        title = bleach.clean(
            title_raw,
            tags=TITLE_ALLOWED_TAGS,
            attributes=TITLE_ALLOWED_ATTRIBUTES,
            css_sanitizer=IMG_CSS_SANITIZER,
            strip=True,
        )
    except Exception:
        title = title_raw
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO page_story (page, title, paragraphs, content_html, image_url)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(page) DO UPDATE SET
              title=excluded.title,
              paragraphs=excluded.paragraphs,
              content_html=excluded.content_html,
              image_url=excluded.image_url
            """,
            (page, title, json.dumps(paragraphs), html, image_url),
        )
    conn.close()


def fetch_about(page):
    conn = get_conn()
    row = conn.execute("SELECT * FROM page_about WHERE page = ?", (page,)).fetchone()
    conn.close()
    return dict(row) if row else {}


def save_about(page, about):
    title_raw = about.get("title") or ""
    content_raw = about.get("content") or ""
    try:
        for _ in range(3):
            new_title = _html.unescape(title_raw)
            if new_title == title_raw:
                break
            title_raw = new_title
        for _ in range(3):
            new_content = _html.unescape(content_raw)
            if new_content == content_raw:
                break
            content_raw = new_content
    except Exception:
        pass
    try:
        title = bleach.clean(
            title_raw,
            tags=TITLE_ALLOWED_TAGS,
            attributes=TITLE_ALLOWED_ATTRIBUTES,
            css_sanitizer=IMG_CSS_SANITIZER,
            strip=True,
        )
    except Exception:
        title = title_raw
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
    fields = [
        "title",
        "content",
        "image_url",
        "primary_label",
        "primary_href",
        "secondary_label",
        "secondary_href",
    ]
    normalized = {**about, "title": title, "content": content}
    values = [normalized.get(f) for f in fields]
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
        data["icon"] = data.get("icon_url") or ""
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
            description_raw = _html.unescape((s.get("description") or "").strip())
            try:
                allowed_protocols = list(bleach.sanitizer.ALLOWED_PROTOCOLS)
                description = bleach.clean(
                    description_raw,
                    tags=ALLOWED_TAGS,
                    attributes=ALLOWED_ATTRIBUTES,
                    protocols=allowed_protocols,
                    css_sanitizer=IMG_CSS_SANITIZER,
                    strip=True,
                )
            except Exception:
                description = description_raw
            conn.execute(
                """
                INSERT INTO services_items (page, position, title, description, bullets, image_url, icon_url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    page,
                    pos,
                    s.get("title"),
                    description,
                    json.dumps(bullets),
                    s.get("image_url"),
                    s.get("icon_url") or s.get("icon"),
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
               hero_secondary_href, content_html, meta_json
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
               hero_secondary_href, content_html, meta_json
        FROM kdbweb_entries
        WHERE slug = ?
        """,
        (slug,),
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


def replace_kdbweb_entries(entries):
    import json as _json
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        # ── Safety snapshot ──────────────────────────────────────────────────
        # Before wiping the table, save every slug's existing meta_json.
        # If the incoming payload for that slug has null/invalid meta_json we
        # RESTORE the snapshot instead of silently dropping structured data.
        # This means a frontend bug or a failed detail-fetch can NEVER destroy
        # meta_json that already lived in the database.
        existing_meta = {}
        for row in conn.execute("SELECT slug, meta_json FROM kdbweb_entries").fetchall():
            if row["meta_json"]:
                existing_meta[row["slug"]] = row["meta_json"]
        # ─────────────────────────────────────────────────────────────────────

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
            # meta_json: store as raw JSON string (validated to be valid JSON if present)
            meta_raw = entry.get("meta_json") or None
            if meta_raw:
                try:
                    _json.loads(meta_raw)  # validate JSON
                except Exception:
                    meta_raw = None
            # ── Restore guard ────────────────────────────────────────────────
            # If we ended up with null meta_json but the DB previously had a
            # valid value for this slug, put it back.  The frontend must send
            # an explicit non-null value to overwrite; absence = preserve.
            slug = entry.get("slug")
            if meta_raw is None and slug in existing_meta:
                meta_raw = existing_meta[slug]
            # ─────────────────────────────────────────────────────────────────
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
                  meta_json,
                  created_at,
                  updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    meta_raw,
                    now,
                    now,
                ),
            )
    conn.close()
    return len(entries or [])


# --- KATWeb Boletines (Tribunal Fiscal) ---
def fetch_katweb_boletines():
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT id, year, month_label, pdf_url, position
        FROM katweb_boletines
        ORDER BY year DESC, position ASC
        """,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def replace_katweb_boletines(boletines):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM katweb_boletines")
        for pos, b in enumerate(boletines or []):
            conn.execute(
                """
                INSERT INTO katweb_boletines (year, month_label, pdf_url, position, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    b.get("year"),
                    b.get("month_label"),
                    b.get("pdf_url"),
                    pos,
                    now,
                    now,
                ),
            )
    conn.close()
    return len(boletines or [])


def update_all_url_references(old_url, new_url):
    """Replace every occurrence of old_url with new_url in all tables that store image URLs."""
    if not old_url or not new_url or old_url == new_url:
        return
    url_columns = [
        ("company_info",   ["logo_url", "favicon_url"]),
        ("hero_slides",    ["image_url"]),
        ("page_story",     ["image_url"]),
        ("page_about",     ["image_url"]),
        ("team_members",   ["image_url"]),
        ("services_items", ["image_url", "icon_url"]),
        ("publications",   ["hero_image_url", "content_html"]),
        ("kdbweb_entries", ["hero_image_url", "content_html", "meta_json"]),
    ]
    conn = get_conn()
    with conn:
        for table, cols in url_columns:
            for col in cols:
                conn.execute(
                    f"UPDATE {table} SET {col} = REPLACE({col}, ?, ?)"
                    f" WHERE instr(COALESCE({col}, ''), ?) > 0",
                    (old_url, new_url, old_url),
                )
    conn.close()


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


# ─── Academia: Courses ────────────────────────────────────────────────────────

def _course_row_to_dict(row):
    d = dict(row)
    for key in ("what_you_learn", "includes_list", "audience", "instructors"):
        raw = d.get(key)
        if raw:
            try:
                d[key] = json.loads(raw)
            except Exception:
                d[key] = []
        else:
            d[key] = []
    return d


def _attach_modules(conn, course_id):
    modules = conn.execute(
        "SELECT * FROM course_modules WHERE course_id = ? ORDER BY position",
        (course_id,),
    ).fetchall()
    result = []
    for m in modules:
        md = dict(m)
        lessons = conn.execute(
            "SELECT * FROM course_lessons WHERE module_id = ? ORDER BY position",
            (m["id"],),
        ).fetchall()
        md["lessons"] = [dict(l) for l in lessons]
        result.append(md)
    return result


def fetch_courses(published_only=True, category=None):
    conn = get_conn()
    q = "SELECT * FROM courses"
    params = []
    conditions = []
    if published_only:
        conditions.append("is_published = 1")
    if category:
        conditions.append("category = ?")
        params.append(category)
    if conditions:
        q += " WHERE " + " AND ".join(conditions)
    q += " ORDER BY position ASC, id ASC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [_course_row_to_dict(r) for r in rows]


def fetch_course_by_slug(slug, published_only=True):
    conn = get_conn()
    q = "SELECT * FROM courses WHERE slug = ?"
    params = [slug]
    if published_only:
        q += " AND is_published = 1"
    row = conn.execute(q, params).fetchone()
    if not row:
        conn.close()
        return None
    course = _course_row_to_dict(row)
    course["modules"] = _attach_modules(conn, course["id"])
    conn.close()
    return course


def fetch_course_by_id(course_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
    if not row:
        conn.close()
        return None
    course = _course_row_to_dict(row)
    course["modules"] = _attach_modules(conn, course["id"])
    conn.close()
    return course


def save_course(payload, course_id=None):
    now = datetime.utcnow().isoformat()

    def _json_list(key):
        val = payload.get(key)
        if isinstance(val, list):
            return json.dumps(val)
        if isinstance(val, str):
            return val  # already serialized
        return json.dumps([])

    conn = get_conn()
    with conn:
        if course_id:
            conn.execute(
                """
                UPDATE courses SET
                  slug=?, title=?, subtitle=?, description=?, category=?,
                  price=?, original_price=?, image_url=?, duration=?,
                  modules_count=?, lessons_count=?, level=?, is_published=?,
                  position=?, moodle_course_id=?,
                  what_you_learn=?, includes_list=?, audience=?, instructors=?,
                  video_url=?, updated_at=?
                WHERE id=?
                """,
                (
                    payload.get("slug"),
                    payload.get("title"),
                    payload.get("subtitle"),
                    payload.get("description"),
                    payload.get("category"),
                    payload.get("price", 0),
                    payload.get("original_price"),
                    payload.get("image_url"),
                    payload.get("duration"),
                    payload.get("modules_count", 0),
                    payload.get("lessons_count", 0),
                    payload.get("level", "Todos los niveles"),
                    1 if payload.get("is_published") else 0,
                    payload.get("position", 0),
                    payload.get("moodle_course_id"),
                    _json_list("what_you_learn"),
                    _json_list("includes_list"),
                    _json_list("audience"),
                    _json_list("instructors"),
                    payload.get("video_url") or None,
                    now,
                    course_id,
                ),
            )
            cid = course_id
        else:
            cur = conn.execute(
                """
                INSERT INTO courses (slug, title, subtitle, description, category,
                  price, original_price, image_url, duration,
                  modules_count, lessons_count, level, is_published,
                  position, moodle_course_id,
                  what_you_learn, includes_list, audience, instructors,
                  video_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.get("slug"),
                    payload.get("title"),
                    payload.get("subtitle"),
                    payload.get("description"),
                    payload.get("category"),
                    payload.get("price", 0),
                    payload.get("original_price"),
                    payload.get("image_url"),
                    payload.get("duration"),
                    payload.get("modules_count", 0),
                    payload.get("lessons_count", 0),
                    payload.get("level", "Todos los niveles"),
                    1 if payload.get("is_published") else 0,
                    payload.get("position", 0),
                    payload.get("moodle_course_id"),
                    _json_list("what_you_learn"),
                    _json_list("includes_list"),
                    _json_list("audience"),
                    _json_list("instructors"),
                    payload.get("video_url") or None,
                    now,
                    now,
                ),
            )
            cid = cur.lastrowid

        # Replace modules + lessons if provided
        if "modules" in payload:
            conn.execute("DELETE FROM course_modules WHERE course_id = ?", (cid,))
            for mi, mod in enumerate(payload.get("modules") or []):
                mod_cur = conn.execute(
                    """
                    INSERT INTO course_modules (course_id, position, title, duration, lessons_count)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (cid, mi, mod.get("title"), mod.get("duration"), mod.get("lessons_count", 0)),
                )
                mid = mod_cur.lastrowid
                for li, lesson in enumerate(mod.get("lessons") or []):
                    conn.execute(
                        """
                        INSERT INTO course_lessons (module_id, position, title, duration, type)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (mid, li, lesson.get("title"), lesson.get("duration"), lesson.get("type", "video")),
                    )
    conn.close()
    return cid


def delete_course(course_id):
    conn = get_conn()
    with conn:
        conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    conn.close()


# ─── Academia: Course Categories ──────────────────────────────────────────────

def get_course_categories():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM course_categories ORDER BY position ASC, label ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_course_category(slug, label, position):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    try:
        with conn:
            conn.execute(
                "INSERT INTO course_categories (slug, label, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (slug, label, position, now, now),
            )
            row = conn.execute(
                "SELECT * FROM course_categories WHERE slug = ?", (slug,)
            ).fetchone()
        return dict(row)
    finally:
        conn.close()


def update_course_category(cat_id, slug, label, position):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    try:
        with conn:
            conn.execute(
                "UPDATE course_categories SET slug=?, label=?, position=?, updated_at=? WHERE id=?",
                (slug, label, position, now, cat_id),
            )
            row = conn.execute(
                "SELECT * FROM course_categories WHERE id = ?", (cat_id,)
            ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_course_category(cat_id):
    conn = get_conn()
    try:
        with conn:
            conn.execute("DELETE FROM course_categories WHERE id=?", (cat_id,))
    finally:
        conn.close()


# ─── Academia: Orders ─────────────────────────────────────────────────────────

def create_order(payload):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        cur = conn.execute(
            """
            INSERT INTO orders (
              course_id, course_title, student_name, student_email,
              amount, status, payment_method, payment_method_detail,
              operation_number, voucher_url,
              gateway_ref, notes,
              comprobante_type, taxpayer_id, taxpayer_name,
              created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.get("course_id"),
                payload.get("course_title"),
                payload.get("student_name"),
                payload.get("student_email"),
                payload.get("amount", 0),
                payload.get("payment_method", "transferencia"),
                payload.get("payment_method_detail"),
                payload.get("operation_number") or None,
                payload.get("voucher_url") or None,
                payload.get("gateway_ref"),
                payload.get("notes"),
                payload.get("comprobante_type", "boleta"),
                payload.get("taxpayer_id"),
                payload.get("taxpayer_name"),
                now,
                now,
            ),
        )
        order_id = cur.lastrowid
    conn.close()
    return order_id


def update_order_status(order_id, status, gateway_ref=None):
    now = datetime.utcnow().isoformat()
    conn = get_conn()
    with conn:
        if gateway_ref:
            conn.execute(
                "UPDATE orders SET status=?, gateway_ref=?, updated_at=? WHERE id=?",
                (status, gateway_ref, now, order_id),
            )
        else:
            conn.execute(
                "UPDATE orders SET status=?, updated_at=? WHERE id=?",
                (status, now, order_id),
            )
    conn.close()


def admin_update_order(order_id, data):
    """Partial update of an order for admin actions."""
    now = datetime.utcnow().isoformat()
    allowed = {
        "status", "gateway_ref", "notes",
        "comprobante_number", "comprobante_issued_at",
        "moodle_enrolled", "moodle_enrolled_at", "moodle_user_email", "moodle_user_id",
        "payment_method", "operation_number", "voucher_url", "comprobante_url",
    }
    sets = []
    params = []
    for key, val in data.items():
        if key in allowed:
            sets.append(f"{key}=?")
            params.append(val)
    if not sets:
        return
    sets.append("updated_at=?")
    params.append(now)
    params.append(order_id)
    conn = get_conn()
    with conn:
        conn.execute(f"UPDATE orders SET {', '.join(sets)} WHERE id=?", params)
    conn.close()


def fetch_order_by_id(order_id):
    conn = get_conn()
    row = conn.execute(
        "SELECT o.*, c.slug AS course_slug, c.moodle_course_id FROM orders o LEFT JOIN courses c ON o.course_id = c.id WHERE o.id = ?",
        (order_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def fetch_orders(status=None):
    conn = get_conn()
    q = "SELECT o.*, c.slug AS course_slug FROM orders o LEFT JOIN courses c ON o.course_id = c.id"
    params = []
    if status:
        q += " WHERE o.status = ?"
        params.append(status)
    q += " ORDER BY o.created_at DESC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_students():
    """Retorna alumnos únicos (por email) con resumen de sus órdenes."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT
            o.student_email,
            o.student_name,
            o.moodle_user_email,
            COUNT(o.id)                                          AS total_orders,
            SUM(CASE WHEN o.status='paid' THEN 1 ELSE 0 END)    AS paid_orders,
            SUM(CASE WHEN o.status='paid' THEN o.amount ELSE 0 END) AS total_paid,
            SUM(CASE WHEN o.moodle_enrolled=1 THEN 1 ELSE 0 END) AS enrolled_count,
            MAX(o.created_at)                                    AS last_order_at
        FROM orders o
        GROUP BY o.student_email
        ORDER BY last_order_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def fetch_student_orders(student_email):
    """Retorna todas las órdenes de un alumno específico."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT o.*, c.slug AS course_slug, c.moodle_course_id
        FROM orders o
        LEFT JOIN courses c ON o.course_id = c.id
        WHERE o.student_email = ?
        ORDER BY o.created_at DESC
    """, (student_email,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


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


# ─── Payment config ───────────────────────────────────────────────────────────

def get_payment_config():
    conn = get_conn()
    row = conn.execute("SELECT * FROM payment_config WHERE id = 1").fetchone()
    conn.close()
    if not row:
        return {"yape_number": "", "yape_qr_url": "", "plin_number": "", "plin_qr_url": "",
                "bank_accounts": [], "yape_enabled": True, "plin_enabled": True, "bank_enabled": True}
    d = dict(row)
    try:
        d["bank_accounts"] = json.loads(d.get("bank_accounts") or "[]")
    except Exception:
        d["bank_accounts"] = []
    d["yape_enabled"] = bool(d.get("yape_enabled", 1))
    d["plin_enabled"] = bool(d.get("plin_enabled", 1))
    d["bank_enabled"] = bool(d.get("bank_enabled", 1))
    return d


def save_payment_config(payload):
    bank_accounts = json.dumps(payload.get("bank_accounts") or [])
    yape_enabled = 1 if payload.get("yape_enabled", True) else 0
    plin_enabled  = 1 if payload.get("plin_enabled",  True) else 0
    bank_enabled  = 1 if payload.get("bank_enabled",  True) else 0
    conn = get_conn()
    with conn:
        conn.execute(
            """
            INSERT INTO payment_config (id, yape_number, yape_qr_url, plin_number, plin_qr_url,
                                        bank_accounts, yape_enabled, plin_enabled, bank_enabled)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              yape_number   = excluded.yape_number,
              yape_qr_url   = excluded.yape_qr_url,
              plin_number   = excluded.plin_number,
              plin_qr_url   = excluded.plin_qr_url,
              bank_accounts = excluded.bank_accounts,
              yape_enabled  = excluded.yape_enabled,
              plin_enabled  = excluded.plin_enabled,
              bank_enabled  = excluded.bank_enabled
            """,
            (
                payload.get("yape_number", ""),
                payload.get("yape_qr_url", ""),
                payload.get("plin_number", ""),
                payload.get("plin_qr_url", ""),
                bank_accounts,
                yape_enabled, plin_enabled, bank_enabled,
            ),
        )
    conn.close()
