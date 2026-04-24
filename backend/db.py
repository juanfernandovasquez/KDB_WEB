import os
import sqlite3
from datetime import datetime
from pathlib import Path
import json
from werkzeug.security import generate_password_hash

_db_env = (os.environ.get("DB_PATH") or "").strip()
if _db_env:
    db_path = Path(_db_env).expanduser()
    if not db_path.is_absolute():
        db_path = (Path(__file__).parent / db_path).resolve()
    DB_PATH = db_path
else:
    DB_PATH = Path(__file__).parent / "subscriptions.db"

_db_initialized = False


def get_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS subscriptions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS contact_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              phone TEXT,
              subject TEXT,
              message TEXT NOT NULL,
              ip TEXT,
              user_agent TEXT,
              status TEXT NOT NULL DEFAULT 'new',
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS company_info (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              name TEXT,
              tagline TEXT,
              phone TEXT,
              email TEXT,
              address TEXT,
              logo_url TEXT,
              favicon_url TEXT,
              brochure_url TEXT,
              linkedin TEXT,
              facebook TEXT,
              instagram TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS page_settings (
              page TEXT PRIMARY KEY,
              enabled INTEGER NOT NULL DEFAULT 1,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS hero_slides (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              page TEXT NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              title TEXT,
              description TEXT,
              primary_label TEXT,
              primary_href TEXT,
              secondary_label TEXT,
              secondary_href TEXT,
              image_url TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS page_story (
              page TEXT PRIMARY KEY,
              title TEXT,
              paragraphs TEXT,
              content_html TEXT,
              image_url TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS page_about (
              page TEXT PRIMARY KEY,
              title TEXT,
              content TEXT,
              image_url TEXT,
              primary_label TEXT,
              primary_href TEXT,
              secondary_label TEXT,
              secondary_href TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS team_members (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              page TEXT NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              name TEXT,
              role TEXT,
              image_url TEXT,
              linkedin TEXT,
              more_url TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS team_meta (
              page TEXT PRIMARY KEY,
              title TEXT,
              subtitle TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS services_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              page TEXT NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              title TEXT,
              description TEXT,
              bullets TEXT,
              image_url TEXT,
              icon_url TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS services_meta (
              page TEXT PRIMARY KEY,
              title TEXT,
              subtitle TEXT
            )
            """
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_hero_page_position ON hero_slides(page, position)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_team_page_position ON team_members(page, position)"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_services_page_position ON services_items(page, position)"
        )

        exists = conn.execute("SELECT COUNT(*) AS c FROM company_info").fetchone()["c"]
        if exists == 0:
            conn.execute(
                """
                INSERT INTO company_info (id, name, tagline, phone, email, address, logo_url, favicon_url, linkedin, facebook, instagram)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "KDB Legal & Tributario",
                    "Estrategia legal y tributaria a tu medida",
                    "+51 999 888 777",
                    "contacto@kdblegal.pe",
                    "Av. Los Abogados 123, Lima, Perú",
                    "",
                    "",
                    "#",
                    "#",
                    "#",
                ),
            )

        # Seed page visibility defaults
        page_defaults = [
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
        ]
        now = datetime.utcnow().isoformat()
        for page in page_defaults:
            conn.execute(
                "INSERT OR IGNORE INTO page_settings (page, enabled, updated_at) VALUES (?, 1, ?)",
                (page, now),
            )

        # Seed servicios hero if missing
        services_hero = conn.execute(
            "SELECT COUNT(*) AS c FROM hero_slides WHERE page = ?",
            ("servicios",),
        ).fetchone()["c"]
        if services_hero == 0:
            now = datetime.utcnow().isoformat()
            conn.executemany(
                """
                INSERT INTO hero_slides (page, position, title, description, primary_label, primary_href, secondary_label, secondary_href, image_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        "servicios",
                        0,
                        "Soluciones legales a la medida",
                        "Servicios especializados en tributación y corporativo para proteger y escalar tu negocio.",
                        "Explora servicios",
                        "#servicios",
                        "Agenda una llamada",
                        "#contacto",
                        "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
                        now,
                        now,
                    ),
                    (
                        "servicios",
                        1,
                        "Rigor, anticipación y cercanía",
                        "Convertimos la regulación en ventaja competitiva con estrategias claras y accionables.",
                        "Ver casos de éxito",
                        "#casos",
                        "Habla con un especialista",
                        "#contacto",
                        "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80",
                        now,
                        now,
                    ),
                ],
            )

        services_exists = conn.execute(
            "SELECT COUNT(*) AS c FROM services_items WHERE page = ?",
            ("servicios",),
        ).fetchone()["c"]
        if services_exists == 0:
            defaults = [
                (
                    "Planeamiento tributario",
                    "Estrategias fiscales eficientes, alineadas con tu negocio.",
                    [
                        "Revisión de riesgos y contingencias",
                        "Optimización de cargas impositivas",
                        "Implementación de incentivos y beneficios",
                    ],
                ),
                (
                    "Defensa y controversias",
                    "Representación estratégica ante SUNAT y foros judiciales.",
                    [
                        "Fiscalizaciones y reclamaciones",
                        "Apelaciones y litigios tributarios",
                        "Estrategia probatoria y acuerdos",
                    ],
                ),
            ]
            conn.executemany(
                """
                INSERT INTO services_items (page, position, title, description, bullets)
                VALUES (?, ?, ?, ?, ?)
                """,
                [("servicios", idx, t, d, json.dumps(b)) for idx, (t, d, b) in enumerate(defaults)],
            )

        services_meta_exists = conn.execute(
            "SELECT COUNT(*) AS c FROM services_meta WHERE page = ?",
            ("servicios",),
        ).fetchone()["c"]
        if services_meta_exists == 0:
            conn.execute(
                """
                INSERT INTO services_meta (page, title, subtitle)
                VALUES (?, ?, ?)
                """,
                (
                    "servicios",
                    "Servicios especializados",
                    "Soluciones integrales en tributación y corporativo para cada etapa de tu negocio.",
                ),
            )

        # Publicaciones: categories and posts (tags removed)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS publications (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              slug TEXT NOT NULL UNIQUE,
              excerpt TEXT,
              content_html TEXT,
              author TEXT,
              hero_title TEXT,
              hero_subtitle TEXT,
              hero_image_url TEXT,
              hero_cta_label TEXT,
              hero_cta_href TEXT,
              category_id INTEGER,
              published_at TEXT,
              active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (category_id) REFERENCES categories(id)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS kdbweb_entries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              position INTEGER NOT NULL DEFAULT 0,
              slug TEXT NOT NULL UNIQUE,
              parent_slug TEXT,
              title TEXT NOT NULL,
              card_title TEXT,
              summary TEXT,
              hero_kicker TEXT,
              hero_title TEXT,
              hero_subtitle TEXT,
              hero_image_url TEXT,
              hero_primary_label TEXT,
              hero_primary_href TEXT,
              hero_secondary_label TEXT,
              hero_secondary_href TEXT,
              content_html TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        # Legacy DBs: ensure column active exists
        try:
            conn.execute("ALTER TABLE publications ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
        except Exception:
            pass
        # Legacy DBs: add logo_url to company info
        try:
            conn.execute("ALTER TABLE company_info ADD COLUMN logo_url TEXT")
        except Exception:
            pass
        # Legacy DBs: add favicon_url to company info
        try:
            conn.execute("ALTER TABLE company_info ADD COLUMN favicon_url TEXT")
        except Exception:
            pass
        # Legacy DBs: add brochure_url to company info
        try:
            conn.execute("ALTER TABLE company_info ADD COLUMN brochure_url TEXT")
        except Exception:
            pass
        # Legacy DBs: add image_url to page_story
        try:
            conn.execute("ALTER TABLE page_story ADD COLUMN image_url TEXT")
        except Exception:
            pass
        # Legacy DBs: add media fields to services
        for col in ["image_url", "icon_url"]:
            try:
                conn.execute(f"ALTER TABLE services_items ADD COLUMN {col} TEXT")
            except Exception:
                pass
        # Legacy DBs: add new content fields
        for col in ["author", "hero_title", "hero_subtitle", "hero_image_url", "hero_cta_label", "hero_cta_href"]:
            try:
                conn.execute(f"ALTER TABLE publications ADD COLUMN {col} TEXT")
            except Exception:
                pass
        # Legacy DBs: add hero fields for publications
        for col in ["hero_title", "hero_subtitle", "hero_image_url", "hero_cta_label", "hero_cta_href"]:
            try:
                conn.execute(f"ALTER TABLE publications ADD COLUMN {col} TEXT")
            except Exception:
                pass
        # Legacy DBs: add hierarchy + hero fields for kdbweb entries
        try:
            conn.execute("ALTER TABLE kdbweb_entries ADD COLUMN parent_slug TEXT")
        except Exception:
            pass
        for col in [
            "card_title",
            "hero_kicker",
            "hero_title",
            "hero_subtitle",
            "hero_primary_label",
            "hero_primary_href",
            "hero_secondary_label",
            "hero_secondary_href",
        ]:
            try:
                conn.execute(f"ALTER TABLE kdbweb_entries ADD COLUMN {col} TEXT")
            except Exception:
                pass
        # KATWeb structured data (meta_json for page-type specific content)
        try:
            conn.execute("ALTER TABLE kdbweb_entries ADD COLUMN meta_json TEXT")
        except Exception:
            pass

        # Migration: replace known placeholder/broken images in jurisprudencia child entries
        # Only updates entries that still have one of the old wrong default images
        _img_fixes = [
            (
                "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80",
                "tribunal-fiscal",
                ["1605792657660", "1507679799987"],  # crypto chart or generic man-in-suit
            ),
            (
                "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1600&q=80",
                "casaciones-de-la-corte-suprema",
                ["1498050108023", "1569234044014"],  # laptop / broken image
            ),
        ]
        for new_url, slug, bad_patterns in _img_fixes:
            for pat in bad_patterns:
                conn.execute(
                    "UPDATE kdbweb_entries SET hero_image_url = ? "
                    "WHERE slug = ? AND hero_image_url LIKE ?",
                    (new_url, slug, f"%{pat}%"),
                )

        # Migration: reorder root KATWeb categories to match design mockup
        # and update placeholder images with more appropriate ones.
        # Positions are always updated; images only if they still hold the
        # original seeded value (to avoid overwriting admin-set custom images).
        _root_reorder = [
            # (slug, new_position, old_img_pattern, new_image_url)
            (
                "constitucion", 0,
                "1522202176988",  # friends-laughing placeholder
                "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=1600&q=80",
            ),
            (
                "tratados-internacionales", 1,
                "1520607162513",  # generic placeholder
                "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80",
            ),
            (
                "legislacion-tributaria-aduanera", 2,
                "1489515217757",  # rainy-bus-stop placeholder
                "https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=1600&q=80",
            ),
            (
                "jurisprudencia", 3,
                "1497366754035",  # office-corridor placeholder
                "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80",
            ),
            (
                "doctrina", 4,
                "1521791136064",  # handshake placeholder
                "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1600&q=80",
            ),
        ]
        for slug, new_pos, old_pat, new_img in _root_reorder:
            conn.execute(
                "UPDATE kdbweb_entries SET position = ? WHERE slug = ? AND parent_slug IS NULL",
                (new_pos, slug),
            )
            conn.execute(
                "UPDATE kdbweb_entries SET hero_image_url = ? "
                "WHERE slug = ? AND hero_image_url LIKE ?",
                (new_img, slug, f"%{old_pat}%"),
            )

        # Migration: fix Constitución hero image — photo-1589829085413 turned
        # out to be a book cover ("How Innovation Works"), not scales of justice.
        # Replace with photo-1554224155-6726b3ff858f (classic scales of justice).
        conn.execute(
            "UPDATE kdbweb_entries SET hero_image_url = ? "
            "WHERE slug = 'constitucion' AND hero_image_url LIKE '%1589829085413%'",
            ("https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80",),
        )

        # Migration: provisional treaty data for Tratados Internacionales.
        # Only inserts if meta_json is NULL or empty (won't overwrite admin edits).
        _tratados_meta = json.dumps({
            "section_title": "Convenios para evitar la doble Imposición en vigor:",
            "entries": [
                {
                    "title": "Alianza del Pacífico — Convención de Homologación",
                    "date": "Aplicable desde el 1 de enero de 2024",
                    "icon_emoji": "🤝",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con Chile",
                    "date": "Aplicable desde el 1 de enero de 2004",
                    "icon_emoji": "🇨🇱",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con Canadá",
                    "date": "Aplicable desde el 1 de enero de 2024",
                    "icon_emoji": "🇨🇦",
                    "button_url": "#",
                    "button_label": "Ver convenio en español",
                    "sub_entries": [
                        {"button_url": "#", "button_label": "Ver convenio en inglés", "title": ""}
                    ]
                },
                {
                    "title": "Convenio con la Comunidad Andina",
                    "date": "Aplicable desde el 1 de enero de 2005",
                    "icon_emoji": "🌐",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con Brasil",
                    "date": "Aplicable desde el 1 de enero de 2010",
                    "icon_emoji": "🇧🇷",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con los Estados Unidos de Norteamérica",
                    "date": "Aplicable desde el 1 de enero de 2015",
                    "icon_emoji": "🇺🇸",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con España",
                    "date": "Aplicable desde el 1 de enero de 2008",
                    "icon_emoji": "🇪🇸",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con México",
                    "date": "Aplicable desde el 1 de enero de 2015",
                    "icon_emoji": "🇲🇽",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con Portugal",
                    "date": "Aplicable desde el 1 de enero de 2015",
                    "icon_emoji": "🇵🇹",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                },
                {
                    "title": "Convenio con Corea del Sur",
                    "date": "Aplicable desde el 1 de enero de 2015",
                    "icon_emoji": "🇰🇷",
                    "button_url": "#",
                    "button_label": "Ver convenio"
                }
            ]
        }, ensure_ascii=False)
        # Always overwrite — no admin panel exists yet for this field,
        # so there are no real edits to protect. The prior condition
        # (meta_json IS NULL OR meta_json = '') was silently skipping
        # rows that already had any value, even an empty object.
        conn.execute(
            "UPDATE kdbweb_entries SET meta_json = ? "
            "WHERE slug = 'tratados-internacionales'",
            (_tratados_meta,),
        )

        # KATWeb: tabla de boletines de jurisprudencia (Tribunal Fiscal)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS katweb_boletines (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              year INTEGER NOT NULL,
              month_label TEXT NOT NULL,
              pdf_url TEXT,
              position INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )

        # Seed default categories if empty
        cat_exists = conn.execute("SELECT COUNT(*) AS c FROM categories").fetchone()["c"]
        if cat_exists == 0:
            conn.execute("INSERT INTO categories (name) VALUES (?)", ("General",))

        pub_exists = conn.execute("SELECT COUNT(*) AS c FROM publications").fetchone()["c"]
        now = datetime.utcnow().isoformat()
        # Ensure some useful categories exist
        conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", ("General",))
        conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", ("Análisis",))
        conn.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", ("Eventos",))

        defaults = [
            {
                "title": "Lanzamiento de nuevos servicios",
                "slug": "lanzamiento-nuevos-servicios",
                "excerpt": "Presentamos nuevas soluciones en tributación para pymes.",
                "content_html": "<p>Contenido de ejemplo sobre el lanzamiento de nuevos servicios.</p>",
                "category": "General",
                "published_at": now,
            },
            {
                "title": "Guía práctica de planeamiento tributario 2026",
                "slug": "guia-planeamiento-2026",
                "excerpt": "Puntos clave y checklist para optimizar la carga fiscal.",
                "content_html": "<p>Un resumen con pasos prácticos para equipos financieros.</p>",
                "category": "Análisis",
                "published_at": now,
            },
            {
                "title": "Cómo preparar tu empresa para una fiscalización",
                "slug": "preparar-empresa-fiscalizacion",
                "excerpt": "Recomendaciones y documentación esencial antes de una fiscalización.",
                "content_html": "<p>Consejos prácticos y listados de control para estar listos ante auditorías.</p>",
                "category": "General",
                "published_at": now,
            },
            {
                "title": "Evento: Seminario sobre compliance 2026",
                "slug": "evento-seminario-compliance-2026",
                "excerpt": "Regístrate en nuestro seminario enfocado en compliance y gobernanza.",
                "content_html": "<p>Detalles del evento, agenda y ponentes.</p>",
                "category": "Eventos",
                "published_at": now,
            },
            {
                "title": "Caso de estudio: optimización fiscal",
                "slug": "caso-estudio-optimizacion-fiscal",
                "excerpt": "Cómo un cliente redujo riesgo y mejoró su planificación tributaria.",
                "content_html": "<p>Descripción del problema, solución y resultados cuantificables.</p>",
                "category": "Análisis",
                "published_at": now,
            },
        ]

        # Ensure each default post exists (insert missing ones without touching existing DB)
        for p in defaults:
            existing = conn.execute("SELECT COUNT(*) AS c FROM publications WHERE slug = ?", (p["slug"],)).fetchone()["c"]
            if existing == 0:
                # resolve category id
                cat_row = conn.execute("SELECT id FROM categories WHERE name = ?", (p["category"],)).fetchone()
                cat_id = cat_row["id"] if cat_row else None
                conn.execute(
                    "INSERT INTO publications (title, slug, excerpt, content_html, category_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (p["title"], p["slug"], p["excerpt"], p["content_html"], cat_id, p["published_at"], now, now),
                )

        # Ensure existing publications have a category (default to 'General')
        conn.execute(
            "UPDATE publications SET category_id = (SELECT id FROM categories WHERE name = ?) WHERE category_id IS NULL",
            ("General",),
        )

        # Seed KDBWEB entries (insert missing defaults without overriding existing)
        kdbweb_exists = conn.execute("SELECT COUNT(*) AS c FROM kdbweb_entries").fetchone()["c"]
        now = datetime.utcnow().isoformat()
        entries = [
            (
                0,
                "doctrina",
                None,
                "Doctrina",
                "Doctrina",
                "Analisis y comentarios doctrinales sobre temas tributarios y aduaneros.",
                "KDBWEB",
                "Doctrina",
                "Analisis y comentarios doctrinales sobre temas tributarios y aduaneros.",
                "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Contenido doctrinal curado por el equipo de KDB Legal &amp; Tributario.</p>",
                now,
                now,
            ),
            (
                1,
                "jurisprudencia",
                None,
                "Jurisprudencia",
                "Jurisprudencia",
                "Sentencias, resoluciones y criterios relevantes para la practica tributaria.",
                "KDBWEB",
                "Jurisprudencia",
                "Sentencias, resoluciones y criterios relevantes para la practica tributaria.",
                "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Seleccion de jurisprudencia clave para decisiones informadas.</p>",
                now,
                now,
            ),
            (
                2,
                "legislacion-tributaria-aduanera",
                None,
                "Legislacion tributaria y aduanera",
                "Legislacion tributaria y aduanera",
                "Normas, decretos y actualizaciones en materia tributaria y aduanera.",
                "KDBWEB",
                "Legislacion tributaria y aduanera",
                "Normas, decretos y actualizaciones en materia tributaria y aduanera.",
                "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Compendio de normas y cambios relevantes para cumplimiento y estrategia.</p>",
                now,
                now,
            ),
            (
                3,
                "tratados-internacionales",
                None,
                "Tratados internacionales",
                "Tratados internacionales",
                "Convenios y tratados aplicables a operaciones internacionales.",
                "KDBWEB",
                "Tratados internacionales",
                "Convenios y tratados aplicables a operaciones internacionales.",
                "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Guia sobre tratados y su impacto en transacciones transfronterizas.</p>",
                now,
                now,
            ),
            (
                4,
                "constitucion",
                None,
                "Constitucion",
                "Constitucion",
                "Principios constitucionales y su aplicacion en materia tributaria.",
                "KDBWEB",
                "Constitucion",
                "Principios constitucionales y su aplicacion en materia tributaria.",
                "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Marco constitucional que sostiene el sistema tributario.</p>",
                now,
                now,
            ),
            (
                5,
                "tribunal-fiscal",
                "jurisprudencia",
                "Tribunal Fiscal",
                "Tribunal Fiscal",
                "Resoluciones y criterios del Tribunal Fiscal para casos tributarios.",
                "KDBWEB",
                "Tribunal Fiscal",
                "Resoluciones y criterios del Tribunal Fiscal para casos tributarios.",
                "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Repositorio de resoluciones clave emitidas por el Tribunal Fiscal.</p>",
                now,
                now,
            ),
            (
                6,
                "casaciones-de-la-corte-suprema",
                "jurisprudencia",
                "Casaciones de la corte suprema",
                "Casaciones de la corte suprema",
                "Criterios y precedentes de la Corte Suprema en materia tributaria.",
                "KDBWEB",
                "Casaciones de la corte suprema",
                "Criterios y precedentes de la Corte Suprema en materia tributaria.",
                "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Compilacion de casaciones relevantes para la practica tributaria.</p>",
                now,
                now,
            ),
            (
                7,
                "sentencias-del-tc",
                "jurisprudencia",
                "Sentencias del TC",
                "Sentencias del TC",
                "Pronunciamientos del Tribunal Constitucional con impacto tributario.",
                "KDBWEB",
                "Sentencias del TC",
                "Pronunciamientos del Tribunal Constitucional con impacto tributario.",
                "https://images.unsplash.com/photo-1521790367000-9662a79b43c5?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Sentencias del Tribunal Constitucional organizadas por materia.</p>",
                now,
                now,
            ),
            (
                8,
                "resoluciones",
                "tribunal-fiscal",
                "Resoluciones",
                "Resoluciones",
                "Resoluciones del Tribunal Fiscal clasificadas por tema.",
                "KDBWEB",
                "Resoluciones",
                "Resoluciones del Tribunal Fiscal clasificadas por tema.",
                "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Explora resoluciones relevantes para tus procesos tributarios.</p>",
                now,
                now,
            ),
            (
                9,
                "boletinas",
                "tribunal-fiscal",
                "Boletinas",
                "Boletinas",
                "Boletinas y reportes informativos del Tribunal Fiscal.",
                "KDBWEB",
                "Boletinas",
                "Boletinas y reportes informativos del Tribunal Fiscal.",
                "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80",
                "",
                "",
                "",
                "",
                "<p>Boletinas y comunicados con actualizaciones del Tribunal Fiscal.</p>",
                now,
                now,
            ),
        ]
        if kdbweb_exists == 0:
            insert_entries = entries
        else:
            max_pos = conn.execute("SELECT MAX(position) AS m FROM kdbweb_entries").fetchone()["m"]
            max_pos = max_pos if max_pos is not None else 0
            insert_entries = []
            for entry in entries:
                existing = conn.execute(
                    "SELECT COUNT(*) AS c FROM kdbweb_entries WHERE slug = ?",
                    (entry[1],),
                ).fetchone()["c"]
                if existing == 0:
                    max_pos += 1
                    insert_entries.append((max_pos,) + entry[1:])
        if insert_entries:
            conn.executemany(
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
                insert_entries,
            )

        # Drop obsolete tags tables (cleanup since tags feature was removed)
        conn.execute("DROP TABLE IF EXISTS post_tags")
        conn.execute("DROP TABLE IF EXISTS tags")

        # Admin auth tables
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'editor',
              active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              admin_id INTEGER NOT NULL,
              token TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              FOREIGN KEY (admin_id) REFERENCES admin_users(id)
            )
            """
        )

        # Bootstrap admin user if none exist and env vars are provided
        admin_count = conn.execute("SELECT COUNT(*) AS c FROM admin_users").fetchone()["c"]
        admin_user = (os.environ.get("ADMIN_USER") or "").strip()
        admin_pass = (os.environ.get("ADMIN_PASSWORD") or "").strip()
        if admin_count == 0 and admin_user and admin_pass:
            now = datetime.utcnow().isoformat()
            conn.execute(
                """
                INSERT INTO admin_users (username, password_hash, role, active, created_at, updated_at)
                VALUES (?, ?, 'super', 1, ?, ?)
                """,
                (admin_user, generate_password_hash(admin_pass), now, now),
            )
    conn.close()


def ensure_db():
    global _db_initialized
    if not _db_initialized:
        init_db()
        _db_initialized = True
