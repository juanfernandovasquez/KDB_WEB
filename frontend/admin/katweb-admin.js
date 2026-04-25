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
    "constitucion": "access",
    "casaciones-de-la-corte-suprema": "access",
    "sentencias-del-tc": "access",
    "doctrina": "doctrina_access",   // uses cta_url, not access_url
    "tribunal-fiscal": "tf",
    "tratados-internacionales": "tratados",
    "legislacion-tributaria-aduanera": "legislacion",
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
    ["kdbweb-meta-access", "kdbweb-meta-tf",
     "kdbweb-meta-tratados", "kdbweb-meta-legislacion",
     "kdbweb-meta-raw"].forEach((id) => {
      const el = q(id);
      if (el) el.classList.add("hidden");
    });

    const type = SLUG_TYPE[slug];
    if (!type) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");

    if (type === "access" || type === "doctrina_access") {
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
      // tools is an array: [{url, label}, {url, label}]
      const tools = meta.tools || [];
      setf("kdbweb-meta-tf-title1", (tools[0] && tools[0].label) || "Buscador del Tribunal Fiscal");
      setf("kdbweb-meta-tf-url1",   (tools[0] && tools[0].url)   || "");
      setf("kdbweb-meta-tf-title2", (tools[1] && tools[1].label) || "Portal de Resoluciones SUNAT");
      setf("kdbweb-meta-tf-url2",   (tools[1] && tools[1].url)   || "");
    } else if (type === "tratados") {
      const el = q("kdbweb-meta-tratados");
      if (el) el.classList.remove("hidden");
      // Textos de la sección izquierda/derecha
      const leftInp = q("kw-tratados-left-title");
      if (leftInp) leftInp.value = meta.left_title || "¿Qué es y\npor qué importa?";
      const rightTa = q("kw-tratados-right-content");
      if (rightTa) rightTa.value = meta.right_content || "";
      const secInp = q("kw-tratados-section-title");
      if (secInp) secInp.value = meta.section_title || "";
      // Lista de convenios
      renderTreatiesAdmin(meta.entries || []);
    } else if (type === "legislacion") {
      const el = q("kdbweb-meta-legislacion");
      if (el) el.classList.remove("hidden");
      renderLegislacionAdmin("tributaria", meta.tributaria || []);
      renderLegislacionAdmin("aduanera",   meta.aduanera   || []);
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
    if (type === "access" || type === "doctrina_access") {
      const key = ACCESS_KEY[type] || "access_url";
      meta[key] = (q("kdbweb-meta-access-url")?.value || "").trim();
    } else if (type === "tf") {
      // Save as tools array to match katweb-pages.js format
      meta.tools = [
        {
          label: (q("kdbweb-meta-tf-title1")?.value || "").trim() || "Buscador del Tribunal Fiscal",
          url:   (q("kdbweb-meta-tf-url1")?.value   || "").trim(),
        },
        {
          label: (q("kdbweb-meta-tf-title2")?.value || "").trim() || "Portal de Resoluciones SUNAT",
          url:   (q("kdbweb-meta-tf-url2")?.value   || "").trim(),
        },
      ];
    } else if (type === "tratados") {
      const leftVal = (q("kw-tratados-left-title")?.value  || "").trim();
      const rightVal = (q("kw-tratados-right-content")?.value || "").trim();
      const secVal  = (q("kw-tratados-section-title")?.value || "").trim();
      if (leftVal)  meta.left_title     = leftVal;
      if (rightVal) meta.right_content  = rightVal;
      if (secVal)   meta.section_title  = secVal;
      meta.entries = collectTreatiesFromDom();
    } else if (type === "legislacion") {
      meta.tributaria = collectLegislacionFromDom("tributaria");
      meta.aduanera   = collectLegislacionFromDom("aduanera");
    }

    entry.meta_json = JSON.stringify(meta);

    // Update preview
    const preview = q("kdbweb-meta-json-preview");
    if (preview) preview.textContent = JSON.stringify(meta, null, 2);
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

  function buildLegCatCard(tab, cat, idx) {
    const div = document.createElement("div");
    div.className = "kw-admin-leg-cat";
    div.dataset.idx = idx;
    div.style.cssText =
      "border:1px solid #d1d5db;border-radius:6px;padding:0.75rem 1rem;margin-bottom:0.75rem;background:#f9fafb;";

    // Build norms HTML
    const normsHtml = (cat.norms || [])
      .map(
        (n, ni) => `
      <div class="kw-norm-row" data-ni="${ni}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;">
        <input type="text" class="kw-norm-title" value="${safe(n.title || "")}" placeholder="Norma" style="flex:1;">
        <input type="url"  class="kw-norm-url"   value="${safe(n.url   || "")}" placeholder="URL" style="flex:1;">
        <button type="button" class="secondary small-btn kw-norm-remove">✕</button>
      </div>`
      )
      .join("");

    div.innerHTML = `
      <div style="display:flex;gap:0.75rem;align-items:flex-start;margin-bottom:0.5rem;">
        <div style="flex:1;">
          <label class="small">Categoría</label>
          <input type="text" class="kw-leg-cat-title" value="${safe(cat.category_title || cat.title || "")}" placeholder="Nombre de categoría" style="width:100%;">
        </div>
        <div style="display:flex;gap:0.35rem;align-items:flex-end;">
          <button type="button" class="secondary small-btn kw-cat-move-up" title="Subir">↑</button>
          <button type="button" class="secondary small-btn kw-cat-move-down" title="Bajar">↓</button>
          <button type="button" class="secondary small-btn danger kw-cat-remove">✕ Eliminar cat.</button>
        </div>
      </div>
      <div class="kw-norms-list" style="padding-left:0.5rem;">
        ${normsHtml}
      </div>
      <button type="button" class="secondary small-btn kw-norm-add" style="margin-top:0.35rem;">+ Norma</button>`;

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

    // Add norm
    div.querySelector(".kw-norm-add").addEventListener("click", () => {
      const list = div.querySelector(".kw-norms-list");
      const addBtn = div.querySelector(".kw-norm-add");
      const row = document.createElement("div");
      row.className = "kw-norm-row";
      row.style.cssText = "display:flex;gap:0.5rem;align-items:center;margin-bottom:0.35rem;";
      row.innerHTML = `
        <input type="text" class="kw-norm-title" placeholder="Nombre de la norma" style="flex:1;">
        <input type="url"  class="kw-norm-url"   placeholder="https://..." style="flex:1;">
        <button type="button" class="secondary small-btn kw-norm-remove">✕</button>`;
      row.querySelector(".kw-norm-remove").addEventListener("click", () => row.remove());
      list.appendChild(row);
    });

    // Existing norm remove buttons
    div.querySelectorAll(".kw-norm-remove").forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".kw-norm-row").remove());
    });

    return div;
  }

  function collectLegislacionFromDom(tab) {
    const cont = q(`kw-leg-cats-${tab}`);
    if (!cont) return [];
    return Array.from(cont.querySelectorAll(".kw-admin-leg-cat")).map((card) => {
      const norms = Array.from(card.querySelectorAll(".kw-norm-row")).map((row) => ({
        title: (row.querySelector(".kw-norm-title")?.value || "").trim(),
        url:   (row.querySelector(".kw-norm-url")?.value   || "").trim(),
      })).filter((n) => n.title || n.url);
      return {
        category_title: (card.querySelector(".kw-leg-cat-title")?.value || "").trim(),
        norms,
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
