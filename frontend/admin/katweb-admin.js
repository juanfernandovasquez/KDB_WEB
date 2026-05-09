/**
 * katweb-admin.js
 * Maneja los editores de datos estructurados (meta_json) para las sub-páginas
 * de KATWeb, así como la gestión de boletines del Tribunal Fiscal.
 *
 * Se inicializa después de admin.js y se comunica mediante CustomEvents:
 *   - "katweb:open-form"    → dispatched when a kdbweb entry form is opened
 *   - "katweb:collect-meta" → dispatched just before the entry is saved
 */
(function () {
  "use strict";

  /* ─── Helpers ─────────────────────────────────────────────────────────── */

  const q = (id) => document.getElementById(id);
  const safe = (str) =>
    String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const API_BASE = window.API_BASE || "";
  const apiFetch = (path, opts = {}) => {
    const token =
      (window.__KDB_ADMIN_TOKEN__ && window.__KDB_ADMIN_TOKEN__()) || "";
    const headers = new Headers(opts.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...opts, headers });
  };

  /* We need to read the admin token from the same closure as admin.js.
     admin.js exposes it via window.__getAdminToken if available; otherwise
     we grab it from the Authorization header by monkey-patching apiFetch
     on first request. For simplicity we re-use the same apiFetch pattern
     by reading a known admin-token storage (admin.js sets it on login). */
  const getToken = () => {
    // admin.js stores the token in the closure — we can read it from cookies
    // or localStorage if needed. For now rely on the fact that admin.js
    // already set credentials via the browser's fetch interceptor.
    return "";
  };

  const adminApiFetch = (path, opts = {}) => {
    // Piggyback on the same token admin.js manages by reading from a shared
    // global we'll expose below (safe, no security risk since same origin).
    const token = window.__katwebAdminToken__ || "";
    const headers = new Headers(opts.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE}${path}`, { ...opts, headers });
  };

  /* ─── State ────────────────────────────────────────────────────────────── */

  let currentSlug = null;          // slug of the entry being edited
  let currentMeta = {};            // parsed meta_json of current entry
  let boletinesData = [];          // array of { id, year, month_label, pdf_url, position }
  let legCurrentTab = "tributaria";// active legislation tab

  /* ─── Slug → editor type mapping ──────────────────────────────────────── */

  const SLUG_TYPE = {
    "constitucion": "constitucion",
    "casaciones-de-la-corte-suprema": "casaciones",
    "sentencias-del-tc": "sentencias",
    "doctrina": "doctrina",
    "tribunal-fiscal": "tf",
    "tratados-internacionales": "tratados",
    "legislacion-tributaria-aduanera": "legislacion",
    "jurisprudencia": "jurisprudencia",
  };

  // The key used in meta_json for the access URL, per page type
  const ACCESS_KEY = {
    "access": "access_url",
    "doctrina_access": "cta_url",
  };

  /* ─── Show / hide the correct sub-editor ──────────────────────────────── */

  function showMetaSection(slug, meta) {
    const section = q("kdbweb-meta-section");
    if (!section) return;

    // Hide all sub-editors first
    ["kdbweb-meta-constitucion", "kdbweb-meta-access", "kdbweb-meta-tf",
     "kdbweb-meta-casaciones", "kdbweb-meta-sentencias", "kdbweb-meta-doctrina",
     "kdbweb-meta-tratados", "kdbweb-meta-legislacion",
     "kdbweb-meta-jurisprudencia",
     "kdbweb-meta-raw"].forEach((id) => {
      const el = q(id);
      if (el) el.classList.add("hidden");
    });

    // La card de Boletines del Tribunal Fiscal solo es visible cuando
    // la entrada seleccionada es "tribunal-fiscal"
    const boleCard = q("kdbweb-boletines-card");
    if (boleCard) {
      if (slug === "tribunal-fiscal") {
        boleCard.classList.remove("hidden");
      } else {
        boleCard.classList.add("hidden");
      }
    }

    const type = SLUG_TYPE[slug];
    if (!type) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");

    if (type === "constitucion") {
      const el = q("kdbweb-meta-constitucion");
      if (el) el.classList.remove("hidden");
      const setf = (id, val) => { const e = q(id); if (e) e.value = val || ""; };
      setf("kw-const-left-title",       meta.left_title       || "¿Qué es y por qué importa?");
      setf("kw-const-access-label",     meta.access_label     || "Acceder al texto de la Constitución Política del Perú:");
      setf("kw-const-access-btn-label", meta.access_btn_label || "Accede al texto");
      setf("kw-const-access-url",       meta.access_url       || "");
      const rightEditor = q("kw-const-right-editor");
      if (rightEditor) rightEditor.innerHTML = meta.right_content || "";
    } else if (type === "access" || type === "doctrina_access") {
      const el = q("kdbweb-meta-access");
      if (el) el.classList.remove("hidden");
      const key = ACCESS_KEY[type] || "access_url";
      const label = q("kdbweb-meta-access")?.querySelector("label");
      if (label) label.textContent = type === "doctrina_access" ? "URL del botón de biblioteca (CTA)" : "URL de acceso (botón principal)";
      const inp = q("kdbweb-meta-access-url");
      if (inp) inp.value = meta[key] || "";
    } else if (type === "tf") {
      const el = q("kdbweb-meta-tf");
      if (el) el.classList.remove("hidden");
      const setf = (id, val) => { const e = q(id); if (e) e.value = val || ""; };
      const tools = meta.tools || [];
      const t0 = tools[0] || {};
      const t1 = tools[1] || {};
      // Sección de presentación: columna izquierda y derecha
      setf("kdbweb-meta-tf-left-title", meta.left_title || "¿Qué es y por qué importa?");
      const tfRightEditor = q("kdbweb-meta-tf-right-content");
      if (tfRightEditor) tfRightEditor.innerHTML = meta.right_content || "";
      // Sección 1 y 2: subtítulos y descripciones
      setf("kdbweb-meta-tf-s1title", meta.section1_title || "1. Resoluciones");
      setf("kdbweb-meta-tf-s1desc",  meta.section1_desc  || "");
      setf("kdbweb-meta-tf-s2title", meta.section2_title || "2. Boletines de Jurisprudencia Tributaria");
      const s2Editor = q("kdbweb-meta-tf-s2desc");
      if (s2Editor) s2Editor.innerHTML = meta.section2_desc || "";
      // Backward-compat: old format used "label" for button text; new format uses card_title + button_label
      setf("kdbweb-meta-tf-icon1",      t0.icon         || "🔍");
      setf("kdbweb-meta-tf-cardtitle1", t0.card_title   || t0.label || "Búsqueda por Contenido de Resoluciones del Tribunal Fiscal (RTF)");
      setf("kdbweb-meta-tf-carddesc1",  t0.card_desc    || "");
      setf("kdbweb-meta-tf-btnlabel1",  t0.button_label || (t0.card_title ? "Acceder al buscador" : t0.label) || "Acceder al buscador");
      setf("kdbweb-meta-tf-url1",       t0.url          || "");
      setf("kdbweb-meta-tf-icon2",      t1.icon         || "⚖️");
      setf("kdbweb-meta-tf-cardtitle2", t1.card_title   || t1.label || "Búsqueda de Resoluciones del Tribunal Fiscal");
      setf("kdbweb-meta-tf-carddesc2",  t1.card_desc    || "");
      setf("kdbweb-meta-tf-btnlabel2",  t1.button_label || (t1.card_title ? "Acceder al buscador" : t1.label) || "Acceder al buscador");
      setf("kdbweb-meta-tf-url2",       t1.url          || "");
    } else if (type === "casaciones") {
      const el = q("kdbweb-meta-casaciones");
      if (el) el.classList.remove("hidden");
      const setf = (id, val) => { const e = q(id); if (e) e.value = val || ""; };
      setf("kdbweb-meta-cas-left-title",      meta.left_title       || "¿Qué es y por qué importa?");
      const casRight = q("kdbweb-meta-cas-right-content");
      if (casRight) casRight.innerHTML = meta.right_content || "";
      setf("kdbweb-meta-cas-access-label",    meta.access_label     || "Acceder al buscador de jurisprudencia del Poder Judicial:");
      setf("kdbweb-meta-cas-access-btn-label",meta.access_btn_label || "Accede al texto");
      setf("kdbweb-meta-cas-access-url",      meta.access_url       || "");
      setf("kdbweb-meta-cas-sug-title",       meta.suggestion_title || "Sugerencia de búsqueda");
      setf("kdbweb-meta-cas-sug-desc",        meta.suggestion_desc  || "");
      renderCasSugItems(meta.suggestion_items || []);
    } else if (type === "doctrina") {
      const el = q("kdbweb-meta-doctrina");
      if (el) el.classList.remove("hidden");
      const setf = (id, val) => { const e = q(id); if (e) e.value = val || ""; };
      setf("kdbweb-meta-doc-left-title",  meta.left_title  || "¿Qué es y por qué importa?");
      const docRight = q("kdbweb-meta-doc-right-content");
      if (docRight) docRight.innerHTML = meta.right_content || "";
      // Tarjetas de categoría (fijas, 4 campos)
      const cats = meta.categories || [];
      [0, 1, 2, 3].forEach((i) => {
        const c = cats[i] || {};
        setf(`kdbweb-meta-doc-card-icon-${i}`,  c.icon_emoji || "");
        setf(`kdbweb-meta-doc-card-title-${i}`, c.title      || "");
        setf(`kdbweb-meta-doc-card-desc-${i}`,  c.description || "");
      });
      // CTA
      setf("kdbweb-meta-doc-cta-label",     meta.cta_label     || "Acceder para ver el contenido disponible:");
      setf("kdbweb-meta-doc-cta-btn-label", meta.cta_btn_label || "Accede a la biblioteca");
      setf("kdbweb-meta-doc-cta-url",       meta.cta_url       || "");
    } else if (type === "sentencias") {
      const el = q("kdbweb-meta-sentencias");
      if (el) el.classList.remove("hidden");
      const setf = (id, val) => { const e = q(id); if (e) e.value = val || ""; };
      setf("kdbweb-meta-sen-left-title",      meta.left_title       || "¿Qué es y por qué importa?");
      const senRight = q("kdbweb-meta-sen-right-content");
      if (senRight) senRight.innerHTML = meta.right_content || "";
      setf("kdbweb-meta-sen-box-title",       meta.box_title        || "Buscador de Jurisprudencia del Tribunal Constitucional");
      setf("kdbweb-meta-sen-box-desc",        meta.box_desc         || "");
      setf("kdbweb-meta-sen-access-label",    meta.access_label     || "Acceder al buscador de jurisprudencia del Tribunal Constitucional:");
      setf("kdbweb-meta-sen-access-btn-label",meta.access_btn_label || "Accede al texto");
      setf("kdbweb-meta-sen-access-url",      meta.access_url       || "");
    } else if (type === "tratados") {
      const el = q("kdbweb-meta-tratados");
      if (el) el.classList.remove("hidden");
      // Textos de la sección izquierda/derecha
      const leftInp = q("kw-tratados-left-title");
      if (leftInp) leftInp.value = meta.left_title || "¿Qué es y por qué importa?";
      const rightEditor = q("kw-tratados-right-editor");
      if (rightEditor) rightEditor.innerHTML = meta.right_content || "";
      const secInp = q("kw-tratados-section-title");
      if (secInp) secInp.value = meta.section_title || "";
      // Lista de convenios
      renderTreatiesAdmin(meta.entries || []);
    } else if (type === "legislacion") {
      const el = q("kdbweb-meta-legislacion");
      if (el) el.classList.remove("hidden");
      const leftInp = q("kw-leg-left-title");
      if (leftInp) leftInp.value = meta.left_title || "¿Qué es y por qué importa?";
      const rightEditor = q("kw-leg-right-editor");
      if (rightEditor) rightEditor.innerHTML = meta.right_content || "";
      // Backward-compat: support both {tabs:{tributaria:{categories:[]}}} and {tributaria:[...]} (formato viejo)
      const tribCats = (meta.tabs?.tributaria || {}).categories || meta.tributaria || [];
      const adCats   = (meta.tabs?.aduanera   || {}).categories || meta.aduanera   || [];
      renderLegislacionAdmin("tributaria", tribCats);
      renderLegislacionAdmin("aduanera",   adCats);
    } else if (type === "jurisprudencia") {
      const el = q("kdbweb-meta-jurisprudencia");
      if (el) el.classList.remove("hidden");
      const leftInp = q("kw-juris-left-title");
      if (leftInp) leftInp.value = meta.left_title || "¿Qué es y por qué importa?";
      const rightEditor = q("kw-juris-right-editor");
      if (rightEditor) rightEditor.innerHTML = meta.right_content || "";
    }

    // Update the JSON preview
    const preview = q("kdbweb-meta-json-preview");
    if (preview) {
      try {
        preview.textContent = JSON.stringify(meta, null, 2);
      } catch (_) {
        preview.textContent = "";
      }
    }
  }

  /* ─── Collect meta from active editor ─────────────────────────────────── */

  function collectMeta(entry) {
    const slug = entry.slug || "";
    const type = SLUG_TYPE[slug];
    if (!type) {
      // No structured editor for this slug — keep existing meta_json
      return;
    }

    let meta = {};
    if (type === "constitucion") {
      const trim = (id) => (q(id)?.value || "").trim();
      meta.left_title       = trim("kw-const-left-title");
      meta.right_content    = (q("kw-const-right-editor")?.innerHTML || "").trim();
      meta.access_label     = trim("kw-const-access-label");
      meta.access_btn_label = trim("kw-const-access-btn-label");
      meta.access_url       = trim("kw-const-access-url");
    } else if (type === "access" || type === "doctrina_access") {
      const key = ACCESS_KEY[type] || "access_url";
      meta[key] = (q("kdbweb-meta-access-url")?.value || "").trim();
    } else if (type === "casaciones") {
      const trim = (id) => (q(id)?.value || "").trim();
      meta.left_title       = trim("kdbweb-meta-cas-left-title")       || "¿Qué es y por qué importa?";
      meta.right_content    = (q("kdbweb-meta-cas-right-content")?.innerHTML || "").trim();
      meta.access_label     = trim("kdbweb-meta-cas-access-label")     || "Acceder al buscador de jurisprudencia del Poder Judicial:";
      meta.access_btn_label = trim("kdbweb-meta-cas-access-btn-label") || "Accede al texto";
      meta.access_url       = trim("kdbweb-meta-cas-access-url");
      meta.suggestion_title = trim("kdbweb-meta-cas-sug-title")        || "Sugerencia de búsqueda";
      meta.suggestion_desc  = trim("kdbweb-meta-cas-sug-desc");
      meta.suggestion_items = [];
      document.querySelectorAll("#kdbweb-cas-sug-items [data-cas-item-text]").forEach((el) => {
        const t = el.dataset.casItemText || "";
        if (t) meta.suggestion_items.push(t);
      });
    } else if (type === "tf") {
      const trim = (id) => (q(id)?.value || "").trim();
      // Sección de presentación
      meta.left_title    = trim("kdbweb-meta-tf-left-title") || "¿Qué es y por qué importa?";
      meta.right_content = (q("kdbweb-meta-tf-right-content")?.innerHTML || "").trim();
      // Subtítulos y descripciones de sección
      meta.section1_title = trim("kdbweb-meta-tf-s1title") || "1. Resoluciones";
      meta.section1_desc  = trim("kdbweb-meta-tf-s1desc");
      meta.section2_title = trim("kdbweb-meta-tf-s2title") || "2. Boletines de Jurisprudencia Tributaria";
      meta.section2_desc  = (q("kdbweb-meta-tf-s2desc")?.innerHTML || "").trim();
      meta.tools = [
        {
          icon:         trim("kdbweb-meta-tf-icon1")      || "🔍",
          card_title:   trim("kdbweb-meta-tf-cardtitle1") || "Búsqueda por Contenido de Resoluciones del Tribunal Fiscal (RTF)",
          card_desc:    trim("kdbweb-meta-tf-carddesc1"),
          button_label: trim("kdbweb-meta-tf-btnlabel1")  || "Acceder al buscador",
          url:          trim("kdbweb-meta-tf-url1"),
        },
        {
          icon:         trim("kdbweb-meta-tf-icon2")      || "⚖️",
          card_title:   trim("kdbweb-meta-tf-cardtitle2") || "Búsqueda de Resoluciones del Tribunal Fiscal",
          card_desc:    trim("kdbweb-meta-tf-carddesc2"),
          button_label: trim("kdbweb-meta-tf-btnlabel2")  || "Acceder al buscador",
          url:          trim("kdbweb-meta-tf-url2"),
        },
      ];
    } else if (type === "doctrina") {
      const trim = (id) => (q(id)?.value || "").trim();
      meta.left_title    = trim("kdbweb-meta-doc-left-title")  || "¿Qué es y por qué importa?";
      meta.right_content = (q("kdbweb-meta-doc-right-content")?.innerHTML || "").trim();
      meta.categories = [0, 1, 2, 3].map((i) => ({
        icon_emoji:  trim(`kdbweb-meta-doc-card-icon-${i}`)  || "📄",
        title:       trim(`kdbweb-meta-doc-card-title-${i}`) || "",
        description: trim(`kdbweb-meta-doc-card-desc-${i}`)  || "",
      }));
      meta.cta_label     = trim("kdbweb-meta-doc-cta-label")     || "Acceder para ver el contenido disponible:";
      meta.cta_btn_label = trim("kdbweb-meta-doc-cta-btn-label") || "Accede a la biblioteca";
      meta.cta_url       = trim("kdbweb-meta-doc-cta-url");
    } else if (type === "sentencias") {
      const trim = (id) => (q(id)?.value || "").trim();
      meta.left_title       = trim("kdbweb-meta-sen-left-title")       || "¿Qué es y por qué importa?";
      meta.right_content    = (q("kdbweb-meta-sen-right-content")?.innerHTML || "").trim();
      meta.box_title        = trim("kdbweb-meta-sen-box-title")        || "Buscador de Jurisprudencia del Tribunal Constitucional";
      meta.box_desc         = trim("kdbweb-meta-sen-box-desc");
      meta.access_label     = trim("kdbweb-meta-sen-access-label")     || "Acceder al buscador de jurisprudencia del Tribunal Constitucional:";
      meta.access_btn_label = trim("kdbweb-meta-sen-access-btn-label") || "Accede al texto";
      meta.access_url       = trim("kdbweb-meta-sen-access-url");
    } else if (type === "tratados") {
      // If this entry's detail failed to load from the API, skip updating meta_json
      // to avoid overwriting the database with empty/stale data.
      if (entry._detailFailed) return;
      const leftVal  = (q("kw-tratados-left-title")?.value || "").trim();
      const rightVal = (q("kw-tratados-right-editor")?.innerHTML || "").trim();
      const secVal   = (q("kw-tratados-section-title")?.value || "").trim();
      if (leftVal)  meta.left_title    = leftVal;
      if (rightVal) meta.right_content = rightVal;
      if (secVal)   meta.section_title = secVal;
      const domEntries = collectTreatiesFromDom();
      // Safety guard: if the DOM shows no entries but the form was originally opened
      // with existing entries (currentMeta.entries), preserve those to avoid accidental wipe.
      // This protects against edge cases like a re-render with stale data or an empty
      // meta_json that never had entries vs. a user deliberately clearing them.
      meta.entries = domEntries.length > 0 ? domEntries : (currentMeta.entries || []);
    } else if (type === "legislacion") {
      const leftVal  = (q("kw-leg-left-title")?.value || "").trim();
      const rightVal = (q("kw-leg-right-editor")?.innerHTML || "").trim();
      if (leftVal)  meta.left_title    = leftVal;
      if (rightVal) meta.right_content = rightVal;
      meta.tabs = {
        tributaria: { categories: collectLegislacionFromDom("tributaria") },
        aduanera:   { categories: collectLegislacionFromDom("aduanera") },
      };
    } else if (type === "jurisprudencia") {
      const leftVal  = (q("kw-juris-left-title")?.value || "").trim();
      const rightVal = (q("kw-juris-right-editor")?.innerHTML || "").trim();
      if (leftVal)  meta.left_title    = leftVal;
      if (rightVal) meta.right_content = rightVal;
    }

    entry.meta_json = JSON.stringify(meta);

    // Update preview
    const preview = q("kdbweb-meta-json-preview");
    if (preview) preview.textContent = JSON.stringify(meta, null, 2);
  }

  /* ══════════════════════════════════════════════════════════════════════
     CASACIONES — SUGERENCIA DE BÚSQUEDA (ítems dinámicos)
     ══════════════════════════════════════════════════════════════════════ */

  function renderCasSugItems(items) {
    const cont = q("kdbweb-cas-sug-items");
    if (!cont) return;
    cont.innerHTML = "";
    (items || []).forEach((text) => cont.appendChild(buildCasSugItem(text)));
  }

  function buildCasSugItem(text) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;";
    row.dataset.casItemText = text;
    row.innerHTML = `
      <span style="flex:1;font-size:0.88rem;padding:0.35rem 0.5rem;background:#f3f4f6;border-radius:4px;">${safe(text)}</span>
      <button type="button" class="secondary small-btn kw-cas-sug-delete" style="flex-shrink:0;">✕</button>
    `;
    return row;
  }

  /* ══════════════════════════════════════════════════════════════════════
     TRATADOS INTERNACIONALES EDITOR
     ══════════════════════════════════════════════════════════════════════ */

  function renderTreatiesAdmin(entries) {
    const cont = q("kw-treaties-admin");
    if (!cont) return;
    cont.innerHTML = "";
    (entries || []).forEach((entry, idx) => {
      cont.appendChild(buildTreatyCard(entry, idx));
    });
    updateTreatyIndexes();
  }

  function buildTreatyCard(entry, idx) {
    const div = document.createElement("div");
    div.className = "kw-admin-treaty-card";
    div.dataset.idx = idx;
    div.style.cssText =
      "border:1px solid #e5e7eb;border-radius:6px;padding:0.75rem 1rem;margin-bottom:0.75rem;background:#fafafa;";

    // Backward-compat: field was saved as "icon" in old format, now "icon_emoji"
    const iconEmoji = entry.icon_emoji || entry.icon || "";
    const iconUrl   = entry.icon_url   || "";
    // Backward-compat: field was saved as "url" in old format, now "button_url"
    const buttonUrl   = entry.button_url   || entry.url   || "";
    const buttonLabel = entry.button_label || "Ver convenio";

    const subHtml = (entry.sub_entries || [])
      .map(
        (s, si) => `
      <div class="kw-treaty-sub-row" data-sub="${si}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;flex-wrap:wrap;">
        <input type="text" class="kw-sub-title"       value="${safe(s.title        || "")}" placeholder="Título (opcional)" style="flex:1;min-width:120px;">
        <input type="text" class="kw-sub-btn-label"   value="${safe(s.button_label || s.label || "Ver convenio")}" placeholder="Texto del botón" style="flex:0 0 130px;">
        <input type="url"  class="kw-sub-url"         value="${safe(s.button_url   || s.url   || "")}" placeholder="URL" style="flex:1;min-width:120px;">
        <button type="button" class="secondary small-btn kw-sub-remove" style="flex-shrink:0;">✕</button>
      </div>`
      )
      .join("");

    const iconPreview = iconUrl
      ? `<img src="${safe(iconUrl)}" alt="ícono" style="height:32px;width:32px;object-fit:contain;border-radius:4px;border:1px solid #e5e7eb;margin-top:4px;">`
      : "";

    div.innerHTML = `
      <div style="display:flex;gap:0.75rem;align-items:flex-start;flex-wrap:wrap;">

        <!-- Emoji -->
        <div style="flex:0 0 80px;">
          <label class="small">Emoji</label>
          <input type="text" class="kw-treaty-icon-emoji" value="${safe(iconEmoji)}" placeholder="🇵🇪" style="width:100%;">
        </div>

        <!-- Imagen del ícono -->
        <div style="flex:0 0 200px;">
          <label class="small">Imagen del ícono <span style="color:#9ca3af;">(reemplaza emoji)</span></label>
          <div class="media-input-row" style="display:flex;gap:0.4rem;align-items:center;">
            <input type="url" class="kw-treaty-icon-url" value="${safe(iconUrl)}" placeholder="https://..." style="flex:1;min-width:0;">
            <button type="button" class="secondary small-btn media-picker-btn" title="Elegir desde biblioteca">📁</button>
          </div>
          <div class="kw-treaty-icon-preview" style="min-height:36px;">${iconPreview}</div>
        </div>

        <!-- Título -->
        <div style="flex:1;min-width:160px;">
          <label class="small">Título del tratado</label>
          <input type="text" class="kw-treaty-title" value="${safe(entry.title || "")}" placeholder="Nombre del convenio" style="width:100%;">
        </div>

        <!-- Fecha -->
        <div style="flex:0 0 110px;">
          <label class="small">Fecha / vigencia</label>
          <input type="text" class="kw-treaty-date" value="${safe(entry.date || "")}" placeholder="Aplicable desde..." style="width:100%;">
        </div>

        <!-- Botón: texto -->
        <div style="flex:0 0 120px;">
          <label class="small">Texto del botón</label>
          <input type="text" class="kw-treaty-btn-label" value="${safe(buttonLabel)}" placeholder="Ver convenio" style="width:100%;">
        </div>

        <!-- Botón: URL -->
        <div style="flex:1;min-width:160px;">
          <label class="small">URL del documento</label>
          <input type="url" class="kw-treaty-url" value="${safe(buttonUrl)}" placeholder="https://..." style="width:100%;">
        </div>

        <!-- Acciones -->
        <div style="flex:0 0 auto;display:flex;gap:0.35rem;align-items:flex-end;padding-bottom:2px;">
          <button type="button" class="secondary small-btn kw-treaty-move-up" title="Subir">↑</button>
          <button type="button" class="secondary small-btn kw-treaty-move-down" title="Bajar">↓</button>
          <button type="button" class="secondary small-btn danger kw-treaty-remove" title="Eliminar">✕</button>
        </div>
      </div>

      <details style="margin-top:0.5rem;">
        <summary class="small" style="cursor:pointer;color:#6b7280;">Sub-cláusulas / botones adicionales (${(entry.sub_entries || []).length})</summary>
        <div class="kw-treaty-subs" style="padding-left:0.5rem;margin-top:0.5rem;">
          ${subHtml}
          <button type="button" class="secondary small-btn kw-sub-add" style="margin-top:0.35rem;">+ Sub-cláusula</button>
        </div>
      </details>`;

    // Live preview: update icon preview when URL input changes
    const iconUrlInput = div.querySelector(".kw-treaty-icon-url");
    const iconPreviewEl = div.querySelector(".kw-treaty-icon-preview");
    iconUrlInput.addEventListener("input", () => {
      const val = iconUrlInput.value.trim();
      iconPreviewEl.innerHTML = val
        ? `<img src="${val}" alt="ícono" style="height:32px;width:32px;object-fit:contain;border-radius:4px;border:1px solid #e5e7eb;margin-top:4px;">`
        : "";
    });
    // Also update preview when media modal sets the value (fires "input" event automatically
    // through the global media-picker-btn handler in admin.js which sets input.value + dispatches input)
    iconUrlInput.addEventListener("change", () => iconUrlInput.dispatchEvent(new Event("input")));

    // Action buttons
    div.querySelector(".kw-treaty-remove").addEventListener("click", () => {
      div.remove();
      updateTreatyIndexes();
    });
    div.querySelector(".kw-treaty-move-up").addEventListener("click", () => {
      const prev = div.previousElementSibling;
      if (prev) { div.parentNode.insertBefore(div, prev); updateTreatyIndexes(); }
    });
    div.querySelector(".kw-treaty-move-down").addEventListener("click", () => {
      const next = div.nextElementSibling;
      if (next) { div.parentNode.insertBefore(next, div); updateTreatyIndexes(); }
    });
    div.querySelector(".kw-sub-add").addEventListener("click", () => {
      const subsDiv = div.querySelector(".kw-treaty-subs");
      const addBtn = subsDiv.querySelector(".kw-sub-add");
      const row = document.createElement("div");
      row.className = "kw-treaty-sub-row";
      row.style.cssText = "display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;flex-wrap:wrap;";
      row.innerHTML = `
        <input type="text" class="kw-sub-title"     placeholder="Título (opcional)" style="flex:1;min-width:120px;">
        <input type="text" class="kw-sub-btn-label" placeholder="Texto del botón"   value="Ver convenio" style="flex:0 0 130px;">
        <input type="url"  class="kw-sub-url"       placeholder="URL"               style="flex:1;min-width:120px;">
        <button type="button" class="secondary small-btn kw-sub-remove" style="flex-shrink:0;">✕</button>`;
      row.querySelector(".kw-sub-remove").addEventListener("click", () => row.remove());
      subsDiv.insertBefore(row, addBtn);
    });
    div.querySelectorAll(".kw-sub-remove").forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".kw-treaty-sub-row").remove());
    });

    return div;
  }

  function updateTreatyIndexes() {
    const cont = q("kw-treaties-admin");
    if (!cont) return;
    Array.from(cont.querySelectorAll(".kw-admin-treaty-card")).forEach((card, i) => {
      card.dataset.idx = i;
    });
  }

  function collectTreatiesFromDom() {
    const cont = q("kw-treaties-admin");
    if (!cont) return [];
    return Array.from(cont.querySelectorAll(".kw-admin-treaty-card")).map((card) => {
      const subs = Array.from(card.querySelectorAll(".kw-treaty-sub-row")).map((row) => ({
        title:        (row.querySelector(".kw-sub-title")?.value     || "").trim(),
        button_label: (row.querySelector(".kw-sub-btn-label")?.value || "Ver convenio").trim(),
        button_url:   (row.querySelector(".kw-sub-url")?.value       || "").trim(),
      })).filter((s) => s.title || s.button_url);
      return {
        icon_emoji:   (card.querySelector(".kw-treaty-icon-emoji")?.value || "").trim(),
        icon_url:     (card.querySelector(".kw-treaty-icon-url")?.value   || "").trim(),
        title:        (card.querySelector(".kw-treaty-title")?.value      || "").trim(),
        date:         (card.querySelector(".kw-treaty-date")?.value       || "").trim(),
        button_label: (card.querySelector(".kw-treaty-btn-label")?.value  || "Ver convenio").trim(),
        button_url:   (card.querySelector(".kw-treaty-url")?.value        || "").trim(),
        sub_entries:  subs,
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     LEGISLACIÓN EDITOR
     ══════════════════════════════════════════════════════════════════════ */

  function renderLegislacionAdmin(tab, categories) {
    const cont = q(`kw-leg-cats-${tab}`);
    if (!cont) return;
    cont.innerHTML = "";
    (categories || []).forEach((cat, idx) => {
      cont.appendChild(buildLegCatCard(tab, cat, idx));
    });
  }

  /* ── Group block builder (used inside each leg category card) ──────────── */
  function buildLegGroupBlock(group, gi) {
    const gdiv = document.createElement("div");
    gdiv.className = "kw-admin-leg-group";
    gdiv.dataset.gi = gi;
    gdiv.style.cssText =
      "border:1px solid #e5e7eb;border-radius:4px;padding:0.5rem 0.75rem;margin-bottom:0.5rem;background:#fff;";

    const normsHtml = (group.norms || [])
      .map(
        (n, ni) => `
      <div class="kw-norm-row" data-ni="${ni}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;">
        <input type="text" class="kw-norm-title" value="${safe(n.title || "")}" placeholder="Norma" style="flex:1;">
        <input type="text" class="kw-norm-url"   value="${safe(n.url || n.button_url || "")}" placeholder="https://..." style="flex:1;">
        <button type="button" class="secondary small-btn kw-norm-remove">✕</button>
      </div>`
      )
      .join("");

    gdiv.innerHTML = `
      <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem;">
        <input type="text" class="kw-leg-group-title" value="${safe(group.title || "")}"
               placeholder="Nombre del grupo (opcional — dejar vacío si es el único grupo)"
               style="flex:1;font-weight:600;background:#f8fafc;">
        <button type="button" class="secondary small-btn kw-group-move-up"   title="Subir grupo">↑</button>
        <button type="button" class="secondary small-btn kw-group-move-down" title="Bajar grupo">↓</button>
        <button type="button" class="secondary small-btn danger kw-group-remove" title="Eliminar grupo">✕</button>
      </div>
      <div class="kw-admin-leg-group-norms">
        ${normsHtml}
      </div>
      <button type="button" class="secondary small-btn kw-norm-add" style="margin-top:0.25rem;font-size:0.8rem;">+ Norma</button>`;

    // Wire: add norm
    gdiv.querySelector(".kw-norm-add").addEventListener("click", () => {
      const normsDiv = gdiv.querySelector(".kw-admin-leg-group-norms");
      const row = document.createElement("div");
      row.className = "kw-norm-row";
      row.style.cssText = "display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;";
      row.innerHTML = `
        <input type="text" class="kw-norm-title" placeholder="Nombre de la norma" style="flex:1;">
        <input type="url"  class="kw-norm-url"   placeholder="https://..." style="flex:1;">
        <button type="button" class="secondary small-btn kw-norm-remove">✕</button>`;
      row.querySelector(".kw-norm-remove").addEventListener("click", () => row.remove());
      normsDiv.appendChild(row);
    });

    // Wire: existing norm removes
    gdiv.querySelectorAll(".kw-norm-remove").forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".kw-norm-row").remove());
    });

    // Wire: group move up/down/remove
    gdiv.querySelector(".kw-group-remove").addEventListener("click", () => {
      const siblings = gdiv.parentElement
        ? gdiv.parentElement.querySelectorAll(".kw-admin-leg-group").length
        : 1;
      if (siblings <= 1) {
        alert("Debe haber al menos un grupo. Si no quieres usar grupos, deja el título vacío.");
        return;
      }
      gdiv.remove();
    });
    gdiv.querySelector(".kw-group-move-up").addEventListener("click", () => {
      const prev = gdiv.previousElementSibling;
      if (prev && prev.classList.contains("kw-admin-leg-group")) {
        gdiv.parentNode.insertBefore(gdiv, prev);
      }
    });
    gdiv.querySelector(".kw-group-move-down").addEventListener("click", () => {
      const next = gdiv.nextElementSibling;
      if (next && next.classList.contains("kw-admin-leg-group")) {
        gdiv.parentNode.insertBefore(next, gdiv);
      }
    });

    return gdiv;
  }

  function buildLegCatCard(tab, cat, idx) {
    const div = document.createElement("div");
    div.className = "kw-admin-leg-cat";
    div.dataset.idx = idx;
    div.style.cssText =
      "border:1px solid #d1d5db;border-radius:6px;padding:0.75rem 1rem;margin-bottom:0.75rem;background:#f9fafb;";

    // Normalize to groups: if cat has flat norms, wrap in one unnamed group
    let groups;
    if (cat.groups && cat.groups.length) {
      groups = cat.groups;
    } else {
      groups = [{ title: "", norms: cat.norms || [] }];
    }

    const iconEmoji = cat.icon_emoji || "";
    const iconUrl   = cat.icon_url   || "";
    const iconPreview = iconUrl
      ? `<img src="${safe(iconUrl)}" alt="" style="height:28px;width:28px;object-fit:contain;border-radius:3px;margin-top:4px;">`
      : "";

    div.innerHTML = `
      <div style="display:flex;gap:0.75rem;align-items:flex-start;margin-bottom:0.75rem;flex-wrap:wrap;">

        <!-- Emoji -->
        <div style="flex:0 0 70px;">
          <label class="small">Emoji</label>
          <input type="text" class="kw-leg-cat-icon-emoji" value="${safe(iconEmoji)}" placeholder="📋" style="width:100%;">
        </div>

        <!-- Imagen -->
        <div style="flex:0 0 180px;">
          <label class="small">Imagen <span style="color:#9ca3af;">(reemplaza emoji)</span></label>
          <div class="media-input-row" style="display:flex;gap:0.4rem;align-items:center;">
            <input type="url" class="kw-leg-cat-icon-url" value="${safe(iconUrl)}" placeholder="https://..." style="flex:1;min-width:0;">
            <button type="button" class="secondary small-btn media-picker-btn" title="Elegir desde biblioteca">📁</button>
          </div>
          <div class="kw-leg-cat-icon-preview" style="min-height:32px;">${iconPreview}</div>
        </div>

        <!-- Título -->
        <div style="flex:1;min-width:160px;">
          <label class="small">Nombre de categoría</label>
          <input type="text" class="kw-leg-cat-title" value="${safe(cat.category_title || cat.title || "")}" placeholder="Ej: Marco Normativo" style="width:100%;">
        </div>

        <!-- Subtítulo -->
        <div style="flex:1;min-width:160px;">
          <label class="small">Subtítulo <span style="color:#9ca3af;">(opcional)</span></label>
          <input type="text" class="kw-leg-cat-subtitle" value="${safe(cat.subtitle || "")}" placeholder="Descripción breve" style="width:100%;">
        </div>

        <!-- Acciones -->
        <div style="display:flex;gap:0.35rem;align-items:flex-end;padding-bottom:2px;">
          <button type="button" class="secondary small-btn kw-cat-move-up" title="Subir">↑</button>
          <button type="button" class="secondary small-btn kw-cat-move-down" title="Bajar">↓</button>
          <button type="button" class="secondary small-btn danger kw-cat-remove">✕</button>
        </div>
      </div>

      <!-- Grupos de normas -->
      <div class="kw-admin-leg-groups" style="margin-bottom:0.35rem;"></div>
      <button type="button" class="secondary small-btn kw-group-add" style="font-size:0.8rem;">+ Grupo</button>`;

    // Live preview del icono
    const iconUrlInput = div.querySelector(".kw-leg-cat-icon-url");
    const iconPreviewEl = div.querySelector(".kw-leg-cat-icon-preview");
    iconUrlInput.addEventListener("input", () => {
      const val = iconUrlInput.value.trim();
      iconPreviewEl.innerHTML = val
        ? `<img src="${val}" alt="" style="height:28px;width:28px;object-fit:contain;border-radius:3px;margin-top:4px;">`
        : "";
    });

    // Render groups
    const groupsContainer = div.querySelector(".kw-admin-leg-groups");
    groups.forEach((g, gi) => {
      groupsContainer.appendChild(buildLegGroupBlock(g, gi));
    });

    // Add group button
    div.querySelector(".kw-group-add").addEventListener("click", () => {
      const newGi = groupsContainer.querySelectorAll(".kw-admin-leg-group").length;
      groupsContainer.appendChild(buildLegGroupBlock({ title: "", norms: [] }, newGi));
    });

    // Category actions
    div.querySelector(".kw-cat-remove").addEventListener("click", () => {
      if (confirm("¿Eliminar esta categoría y todas sus normas?")) {
        div.remove();
      }
    });
    div.querySelector(".kw-cat-move-up").addEventListener("click", () => {
      const prev = div.previousElementSibling;
      if (prev) div.parentNode.insertBefore(div, prev);
    });
    div.querySelector(".kw-cat-move-down").addEventListener("click", () => {
      const next = div.nextElementSibling;
      if (next) div.parentNode.insertBefore(next, div);
    });

    return div;
  }

  function collectLegislacionFromDom(tab) {
    const cont = q(`kw-leg-cats-${tab}`);
    if (!cont) return [];
    return Array.from(cont.querySelectorAll(".kw-admin-leg-cat")).map((card) => {
      const groups = Array.from(card.querySelectorAll(".kw-admin-leg-group")).map((groupEl) => ({
        title: (groupEl.querySelector(".kw-leg-group-title")?.value || "").trim(),
        norms: Array.from(groupEl.querySelectorAll(".kw-norm-row")).map((row) => ({
          title: (row.querySelector(".kw-norm-title")?.value || "").trim(),
          url:   (row.querySelector(".kw-norm-url")?.value   || "").trim(),
        })).filter((n) => n.title || n.url),
      })).filter((g) => g.norms.length > 0);
      return {
        icon_emoji:     (card.querySelector(".kw-leg-cat-icon-emoji")?.value || "").trim(),
        icon_url:       (card.querySelector(".kw-leg-cat-icon-url")?.value   || "").trim(),
        category_title: (card.querySelector(".kw-leg-cat-title")?.value      || "").trim(),
        subtitle:       (card.querySelector(".kw-leg-cat-subtitle")?.value   || "").trim(),
        groups,
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     BOLETINES DEL TRIBUNAL FISCAL
     ══════════════════════════════════════════════════════════════════════ */

  async function loadBoletines() {
    const status = q("status-boletines");
    if (status) status.textContent = "Cargando...";
    try {
      const res = await fetch(`${API_BASE}/api/katweb/boletines`);
      if (!res.ok) throw new Error("load");
      boletinesData = (await res.json()) || [];
      renderBoletinesAdmin();
      if (status) status.textContent = `${boletinesData.length} boletines`;
    } catch (err) {
      console.error("Error cargando boletines", err);
      if (status) status.textContent = "Error al cargar boletines";
    }
  }

  function renderBoletinesAdmin() {
    const cont = q("kw-boletines-list-admin");
    if (!cont) return;
    if (!boletinesData.length) {
      cont.innerHTML = '<p class="small" style="color:#6b7280;">Sin boletines registrados.</p>';
      return;
    }

    // Group by year (descending)
    const byYear = {};
    boletinesData.forEach((b) => {
      if (!byYear[b.year]) byYear[b.year] = [];
      byYear[b.year].push(b);
    });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

    cont.innerHTML = years
      .map((year) => {
        const rows = byYear[year]
          .sort((a, b) => a.position - b.position)
          .map(
            (b) => `
          <div class="kw-admin-boletin-row" data-id="${b.id}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;padding:0.4rem 0.5rem;border:1px solid #e5e7eb;border-radius:4px;background:#fff;">
            <span style="flex:0 0 auto;min-width:90px;font-size:0.85rem;">${safe(b.month_label)}</span>
            <input type="url" class="kw-bol-pdf-url" value="${safe(b.pdf_url || "")}" placeholder="URL PDF" style="flex:1;font-size:0.85rem;">
            <button type="button" class="secondary small-btn kw-bol-row-delete danger" style="flex-shrink:0;">✕</button>
          </div>`
          )
          .join("");

        return `
        <details style="margin-bottom:0.5rem;" open>
          <summary style="cursor:pointer;font-weight:600;padding:0.35rem 0;border-bottom:1px solid #e5e7eb;margin-bottom:0.5rem;">${year}</summary>
          <div class="kw-year-boletines" data-year="${year}">
            ${rows}
          </div>
        </details>`;
      })
      .join("");

    // Wire delete buttons
    cont.querySelectorAll(".kw-bol-row-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".kw-admin-boletin-row");
        const id = Number(row.dataset.id);
        boletinesData = boletinesData.filter((b) => b.id !== id);
        row.remove();
      });
    });

  }

  async function saveBoletines() {
    const status = q("status-boletines");
    if (status) status.textContent = "Guardando...";

    // Collect updated URLs from DOM
    const cont = q("kw-boletines-list-admin");
    if (cont) {
      cont.querySelectorAll(".kw-admin-boletin-row").forEach((row) => {
        const id = Number(row.dataset.id);
        const url = (row.querySelector(".kw-bol-pdf-url")?.value || "").trim();
        const b = boletinesData.find((x) => x.id === id);
        if (b) b.pdf_url = url;
      });
    }

    try {
      const token = window.__katwebAdminToken__ || "";
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/katweb/boletines`, {
        method: "POST",
        headers,
        body: JSON.stringify({ boletines: boletinesData }),
      });
      if (!res.ok) throw new Error("save");
      const result = await res.json();
      boletinesData = result.boletines || boletinesData;
      renderBoletinesAdmin();
      if (status) status.textContent = "Boletines guardados ✓";
    } catch (err) {
      console.error("Error guardando boletines", err);
      if (status) status.textContent = "Error al guardar";
    }
  }

  function addBoletin() {
    const year = parseInt(q("kw-bol-year")?.value || "0", 10);
    const month = (q("kw-bol-month")?.value || "").trim();
    const url = (q("kw-bol-url")?.value || "").trim();

    if (!year || !month) {
      alert("Completa el año y la etiqueta del mes.");
      return;
    }

    const maxId = boletinesData.reduce((m, b) => Math.max(m, b.id || 0), 0);
    boletinesData.push({
      id: maxId + 1,
      year,
      month_label: month,
      pdf_url: url,
      position: boletinesData.filter((b) => b.year === year).length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Clear inputs
    const clearEl = (id) => { const e = q(id); if (e) e.value = ""; };
    clearEl("kw-bol-year");
    clearEl("kw-bol-month");
    clearEl("kw-bol-url");

    renderBoletinesAdmin();
  }

  /* ══════════════════════════════════════════════════════════════════════
     EVENT LISTENERS
     ══════════════════════════════════════════════════════════════════════ */

  function init() {
    /* ── katweb:open-form ─────────────────────────────────────────────── */
    document.addEventListener("katweb:open-form", (evt) => {
      const entry = evt.detail || {};
      currentSlug = entry.slug || "";
      try {
        currentMeta = entry.meta_json ? JSON.parse(entry.meta_json) : {};
      } catch (_) {
        currentMeta = {};
      }
      // Show a warning banner if this entry's detail failed to load from the API.
      // Saving in this state risks wiping meta_json data stored in the DB.
      const section = q("kdbweb-meta-section");
      let warnEl = q("kdbweb-detail-load-warning");
      if (entry._detailFailed) {
        if (!warnEl && section) {
          warnEl = document.createElement("div");
          warnEl.id = "kdbweb-detail-load-warning";
          warnEl.style.cssText = "background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:0.6rem 0.9rem;margin-bottom:1rem;color:#92400e;font-size:0.85rem;";
          section.insertBefore(warnEl, section.firstChild);
        }
        if (warnEl) warnEl.textContent = "⚠️ No se pudieron cargar los datos guardados de esta subpágina (error de red). Haz clic en 'Revertir cambios' antes de guardar para evitar perder información.";
      } else if (warnEl) {
        warnEl.remove();
      }
      showMetaSection(currentSlug, currentMeta);
    });

    /* ── katweb:collect-meta ──────────────────────────────────────────── */
    document.addEventListener("katweb:collect-meta", (evt) => {
      const entry = evt.detail;
      if (entry) collectMeta(entry);
    });

    /* ── Legislation tab switcher ─────────────────────────────────────── */
    document.addEventListener("click", (evt) => {
      const btn = evt.target.closest(".kw-meta-tab-btn");
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (!tab) return;

      // Update active state
      document.querySelectorAll(".kw-meta-tab-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.tab === tab);
      });

      // Show/hide panels
      const panels = { tributaria: "kw-leg-tributaria-admin", aduanera: "kw-leg-aduanera-admin" };
      Object.entries(panels).forEach(([key, id]) => {
        const el = q(id);
        if (el) el.classList.toggle("hidden", key !== tab);
      });

      legCurrentTab = tab;
    });

    /* ── Casaciones: add suggestion item ─────────────────────────────── */
    document.addEventListener("click", (evt) => {
      if (!evt.target.closest("#kdbweb-cas-sug-add")) return;
      const inp = q("kdbweb-cas-sug-new-item");
      const text = (inp?.value || "").trim();
      if (!text) return;
      const cont = q("kdbweb-cas-sug-items");
      if (cont) cont.appendChild(buildCasSugItem(text));
      if (inp) inp.value = "";
    });

    /* ── Casaciones: delete suggestion item ───────────────────────────── */
    document.addEventListener("click", (evt) => {
      const btn = evt.target.closest(".kw-cas-sug-delete");
      if (!btn) return;
      btn.closest("[data-cas-item-text]")?.remove();
    });

    /* ── Add treaty button ────────────────────────────────────────────── */
    document.addEventListener("click", (evt) => {
      if (!evt.target.closest("#kw-treaty-add")) return;
      const cont = q("kw-treaties-admin");
      if (!cont) return;
      const card = buildTreatyCard({}, cont.children.length);
      cont.appendChild(card);
    });

    /* ── Add legislation category buttons ────────────────────────────── */
    document.addEventListener("click", (evt) => {
      const btn = evt.target.closest("#kw-leg-add-cat-tributaria, #kw-leg-add-cat-aduanera");
      if (!btn) return;
      const tab = btn.id.includes("tributaria") ? "tributaria" : "aduanera";
      const cont = q(`kw-leg-cats-${tab}`);
      if (!cont) return;
      const card = buildLegCatCard(tab, { category_title: "", norms: [] }, cont.children.length);
      cont.appendChild(card);
    });

    /* ── Boletines: add row ───────────────────────────────────────────── */
    document.addEventListener("click", (evt) => {
      if (!evt.target.closest("#kw-bol-add")) return;
      addBoletin();
    });

    /* ── Boletines: save ─────────────────────────────────────────────── */
    document.addEventListener("click", (evt) => {
      if (!evt.target.closest("#kw-save-boletines")) return;
      saveBoletines();
    });

    /* ── Boletines: reload ───────────────────────────────────────────── */
    document.addEventListener("click", (evt) => {
      if (!evt.target.closest("#kw-reload-boletines")) return;
      loadBoletines();
    });

    /* ── Load boletines when kdbweb section is first visited ──────────── */
    document.addEventListener("click", (evt) => {
      const btn = evt.target.closest('[data-page="kdbweb"]');
      if (!btn) return;
      // Small delay so admin.js finishes its own loading first
      setTimeout(loadBoletines, 400);
    });

    /* ── Expose token hook: admin.js sets window.__katwebAdminToken__
          after successful login. We read it via the same global. ──────── */
    // The admin panel sets the token on the Authorization header for all
    // apiFetch calls. We piggyback by monkey-patching the fetch used here.
    // Since admin.js keeps the token in a closure, we rely on admin exposing
    // it via a global when it initializes. Add a listener:
    document.addEventListener("katweb:token-ready", (evt) => {
      window.__katwebAdminToken__ = evt.detail || "";
    });
  }

  /* ─── Bootstrap ────────────────────────────────────────────────────────── */
  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  console.info("katweb-admin.js loaded");
})();
