"use strict";

(() => {
  if (window.__KDB_ADMIN_BOOTED__) {
    console.warn("admin.js already initialized");
    return;
  }
  window.__KDB_ADMIN_BOOTED__ = true;
  console.log("admin.js bootstrap");

  const API_BASE = window.API_BASE || "";
  let adminToken = "";
  const getAuthToken = () => adminToken || "";
  const setAuthToken = (token) => {
    adminToken = token || "";
    // Expose token to katweb-admin.js (same origin, no security issue)
    window.__katwebAdminToken__ = adminToken;
    document.dispatchEvent(new CustomEvent("katweb:token-ready", { detail: adminToken }));
  };
  const apiFetch = (path, options = {}) => {
    const token = getAuthToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return window.fetch(`${API_BASE}${path}`, { ...options, headers });
  };

  window.addEventListener("error", (ev) => {
    console.error("Global error:", ev.message, ev.error);
  });

  const q = (id) => document.getElementById(id);

  const getVal = (id) => (q(id)?.value || "").trim();
  const setVal = (id, val) => {
    const el = q(id);
    if (el) {
      el.value = val || "";
      el.placeholder = val || "";
    }
  };
  const setText = (id, val) => {
    const el = q(id);
    if (el) el.textContent = val || "";
  };

  const showAuthOverlay = (show) => {
    const overlay = q("admin-auth");
    if (!overlay) return;
    overlay.classList.toggle("show", !!show);
    overlay.setAttribute("aria-hidden", show ? "false" : "true");
  };

  const setCurrentAdminLabel = (label) => {
    const el = q("admin-user-label");
    if (el) el.textContent = label || "";
  };

  const safe = (str) => {
    const s = str == null ? "" : String(str);
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  const slugify = (value) => {
    return (value || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };
  const removeImageNode = (img, editor) => {
    if (!img) return;
    const wrap = img.closest(".img-resizable");
    const target = wrap || img;
    const hostEditor = editor || target.closest(".editor-surface");
    const sel = document.getSelection();
    if (hostEditor && sel) {
      try {
        hostEditor.focus();
        const range = document.createRange();
        range.selectNode(target);
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand("delete", false, null);
        if (ok) {
          selectedImage = null;
          return;
        }
      } catch (err) {
        console.warn("removeImageNode fallback", err);
      }
    }
    target.remove();
    selectedImage = null;
  };
  const linkEnsurers = {};
  const getEditorHTML = (id) => {
    const el = q(id);
    return el ? el.innerHTML : "";
  };
  const PUBLICATION_TEXT_COLORS = {
    "#0b3b91": "text-color-brand-blue",
    "#b07d2f": "text-color-brand-gold",
    "#233656": "text-color-deep-blue",
    "#4b5563": "text-color-gray",
    "#111111": "text-color-black",
  };
  const PUBLICATION_HIGHLIGHTS = {
    "#fff4bf": "highlight-soft-yellow",
    "#dbeafe": "highlight-soft-blue",
    "#dcfce7": "highlight-soft-green",
    "#fee2e2": "highlight-soft-red",
    "#f3e8ff": "highlight-soft-lilac",
  };
  let publicationEditor = null;
  let publicationEditorReady = null;
  let publicationEditorSelection = null;
  let mediaTargetTiptap = null;
  let imagePickerEl = null;
  let selectedImage = null;
  let mediaTargetEditor = null;
  let mediaTargetInput = null;
  let mediaCache = [];
  let mediaFolders = [];
  let currentMediaPrefix = "";
  let logoGalleryPrefix = "logos/";
  let faviconGalleryPrefix = "favicons/";
  let mediaViewMode = "grid";
  let mediaNavHistory = [];
  let mediaNavFuture = [];
  let selectedMediaItem = null;
  let movePickerKey = null;
  const resolveCssColor = (value) => {
    if (!value) return "";
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = window.getComputedStyle(probe).color;
    probe.remove();
    return resolved || value;
  };
  const buildResolvedColorMap = (source) => {
    const map = {};
    Object.entries(source).forEach(([hex, cls]) => {
      map[resolveCssColor(hex)] = { hex, cls };
      map[hex.toLowerCase()] = { hex, cls };
    });
    return map;
  };
  const PUBLICATION_TEXT_COLOR_LOOKUP = () => buildResolvedColorMap(PUBLICATION_TEXT_COLORS);
  const PUBLICATION_HIGHLIGHT_LOOKUP = () => buildResolvedColorMap(PUBLICATION_HIGHLIGHTS);
  const isHttpUrl = (value) => {
    const clean = (value || "").trim().toLowerCase();
    return clean.startsWith("http://") || clean.startsWith("https://");
  };

  // Renders an image picker field (no URL text visible, only preview + buttons)
  const imgPickerField = (fieldName, value) => {
    const url = (value || "").trim();
    const hasImg = !!url;
    return `
      <div class="image-picker-field">
        <input type="hidden" data-field="${fieldName}" value="${safe(url)}">
        <div class="img-picker-preview">
          <img class="img-picker-thumb" src="${safe(url)}" alt="Vista previa" style="display:${hasImg ? "block" : "none"}">
          <span class="img-picker-empty" style="display:${hasImg ? "none" : ""}">Sin imagen seleccionada</span>
        </div>
        <div class="img-picker-actions">
          <button type="button" class="secondary small-btn media-picker-btn">Elegir imagen</button>
          <button type="button" class="secondary small-btn danger img-picker-clear" style="display:${hasImg ? "" : "none"}">&#10005; Quitar</button>
        </div>
      </div>
    `;
  };

  // Sets an image picker field value and updates the preview
  const setImgPicker = (id, url) => {
    const input = q(id);
    if (!input) return;
    const cleanUrl = (url || "").trim();
    input.value = cleanUrl;
    const field = input.closest(".image-picker-field");
    if (!field) return;
    const thumb = field.querySelector(".img-picker-thumb");
    const empty = field.querySelector(".img-picker-empty");
    const clearBtn = field.querySelector(".img-picker-clear");
    const hasImg = !!cleanUrl;
    if (thumb) { thumb.src = cleanUrl; thumb.style.display = hasImg ? "block" : "none"; }
    if (empty) empty.style.display = hasImg ? "none" : "";
    if (clearBtn) clearBtn.style.display = hasImg ? "" : "none";
  };
  const insertImageIntoEditor = (editor, url) => {
    const cleanUrl = (url || "").trim();
    if (!cleanUrl) return;
    if (!isHttpUrl(cleanUrl)) {
      alert("Solo se aceptan URLs http/https para las imagenes.");
      return;
    }
    editor.focus();
    const sel = window.getSelection();
    const anchorInEditor = sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode);
    if (!anchorInEditor) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("insertImage", false, cleanUrl);
    editor.querySelectorAll("img").forEach((img) => {
      img.onload = () => {
        img.style.height = "auto";
        img.style.maxWidth = "100%";
      };
      const wrap = makeResizable(img);
      img.classList.add("img-align-center");
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      if (wrap) wrap.style.maxWidth = "100%";
    });
    const lastImg = editor.querySelector("img:last-of-type");
    if (lastImg) selectImage(lastImg, editor);
    editor.focus();
  };
  const applyMediaSelection = (url) => {
    const cleanUrl = (url || "").trim();
    if (!cleanUrl) return;
    if (mediaTargetInput) {
      if (!isHttpUrl(cleanUrl)) {
        alert("Solo se aceptan URLs http/https para las imagenes.");
        return;
      }
      mediaTargetInput.value = cleanUrl;
      mediaTargetInput.dispatchEvent(new Event("input", { bubbles: true }));
      // Update image-picker-field preview if this input lives inside one
      const pickerField = mediaTargetInput.closest(".image-picker-field");
      if (pickerField) {
        const thumb = pickerField.querySelector(".img-picker-thumb");
        const empty = pickerField.querySelector(".img-picker-empty");
        const clearBtn = pickerField.querySelector(".img-picker-clear");
        if (thumb) { thumb.src = cleanUrl; thumb.style.display = "block"; }
        if (empty) empty.style.display = "none";
        if (clearBtn) clearBtn.style.display = "";
      }
      if (mediaTargetInput.id === "c-logo-url") {
        setLogoPreview(cleanUrl);
      }
      if (mediaTargetInput.id === "c-favicon-url") {
        setFaviconPreview(cleanUrl);
      }
      return;
    }
    if (mediaTargetTiptap) {
      mediaTargetTiptap.chain().focus().setImage({ src: cleanUrl, alt: "" }).run();
      return;
    }
    if (mediaTargetEditor) {
      insertImageIntoEditor(mediaTargetEditor, cleanUrl);
    }
  };
  const setMediaStatus = (msg) => {
    const el = q("media-status");
    if (el) el.textContent = msg || "";
  };
  const formatFileSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const formatFileDate = (iso) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; }
  };
  const getFileName = (key) => {
    if (currentMediaPrefix && key.startsWith(currentMediaPrefix)) return key.slice(currentMediaPrefix.length);
    return key.split("/").pop() || key;
  };
  const renderMediaBreadcrumb = () => {
    const bc = q("media-breadcrumb");
    if (!bc) return;
    const parts = currentMediaPrefix ? currentMediaPrefix.replace(/\/$/, "").split("/").filter(Boolean) : [];
    const segs = [{ label: "Raíz", prefix: "" }, ...parts.map((p, i) => ({ label: p, prefix: parts.slice(0, i + 1).join("/") + "/" }))];
    bc.innerHTML = segs.map((s, i) => {
      const isLast = i === segs.length - 1;
      const sep = i > 0 ? `<span class="bc-sep">›</span>` : "";
      return `${sep}<button type="button" class="bc-seg${isLast ? " active" : ""}" data-prefix="${safe(s.prefix)}">${safe(s.label)}</button>`;
    }).join("");
  };
  const updateExplorerNavBtns = () => {
    const b = q("media-back"); const f = q("media-forward");
    if (b) b.disabled = !mediaNavHistory.length;
    if (f) f.disabled = !mediaNavFuture.length;
  };
  const setSelectedMediaItem = (item) => {
    selectedMediaItem = item;
    const panel = q("media-preview");
    document.querySelectorAll(".expl-file, .expl-file-row").forEach(el => el.classList.toggle("expl-selected", item ? el.dataset.key === item.key : false));
    if (!item || !panel) { panel?.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    const img = q("preview-img"); const nm = q("preview-name"); const mt = q("preview-meta");
    if (img) img.src = item.url;
    if (nm) nm.textContent = getFileName(item.key);
    if (mt) mt.textContent = [item.size ? formatFileSize(item.size) : null, item.last_modified ? formatFileDate(item.last_modified) : null].filter(Boolean).join("  ·  ");
  };
  const FOLDER_SVG = `<svg viewBox="0 0 56 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:52px;height:40px;display:block">
    <rect x="0" y="10" width="56" height="34" rx="4" fill="#e8a000"/>
    <path d="M0 18 L56 18 L56 44 C56 46.2 54.2 44 52 44 L4 44 C1.8 44 0 46.2 0 44 Z" fill="#ffc107"/>
    <path d="M0 10 C0 7.8 1.8 6 4 6 L19 6 L23 10 Z" fill="#ffa000"/>
  </svg>`;
  const renderMediaBrowser = () => {
    const container = q("media-files");
    if (!container) return;
    renderMediaBreadcrumb();
    updateExplorerNavBtns();
    const term = (q("media-search")?.value || "").toLowerCase().trim();
    const files = mediaCache.filter(item => !term || (item.key || "").toLowerCase().includes(term));
    const folders = term ? [] : (Array.isArray(mediaFolders) ? mediaFolders : []);
    if (mediaViewMode === "grid") {
      container.className = "explorer-files grid";
      if (!files.length && !folders.length) {
        container.innerHTML = `<div class="expl-empty"><span style="font-size:2.5rem">📂</span><span>Carpeta vacía</span></div>`;
        return;
      }
      const folderHtml = folders.map(pref => {
        const label = pref.startsWith(currentMediaPrefix) ? pref.slice(currentMediaPrefix.length).replace(/\/$/, "") : pref.replace(/\/$/, "");
        if (!label) return "";
        return `<div class="expl-folder" data-prefix="${safe(pref)}" title="${safe(label)}">${FOLDER_SVG}<span class="expl-folder-name">${safe(label)}</span></div>`;
      }).join("");
      const fileHtml = files.map(item => {
        const name = getFileName(item.key);
        const sel = selectedMediaItem?.key === item.key ? " expl-selected" : "";
        return `<div class="expl-file${sel}" data-key="${safe(item.key)}" data-url="${safe(item.url)}" title="${safe(name)}">
          <div class="expl-thumb-wrap"><img class="expl-file-thumb" src="${safe(item.url)}" alt="${safe(name)}" loading="lazy" width="120" height="120"></div>
          <span class="expl-file-name">${safe(name)}</span>
          <div class="expl-file-actions">
            <button type="button" class="media-icon-btn" data-action="move" title="Mover">⇥</button>
            <button type="button" class="media-icon-btn" data-action="rename" title="Renombrar">✎</button>
            <button type="button" class="media-icon-btn danger" data-action="delete" title="Eliminar">✕</button>
          </div>
        </div>`;
      }).join("");
      container.innerHTML = folderHtml + fileHtml;
    } else {
      container.className = "explorer-files list";
      if (!files.length && !folders.length) {
        container.innerHTML = `<div class="expl-empty"><span style="font-size:2.5rem">📂</span><span>Carpeta vacía</span></div>`;
        return;
      }
      const folderRows = folders.map(pref => {
        const label = pref.startsWith(currentMediaPrefix) ? pref.slice(currentMediaPrefix.length).replace(/\/$/, "") : pref.replace(/\/$/, "");
        if (!label) return "";
        return `<tr class="expl-folder-row" data-prefix="${safe(pref)}"><td><span style="font-size:1.1rem">📁</span></td><td class="list-name">${safe(label)}</td><td class="list-size">Carpeta</td><td class="list-date">—</td><td></td></tr>`;
      }).join("");
      const fileRows = files.map(item => {
        const name = getFileName(item.key);
        const sel = selectedMediaItem?.key === item.key ? " expl-selected" : "";
        return `<tr class="expl-file-row${sel}" data-key="${safe(item.key)}" data-url="${safe(item.url)}">
          <td><img class="list-thumb" src="${safe(item.url)}" alt="${safe(name)}" loading="lazy" width="38" height="28"></td>
          <td class="list-name">${safe(name)}</td>
          <td class="list-size">${safe(formatFileSize(item.size))}</td>
          <td class="list-date">${safe(formatFileDate(item.last_modified))}</td>
          <td class="list-actions">
            <button type="button" class="media-icon-btn" data-action="move" data-key="${safe(item.key)}" title="Mover">⇥</button>
            <button type="button" class="media-icon-btn" data-action="rename" data-key="${safe(item.key)}" title="Renombrar">✎</button>
            <button type="button" class="media-icon-btn danger" data-action="delete" data-key="${safe(item.key)}" title="Eliminar">✕</button>
          </td>
        </tr>`;
      }).join("");
      container.innerHTML = `<table class="expl-list-table"><thead><tr><th style="width:46px"></th><th>Nombre</th><th style="width:90px">Tamaño</th><th style="width:120px">Fecha</th><th style="width:100px"></th></tr></thead><tbody>${folderRows}${fileRows}</tbody></table>`;
    }
  };
  const closeMovePopover = () => {
    document.getElementById("media-move-popover")?.remove();
    movePickerKey = null;
  };
  const showMovePopover = (key, anchorEl) => {
    closeMovePopover();
    movePickerKey = key;
    const folders = Array.isArray(mediaFolders) ? mediaFolders : [];
    const items = [];
    const parentPrefix = (() => {
      const clean = currentMediaPrefix.replace(/\/$/, "");
      if (!clean) return null;
      const idx = clean.lastIndexOf("/");
      return idx < 0 ? "" : clean.slice(0, idx + 1);
    })();
    // Parent folder option
    if (parentPrefix !== null) {
      const parentName = parentPrefix ? parentPrefix.replace(/\/$/, "").split("/").pop() : "Raíz";
      items.push({ label: `📁 ↑ ${parentName}`, prefix: parentPrefix });
    }
    // Root option only if parent isn't already root
    if (parentPrefix !== null && parentPrefix !== "") {
      items.push({ label: "📁 Raíz", prefix: "" });
    }
    // Subfolders at current level
    folders.forEach(pref => {
      const label = pref.startsWith(currentMediaPrefix) ? pref.slice(currentMediaPrefix.length).replace(/\/$/, "") : pref.replace(/\/$/, "");
      if (label) items.push({ label: `📁 ${label}`, prefix: pref });
    });
    if (!items.length) { setMediaStatus("No hay otras carpetas disponibles"); return; }
    const popover = document.createElement("div");
    popover.id = "media-move-popover";
    popover.className = "move-popover";
    popover.innerHTML = `<div class="move-popover-title">Mover a:</div>` +
      items.map(it => `<button class="move-folder-btn" data-target="${safe(it.prefix)}">${safe(it.label)}</button>`).join("");
    const rect = anchorEl.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.zIndex = "9999";
    popover.style.top = (rect.bottom + 4) + "px";
    popover.style.right = Math.max(4, window.innerWidth - rect.right) + "px";
    popover.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".move-folder-btn");
      if (!btn || !movePickerKey) return;
      ev.stopPropagation();
      const targetPrefix = btn.dataset.target;
      const key = movePickerKey;
      closeMovePopover();
      setMediaStatus("Moviendo imagen...");
      try {
        const res = await apiFetch("/api/media/move", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, target_prefix: targetPrefix })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMediaStatus(data.error || "No se pudo mover la imagen"); return; }
        setMediaStatus("Imagen movida");
        mediaCache = mediaCache.filter(i => i.key !== key);
        if (selectedMediaItem?.key === key) setSelectedMediaItem(null);
        renderMediaBrowser();
      } catch { setMediaStatus("No se pudo mover la imagen"); }
    });
    document.body.appendChild(popover);
    setTimeout(() => document.addEventListener("click", closeMovePopover, { once: true }), 0);
  };
  const navigateToPrefix = async (prefix, pushHistory = true) => {
    if (pushHistory) { mediaNavHistory.push(currentMediaPrefix); mediaNavFuture = []; }
    currentMediaPrefix = normalizePrefix(prefix);
    setSelectedMediaItem(null);
    await loadMediaLibrary();
  };
  const loadMediaLibrary = async () => {
    setMediaStatus("Cargando...");
    const container = q("media-files");
    if (container) container.innerHTML = `<div class="expl-empty"><span style="font-size:1.5rem">⏳</span><span>Cargando...</span></div>`;
    try {
      const params = new URLSearchParams();
      if (currentMediaPrefix) params.set("prefix", currentMediaPrefix);
      params.set("delimiter", "1");
      const url = params.toString() ? `/api/media?${params.toString()}` : "/api/media";
      const res = await apiFetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMediaStatus(data.error || "No se pudo cargar el repositorio");
        mediaCache = []; mediaFolders = [];
        renderMediaBrowser();
        return;
      }
      mediaCache = Array.isArray(data.items) ? data.items : [];
      mediaFolders = Array.isArray(data.folders) ? data.folders : [];
      if (typeof data.prefix === "string") currentMediaPrefix = normalizePrefix(data.prefix);
      const delBtn = q("media-delete-folder");
      if (delBtn) delBtn.disabled = !currentMediaPrefix;
      const count = mediaCache.length + mediaFolders.length;
      setMediaStatus(count ? `${mediaCache.length} imagen${mediaCache.length !== 1 ? "es" : ""}, ${mediaFolders.length} carpeta${mediaFolders.length !== 1 ? "s" : ""}` : "Carpeta vacía");
      renderMediaBrowser();
    } catch (err) {
      console.error("Error loading media", err);
      setMediaStatus("Error al cargar el repositorio");
    }
  };
  const openMediaModal = async () => {
    const modal = q("media-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    const prefixInput = q("media-prefix");
    if (prefixInput) prefixInput.value = currentMediaPrefix;
    await loadMediaLibrary();
    q("media-search")?.focus();
  };
  const openMediaModalForEditor = async (editor) => {
    mediaTargetTiptap = null;
    mediaTargetEditor = editor || null;
    mediaTargetInput = null;
    await openMediaModal();
  };
  const openMediaModalForInput = async (input) => {
    mediaTargetTiptap = null;
    mediaTargetInput = input || null;
    mediaTargetEditor = null;
    await openMediaModal();
  };
  const openMediaModalForTiptap = async (editor) => {
    mediaTargetTiptap = editor || null;
    mediaTargetEditor = null;
    mediaTargetInput = null;
    await openMediaModal();
  };
  const closeMediaModal = () => {
    const modal = q("media-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    mediaTargetEditor = null;
    mediaTargetInput = null;
    mediaTargetTiptap = null;
    selectedMediaItem = null;
    q("media-preview")?.classList.add("hidden");
  };
  const normalizePrefix = (value) => {
    let prefix = (value || "").trim().replace(/^\/+/, "");
    if (prefix && !prefix.endsWith("/")) prefix += "/";
    return prefix;
  };
  const getParentPrefix = (value) => {
    const clean = normalizePrefix(value).replace(/\/$/, "");
    if (!clean) return "";
    const idx = clean.lastIndexOf("/");
    if (idx === -1) return "";
    return clean.slice(0, idx + 1);
  };
  const compressImageFile = (file, maxWidth = 1920, quality = 0.82) => {
    if (!file.type.startsWith("image/")) return Promise.resolve(file);
    if (file.type === "image/svg+xml" || file.type === "image/gif") return Promise.resolve(file);
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width <= maxWidth && file.size < 300 * 1024) { resolve(file); return; }
        if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const isPng = file.type === "image/png";
        const outType = isPng ? "image/png" : "image/jpeg";
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: outType, lastModified: file.lastModified }));
        }, outType, isPng ? undefined : quality);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  };
  const uploadMediaFile = async (file) => {
    if (!file) return;
    setMediaStatus("Optimizando imagen...");
    file = await compressImageFile(file);
    setMediaStatus("Preparando subida...");
    try {
      const res = await apiFetch("/api/media/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "",
          size: file.size || 0,
          prefix: currentMediaPrefix,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMediaStatus(data.error || "No se pudo preparar la subida");
        return;
      }
      const post = data.post || {};
      const form = new FormData();
      Object.entries(post.fields || {}).forEach(([k, v]) => form.append(k, v));
      form.append("file", file);
      const uploadRes = await fetch(post.url, { method: "POST", body: form });
      if (!uploadRes.ok) {
        setMediaStatus("Error al subir la imagen");
        return;
      }
      if (data.url) {
        mediaCache.unshift({
          key: data.key || file.name,
          url: data.url,
          size: file.size || 0,
          last_modified: new Date().toISOString(),
        });
        renderMediaBrowser();
      } else {
        await loadMediaLibrary();
      }
      setMediaStatus("Imagen subida");
    } catch (err) {
      console.error("Error uploading media", err);
      setMediaStatus("Error al subir la imagen");
    }
  };
  const makeResizable = (img) => {
    if (!img) return img;
    const existingWrapper = img.closest(".img-resizable");
    if (existingWrapper) return existingWrapper;
    const wrapper = document.createElement("span");
    wrapper.className = "img-resizable";
    wrapper.contentEditable = "false";
    wrapper.draggable = true;
    img.replaceWith(wrapper);
    wrapper.appendChild(img);
    img.draggable = true;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "img-delete";
    del.textContent = "×";
    del.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      removeImageNode(img, wrapper.closest(".editor-surface"));
    });
    wrapper.appendChild(del);
    ["img-wrap-square", "img-wrap-block", "img-align-left", "img-align-center", "img-align-right"].forEach((cls) => {
      if (img.classList.contains(cls)) wrapper.classList.add(cls);
    });
    const syncSizeToImg = () => {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width) {
        const w = `${rect.width}px`;
        wrapper.style.width = w;
        img.style.width = w;
        img.dataset.imgWidth = w;
      }
      if (rect.height && rect.height > 4) {
        const h = `${rect.height}px`;
        wrapper.style.height = h;
        img.style.height = h;
        img.dataset.imgHeight = h;
      } else {
        wrapper.style.height = "auto";
        img.style.height = img.style.height || "auto";
      }
    };
    // restore saved sizes if present (data attrs, inline style, or width/height attrs)
    const savedW = img.dataset.imgWidth || img.style.width || img.getAttribute("width");
    const savedH = img.dataset.imgHeight || img.style.height || img.getAttribute("height");
    if (savedW) {
      wrapper.style.width = savedW;
      img.style.width = savedW;
    }
    if (savedH) {
      wrapper.style.height = savedH;
      img.style.height = savedH;
    }
    // default sizing solo si no hay datos previos
    if (!img.style.width && !savedW) {
      img.style.width = "100%";
      wrapper.style.width = "100%";
    }
    img.style.height = img.style.height || "auto";

    ["mouseup", "mouseleave", "touchend"].forEach((evt) => {
      wrapper.addEventListener(evt, syncSizeToImg);
    });
    // initial sync
    syncSizeToImg();
    return wrapper;
  };

  const ensureResizableImages = (editor) => {
    if (!editor) return;
    editor.querySelectorAll("img").forEach((img) => makeResizable(img));
  };

  let draggingEditorImage = false;

  const enableImageDrag = (editor) => {
    if (!editor) return;
    let dragged = null;
    let dragGhost = null;
    let dragOriginParent = null;
    let dragOriginNext = null;
    const restoreIfOutsideEditor = (node) => {
      if (!node) return false;
      if (editor.contains(node)) return true;
      if (dragOriginParent) dragOriginParent.insertBefore(node, dragOriginNext);
      return false;
    };
    const getBlockContainerAtPoint = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el || !editor.contains(el)) return null;
      return el.closest("div, p, li, blockquote, h1, h2, h3, h4, h5, h6");
    };
    const moveNodeAtPoint = (ev, node) => {
      const range =
        (document.caretRangeFromPoint && document.caretRangeFromPoint(ev.clientX, ev.clientY)) ||
        (() => {
          const pos = document.caretPositionFromPoint?.(ev.clientX, ev.clientY);
          if (pos) {
            const r = document.createRange();
            r.setStart(pos.offsetNode, pos.offset);
            r.collapse(true);
            return r;
          }
          return null;
        })();
      // Avoid inserting into itself or its descendants (causes HierarchyRequestError)
      if (range && node.contains(range.startContainer)) return;
      if (range && range.startContainer === editor) {
        const block = getBlockContainerAtPoint(ev);
        if (block && block !== editor) {
          const blockRange = document.createRange();
          blockRange.selectNodeContents(block);
          blockRange.collapse(false);
          blockRange.insertNode(node);
          return;
        }
      }
      try {
        if (range) {
          editor.focus();
          range.insertNode(node);
          return;
        }
      } catch (err) {
        console.warn("moveNodeAtPoint fallback", err);
      }
      editor.appendChild(node);
    };

    editor.addEventListener("dragstart", (ev) => {
      const wrap = ev.target.closest(".img-resizable");
      if (!wrap) return;
      dragged = wrap;
      dragOriginParent = wrap.parentNode;
      dragOriginNext = wrap.nextSibling;
      draggingEditorImage = true;
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", "img-drag");
      // crear un ghost minimal para evitar que se mueva fuera de su contenedor
      if (!dragGhost) {
        dragGhost = document.createElement("div");
        dragGhost.style.width = "1px";
        dragGhost.style.height = "1px";
        dragGhost.style.opacity = "0";
        dragGhost.style.position = "fixed";
        dragGhost.style.top = "0";
        dragGhost.style.left = "0";
        document.body.appendChild(dragGhost);
      }
      ev.dataTransfer.setDragImage(dragGhost, 0, 0);
    });
    editor.addEventListener("dragover", (ev) => {
      if (!dragged) return;
      if (!editor.contains(ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const wrap = ev.target.closest(".img-resizable");
      if (wrap && wrap !== dragged) wrap.classList.add("drag-over");
    });
    editor.addEventListener("dragleave", (ev) => {
      const wrap = ev.target.closest(".img-resizable");
      if (wrap) wrap.classList.remove("drag-over");
    });
    editor.addEventListener("drop", (ev) => {
      if (!dragged) return;
      if (!editor.contains(ev.target)) {
        if (dragOriginParent) {
          dragOriginParent.insertBefore(dragged, dragOriginNext);
        }
        dragged = null;
        draggingEditorImage = false;
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const wrap = ev.target.closest(".img-resizable");
      if (wrap && wrap !== dragged && wrap.parentNode) {
        wrap.classList.remove("drag-over");
        dragged.parentNode?.removeChild(dragged);
        wrap.parentNode.insertBefore(dragged, wrap);
      } else {
        dragged.parentNode?.removeChild(dragged);
        moveNodeAtPoint(ev, dragged);
      }
      restoreIfOutsideEditor(dragged);
      dragged = null;
      draggingEditorImage = false;
      dragOriginParent = null;
      dragOriginNext = null;
      if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
      }
    });
    editor.addEventListener("dragend", () => {
      if (dragged) restoreIfOutsideEditor(dragged);
      dragged = null;
      draggingEditorImage = false;
      if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
      }
      editor.querySelectorAll(".img-resizable.drag-over").forEach((w) => w.classList.remove("drag-over"));
    });
  };

  // Evita que las imagenes del editor se suelten fuera del área de edición
  ["dragover", "drop"].forEach((evtName) => {
    document.addEventListener(evtName, (ev) => {
      if (!draggingEditorImage) return;
      const editorSurface = ev.target?.closest?.(".editor-surface");
      if (!editorSurface) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      // Dentro del editor permitimos, pero evitamos que se seleccione texto del toolbar
      if (ev.target.closest && ev.target.closest(".editor-toolbar")) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    });
  });

  const selectImage = (img, editor) => {
    selectedImage = img;
    if (!editor) return;
    editor.querySelectorAll("img").forEach((im) => im.classList.remove("img-selected"));
    editor.querySelectorAll(".img-resizable.img-selected").forEach((w) => w.classList.remove("img-selected"));
    if (img) {
      img.classList.add("img-selected");
      img.closest(".img-resizable")?.classList.add("img-selected");
    }
  };

  const getSelectedOrAnchoredImage = (editor) => {
    if (selectedImage && editor.contains(selectedImage)) return selectedImage;
    const sel = document.getSelection();
    const node = sel?.anchorNode ? sel.anchorNode.parentElement : null;
    const wrap = node?.closest?.(".img-resizable");
    if (wrap && editor.contains(wrap)) return wrap.querySelector("img");
    const img = node?.closest?.("img");
    if (img && editor.contains(img)) return img;
    const selected = editor.querySelector("img.img-selected");
    return selected || null;
  };

  const getAlignmentFromBlock = (node) => {
    if (!node) return null;
    const block = node.closest("div, p, li, blockquote, h1, h2, h3, h4, h5, h6");
    if (!block) return null;
    const style = (block.getAttribute("style") || "").toLowerCase();
    if (style.includes("text-align: right")) return "img-align-right";
    if (style.includes("text-align: center")) return "img-align-center";
    if (style.includes("text-align: left")) return "img-align-left";
    return null;
  };

  const withEditorSelection = (editor) => {
    if (!editor) return null;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      const endRange = document.createRange();
      endRange.selectNodeContents(editor);
      endRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(endRange);
      range = sel.getRangeAt(0);
    }
    return { sel, range };
  };

  const applyInlineStyle = (editor, styleName, styleValue) => {
    const ctx = withEditorSelection(editor);
    if (!ctx || !styleName || !styleValue) return;
    const { sel } = ctx;
    let { range } = ctx;
    if (range.collapsed) {
      const span = document.createElement("span");
      span.style[styleName] = styleValue;
      span.appendChild(document.createTextNode("\u200B"));
      range.insertNode(span);
      const textNode = span.firstChild;
      const newRange = document.createRange();
      newRange.setStart(textNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }
    const span = document.createElement("span");
    span.style[styleName] = styleValue;
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
  };

  const applyFontSize = (editor, sizePx) => {
    const size = Number.parseInt(sizePx, 10);
    if (!editor || !Number.isFinite(size) || size < 8 || size > 96) {
      alert("Tamano invalido. Usa un valor entre 8 y 96.");
      return;
    }
    applyInlineStyle(editor, "fontSize", `${size}px`);
  };

  const applyTextColor = (editor, value) => {
    if (!value) return;
    applyInlineStyle(editor, "color", value);
  };

  const applyTextHighlight = (editor, value) => {
    if (!value) return;
    applyInlineStyle(editor, "backgroundColor", value);
  };

  const insertHtmlAtSelection = (editor, html) => {
    const ctx = withEditorSelection(editor);
    if (!ctx || !html) return;
    const { sel } = ctx;
    let { range } = ctx;
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node;
    let lastNode = null;
    while ((node = temp.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    range.deleteContents();
    range.insertNode(frag);
    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    editor.focus();
  };

  const insertTableAtSelection = (editor) => {
    const rows = Number.parseInt(prompt("Numero de filas:", "3"), 10);
    const cols = Number.parseInt(prompt("Numero de columnas:", "3"), 10);
    if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1 || rows > 12 || cols > 8) {
      alert("Usa un rango valido: filas 1-12, columnas 1-8.");
      return;
    }
    const header = `<tr>${Array.from({ length: cols }, (_, i) => `<th>Columna ${i + 1}</th>`).join("")}</tr>`;
    const body = Array.from({ length: rows - 1 }, () => `<tr>${Array.from({ length: cols }, () => `<td>Dato</td>`).join("")}</tr>`).join("");
    insertHtmlAtSelection(editor, `<table><thead>${header}</thead><tbody>${body}</tbody></table><p><br></p>`);
  };

  const applyTextClass = (editor, className) => {
    if (!editor || !className) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const startNode = sel.anchorNode || range.startContainer;
    const startEl = startNode?.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
    const block = startEl?.closest?.("p, div, li, blockquote, h1, h2, h3, h4, h5, h6");
    if (block && editor.contains(block)) {
      block.classList.remove("text-title", "text-subtitle");
      block.classList.add(className);
      return;
    }
    if (range.collapsed) {
      const span = document.createElement("span");
      span.className = className;
      span.appendChild(document.createTextNode("\u200B"));
      range.insertNode(span);
      const textNode = span.firstChild;
      const newRange = document.createRange();
      newRange.setStart(textNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return;
    }
    const span = document.createElement("span");
    span.className = className;
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
  };

  const serializeEditorContent = (editor) => {
    if (!editor) return "";
    const clone = editor.cloneNode(true);
    // unwrap resizable wrappers, transfer styles/classes, remove delete buttons
    clone.querySelectorAll(".img-resizable").forEach((wrap) => {
      const img = wrap.querySelector("img");
      if (!img) {
        wrap.remove();
        return;
      }
      // transfer alignment/wrap classes
      ["img-wrap-square", "img-wrap-block", "img-align-left", "img-align-center", "img-align-right"].forEach((cls) => {
        if (wrap.classList.contains(cls)) img.classList.add(cls);
      });
      // transfer width from wrapper if defined
      const wrapWidth = wrap.style.width || wrap.style.maxWidth;
      if (wrapWidth) {
        img.style.width = wrapWidth;
        img.dataset.imgWidth = wrapWidth;
      }
      if (wrap.style.height) {
        img.style.height = wrap.style.height;
        img.dataset.imgHeight = wrap.style.height;
      }
      img.style.maxWidth = img.style.maxWidth || "100%";
      // clean transient attrs/classes
      img.removeAttribute("draggable");
      img.classList.remove("img-selected");
      const del = wrap.querySelector(".img-delete");
      if (del) del.remove();
      wrap.replaceWith(img);
    });
    // safety: remove any stray delete buttons
    clone.querySelectorAll(".img-delete").forEach((n) => n.remove());
    return clone.innerHTML;
  };
  const requireImage = (editor) => {
    const img = getSelectedOrAnchoredImage(editor);
    if (!img) {
      alert("Selecciona una imagen para esta acción.");
      return null;
    }
    return img;
  };
  let currentPage = null;
  let currentSection = "company";
  const adminSections = new Set([
    "company",
    "home",
    "nosotros",
    "servicios",
    "productos",
    "publicaciones",
    "academia",
    "pagos",
    "kdbweb",
    "subs",
    "contacto",
    "legales",
    "usuarios",
  ]);
  const getSectionFromPath = () => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("section");
    if (fromQuery && LEGAL_PAGE_SET.has(fromQuery)) {
      currentLegalPage = fromQuery;
      return "legales";
    }
    if (fromQuery && adminSections.has(fromQuery)) return fromQuery;
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (hash && LEGAL_PAGE_SET.has(hash)) {
      currentLegalPage = hash;
      return "legales";
    }
    if (hash && adminSections.has(hash)) return hash;
    return "company";
  };
  const buildAdminUrl = (section) => {
    const base = window.location.pathname;
    return section === "company" ? base : `${base}?section=${encodeURIComponent(section)}`;
  };
  const pushAdminState = (section, replace = false) => {
    const url = buildAdminUrl(section);
    const state = { section };
    if (replace) {
      history.replaceState(state, "", url);
    } else {
      history.pushState(state, "", url);
    }
  };
let subsCache = [];
let subsFiltered = [];
let subsPage = 1;
const subsPageSize = 10;
let contactCache = [];
let contactFiltered = [];
let contactPage = 1;
const contactPageSize = 10;
let pubsCache = [];
let pubsFiltered = [];
let pubsPage = 1;
const pubsPageSize = 10;
let categoriesCache = [];
let currentPubEditing = null;
let publicationsHeroData = null;
let publicationsHeroSlides = [];
let kdbwebEntries = [];
let kdbwebEditingSlug = null;
let kdbwebPageData = null;
  let kdbwebHeroSlides = [];
  let currentLegalPage = "cookies";
const kdbwebCollapsed = new Set();
let pageVisibility = {};
let adminUsers = [];
let currentAdminUserId = null;
  let adminInitialized = false;

  const HERO_PAGES = [
    { value: '', label: '— Sin enlace —' },
    { value: 'index.html', label: 'Inicio' },
    { value: 'nosotros.html', label: 'Nosotros' },
    { value: 'servicios.html', label: 'Servicios' },
    { value: 'publicaciones.html', label: 'Publicaciones' },
    { value: 'kdbweb.html', label: 'KDBWEB' },
    { value: 'contacto.html', label: 'Contacto' },
  ];

  function heroHrefField(fieldName, currentValue) {
    const cv = (currentValue || '').trim();
    const knownPage = HERO_PAGES.find(p => p.value !== '' && p.value === cv);
    const isCustom = cv !== '' && !knownPage;
    const options = HERO_PAGES.map(p =>
      `<option value="${p.value}"${(!isCustom && cv === p.value) ? ' selected' : ''}>${safe(p.label)}</option>`
    ).join('');
    return `
      <select class="hero-href-select" data-href-field="${fieldName}">
        ${options}
        <option value="__custom__"${isCustom ? ' selected' : ''}>Otro (URL personalizada)</option>
      </select>
      <input type="text" data-field="${fieldName}" value="${safe(cv)}"
             class="hero-href-custom" style="${isCustom ? '' : 'display:none;'}"
             placeholder="https://...">`;
  }

  const heroCard = (slide = {}, idx = 0) => {
    const val = (field) => safe(slide[field]);
    return `
      <div class="card hero-card" draggable="true">
        <div class="row between">
          <span class="small"></span>
          <button type="button" class="danger small-btn" data-action="remove-hero">Eliminar</button>
        </div>
        <label>Titulo</label><input type="text" data-field="title" value="${val("title")}" placeholder="${val("title")}">
        <label>Texto</label><textarea data-field="description" placeholder="${val("description")}">${val("description")}</textarea>
        <div class="grid-2">
          <div><label>Boton primario</label><input type="text" data-field="primary_label" value="${val("primary_label")}" placeholder="${val("primary_label")}"></div>
          <div><label>Enlace primario</label>${heroHrefField('primary_href', slide.primary_href)}</div>
          <div><label>Boton secundario</label><input type="text" data-field="secondary_label" value="${val("secondary_label")}" placeholder="${val("secondary_label")}"></div>
          <div><label>Enlace secundario</label>${heroHrefField('secondary_href', slide.secondary_href)}</div>
        </div>
        <label>Imagen</label>
        ${imgPickerField("image_url", slide.image_url)}
      </div>
    `;
  };

  const serviceCard = (svc = {}, idx = 0) => {
    const val = (field) => safe(svc[field]);
    const bullets = Array.isArray(svc.bullets) ? svc.bullets.join("\n") : "";
    const uid = safe(svc._uid || svc.id || `service-${idx}-${Date.now()}`);
    return `
      <div class="card service-card-admin" draggable="true" data-uid="${uid}">
        <div class="row between">
          <span class="small"></span>
          <button type="button" class="danger small-btn" data-action="remove-service">Eliminar</button>
        </div>
        <label>Titulo</label><input type="text" data-field="title" value="${val("title")}" placeholder="${val("title")}">
        <label>Descripcion</label>
        <div class="rich-editor service-description-editor">
          <div class="editor-toolbar" id="service-description-toolbar-${uid}">
            <button type="button" data-cmd="bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic"><em>I</em></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="insertUnorderedList">Lista</button>
            <button type="button" data-cmd="insertOrderedList">1. Lista</button>
            <button type="button" data-cmd="createLink">Enlace</button>
            <button type="button" data-cmd="unlink">Quitar enlace</button>
            <button type="button" data-cmd="removeFormat">Limpiar</button>
          </div>
          <div id="service-description-editor-${uid}" class="editor-surface" contenteditable="true" data-editor-field="description">${svc.description || ""}</div>
        </div>
        <label>Imagen del servicio</label>
        ${imgPickerField("image_url", svc.image_url)}
        <label>Icono del servicio</label>
        ${imgPickerField("icon_url", svc.icon_url)}
      </div>
    `;
  };

  const teamCard = (member = {}, idx = 0) => {
      const val = (field) => safe(member[field]);
      const uid = safe(member._uid || member.id || `member-${idx}-${Date.now()}`);
      return `
        <div class="card team-card-admin" draggable="true" data-uid="${uid}">
        <div class="row between">
          <div class="small">Miembro</div>
          <button type="button" class="danger small-btn" data-action="remove-team">Eliminar</button>
        </div>
        <label>Nombre</label><input type="text" data-field="name" value="${val("name")}" placeholder="${val("name")}">
        <label>Cargo</label><input type="text" data-field="role" value="${val("role")}" placeholder="${val("role")}">
        <label>Imagen</label>
          ${imgPickerField("image_url", member.image_url)}
          <label>LinkedIn</label><input type="text" data-field="linkedin" value="${val("linkedin")}" placeholder="${val("linkedin")}">
          <label>Descripcion completa</label>
          <div class="rich-editor team-description-editor">
            <div class="editor-toolbar" id="team-description-toolbar-${uid}">
              <button type="button" data-cmd="bold"><strong>B</strong></button>
              <button type="button" data-cmd="italic"><em>I</em></button>
              <button type="button" data-cmd="underline"><u>U</u></button>
              <button type="button" data-cmd="insertUnorderedList">Lista</button>
              <button type="button" data-cmd="insertOrderedList">1. Lista</button>
              <button type="button" data-cmd="createLink">Enlace</button>
              <button type="button" data-cmd="unlink">Quitar enlace</button>
              <button type="button" data-cmd="removeFormat">Limpiar</button>
            </div>
            <div id="team-description-editor-${uid}" class="editor-surface" contenteditable="true" data-editor-field="more_url">${member.more_url || ""}</div>
          </div>
        </div>
      `;
    };
  
    function serializeCards(selector) {
      return Array.from(document.querySelectorAll(selector)).map((card) => {
        const inputs = card.querySelectorAll("input, textarea");
        const obj = { _uid: card.dataset.uid };
        inputs.forEach((input) => {
          obj[input.dataset.field] = (input.value || "").trim();
        });
        card.querySelectorAll("[data-editor-field]").forEach((editor) => {
          obj[editor.dataset.editorField] = serializeEditorContent(editor).trim();
        });
        return obj;
      });
    }

  const initTeamDescriptionEditors = (scope = document) => {
    scope.querySelectorAll(".team-card-admin").forEach((card) => {
      const uid = card.dataset.uid;
      if (!uid) return;
      setupRichEditor(`team-description-toolbar-${uid}`, `team-description-editor-${uid}`);
    });
  };

  const initServiceDescriptionEditors = (scope = document) => {
    scope.querySelectorAll(".service-card-admin").forEach((card) => {
      const uid = card.dataset.uid;
      if (!uid) return;
      setupRichEditor(`service-description-toolbar-${uid}`, `service-description-editor-${uid}`);
    });
  };

  function serializeServices() {
    return Array.from(document.querySelectorAll("#services-cards .service-card-admin")).map((card) => {
      const title = (card.querySelector('[data-field="title"]')?.value || "").trim();
      const description = serializeEditorContent(card.querySelector('[data-editor-field="description"]')).trim();
      const image_url = (card.querySelector('[data-field="image_url"]')?.value || "").trim();
      const icon_url = (card.querySelector('[data-field="icon_url"]')?.value || "").trim();
      return { title, description, bullets: [], image_url, icon_url };
    });
  }

  async function loadCompany() {
    const res = await apiFetch("/config/company");
    const data = await res.json();
    setVal("c-name", data.name);
    setVal("c-tagline", data.tagline);
    setVal("c-phone", data.phone);
    setVal("c-email", data.email);
    setVal("c-address", data.address);
    setVal("c-linkedin", data.linkedin);
    setVal("c-facebook", data.facebook);
    setVal("c-instagram", data.instagram);
    setVal("c-logo-url", data.logo_url);
    setLogoPreview(data.logo_url);
    setVal("c-favicon-url", data.favicon_url);
    setFaviconPreview(data.favicon_url);
    const brochureDisplay = q("c-brochure-display");
    if (brochureDisplay) brochureDisplay.textContent = data.brochure_url ? "brochure.pdf" : "Sin archivo";
  }

  const setLogoPreview = (url) => {
    const img = q("c-logo-preview");
    if (!img) return;
    if (url) {
      img.src = url;
      img.style.opacity = "1";
    } else {
      img.removeAttribute("src");
      img.style.opacity = "0.4";
    }
    const label = q("c-logo-url-display");
    if (label) label.textContent = url ? url : "Sin seleccionar";
  };

  const setFaviconPreview = (url) => {
    const img = q("c-favicon-preview");
    if (!img) return;
    if (url) {
      img.src = url;
      img.style.opacity = "1";
    } else {
      img.removeAttribute("src");
      img.style.opacity = "0.4";
    }
    const label = q("c-favicon-display");
    if (label) label.textContent = url ? url : "Sin seleccionar";
  };
  const openLogoPicker = () => {
    const input = q("c-logo-url");
    if (!input) return;
    currentMediaPrefix = normalizePrefix(logoGalleryPrefix || "logos/");
    const prefixInput = q("media-prefix");
    if (prefixInput) prefixInput.value = currentMediaPrefix;
    openMediaModalForInput(input);
  };

  const openFaviconPicker = () => {
    const input = q("c-favicon-url");
    if (!input) return;
    currentMediaPrefix = normalizePrefix(faviconGalleryPrefix || "favicons/");
    const prefixInput = q("media-prefix");
    if (prefixInput) prefixInput.value = currentMediaPrefix;
    openMediaModalForInput(input);
  };

  async function saveCompany() {
    const payload = {
      name: getVal("c-name"),
      tagline: getVal("c-tagline"),
      phone: getVal("c-phone"),
      email: getVal("c-email"),
      address: getVal("c-address"),
      logo_url: getVal("c-logo-url"),
      favicon_url: getVal("c-favicon-url"),
      linkedin: getVal("c-linkedin"),
      facebook: getVal("c-facebook"),
      instagram: getVal("c-instagram"),
    };
    const status = q("status-company");
    status.textContent = "Guardando...";
    const res = await apiFetch("/config/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    status.textContent = res.ok ? "Datos guardados" : "Error al guardar";
  }

  const PAGE_LABELS = {
    home: "Inicio",
    nosotros: "Nosotros",
    servicios: "Servicios",
    publicaciones: "Publicaciones",
    kdbweb: "KDBWEB",
    contacto: "Contacto",
    productos: "Productos",
    cookies: "Politica de cookies",
    terminos: "Terminos y condiciones",
    privacidad: "Politica de privacidad",
  };
  const LEGAL_PAGE_KEYS = ["cookies", "terminos", "privacidad"];
  const LEGAL_PAGE_SET = new Set(LEGAL_PAGE_KEYS);

  function renderPageVisibility(pages) {
    const grid = q("page-visibility-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const keys = Object.keys(pages || {});
    keys.forEach((key) => {
      const label = PAGE_LABELS[key] || key;
      const checked = pages[key] !== false;
      grid.insertAdjacentHTML(
        "beforeend",
        `
          <div class="page-toggle-item">
            <label for="page-toggle-${safe(key)}">${safe(label)}</label>
            <input type="checkbox" id="page-toggle-${safe(key)}" data-page="${safe(key)}" ${checked ? "checked" : ""}>
          </div>
        `,
      );
    });
  }

  async function loadPageVisibility() {
    const status = q("status-page-visibility");
    if (status) status.textContent = "Cargando...";
    try {
      const res = await apiFetch("/config/pages");
      if (!res.ok) throw new Error("pages");
      const data = await res.json();
      pageVisibility = data.pages || {};
      renderPageVisibility(pageVisibility);
      if (status) status.textContent = "";
    } catch (err) {
      console.error("Error cargando visibilidad", err);
      if (status) status.textContent = "Error al cargar visibilidad";
    }
  }

  async function savePageVisibility() {
    const status = q("status-page-visibility");
    if (status) status.textContent = "Guardando...";
    const grid = q("page-visibility-grid");
    if (!grid) return;
    const pages = {};
    grid.querySelectorAll('input[data-page]').forEach((input) => {
      pages[input.dataset.page] = input.checked;
    });
    try {
      const res = await apiFetch("/config/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      if (!res.ok) throw new Error("save pages");
      if (status) status.textContent = "Visibilidad guardada";
    } catch (err) {
      console.error("Error guardando visibilidad", err);
      if (status) status.textContent = "Error al guardar visibilidad";
    }
  }

  const getAboutHTML = () => {
    const editor = q("about-content-editor");
    return editor ? editor.innerHTML : getVal("about-content");
  };

  const getAboutTitleHTML = () => {
    const editor = q("about-title-editor");
    return editor ? editor.innerHTML : getVal("about-title");
  };

  const getStoryTitleHTML = () => {
    const editor = q("story-title-editor");
    return editor ? editor.innerHTML : getVal("story-title");
  };

  const getStoryHTML = () => {
    const editor = q("story-content-editor");
    return editor ? editor.innerHTML : getVal("story-paragraphs");
  };

  function readAboutForm() {
    const title = getAboutTitleHTML();
    const content = getAboutHTML();
    setVal("about-title", title);
    setVal("about-content", content);
    const isNosotros = currentPage === "nosotros";
    return {
      title: isNosotros ? "" : title,
      content,
      image_url: isNosotros ? "" : getVal("about-image"),
      primary_label: isNosotros ? "" : getVal("about-primary-label"),
      primary_href: isNosotros ? "" : getVal("about-primary-href"),
      secondary_label: isNosotros ? "" : getVal("about-secondary-label"),
      secondary_href: isNosotros ? "" : getVal("about-secondary-href"),
    };
  }

  function readStoryForm() {
    const title = getStoryTitleHTML();
    const html = getStoryHTML();
    const editor = q("story-content-editor");
    const textSource = editor ? editor.textContent || "" : getVal("story-paragraphs") || "";
    const paragraphs = textSource
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setVal("story-title", title);
    setVal("story-paragraphs", paragraphs.join("\n"));
    return {
      title,
      html,
      paragraphs,
      image_url: getVal("story-image"),
    };
  }

  function setAboutForm(about = {}) {
    setVal("about-title", about.title || "");
    const titleEditor = q("about-title-editor");
    if (titleEditor) {
      titleEditor.innerHTML = about.title || "";
    }
    setVal("about-content", about.content || "");
    const editor = q("about-content-editor");
    if (editor) {
      editor.innerHTML = about.content || "";
      if (typeof linkEnsurers["about-content-editor"] === "function") {
        linkEnsurers["about-content-editor"](editor);
      }
    }
    setImgPicker("about-image", about.image_url || "");
    setVal("about-primary-label", about.primary_label || "");
    setVal("about-primary-href", about.primary_href || "");
    setVal("about-secondary-label", about.secondary_label || "");
    setVal("about-secondary-href", about.secondary_href || "");
  }

  function setStoryForm(story = {}) {
    setVal("story-title", story.title || "");
    setImgPicker("story-image", story.image_url || "");
    const titleEditor = q("story-title-editor");
    if (titleEditor) {
      titleEditor.innerHTML = story.title || "";
    }
    const editor = q("story-content-editor");
    const html = story.html || "";
    const paragraphs = story.paragraphs || [];
    setVal("story-paragraphs", paragraphs.join("\n"));
    if (editor) {
      if (html) {
        editor.innerHTML = html;
      } else if (paragraphs.length) {
        editor.innerHTML = paragraphs.map((p) => `<p>${safe(p)}</p>`).join("");
      } else {
        editor.innerHTML = "";
      }
      if (typeof linkEnsurers["story-content-editor"] === "function") {
        linkEnsurers["story-content-editor"](editor);
      }
    }
  }

  function setServicesForm(services = [], meta = {}) {
    setVal("services-title", meta.title || "");
    setVal("services-subtitle", meta.subtitle || "");
    const cont = q("services-cards");
    if (!cont) return;
    cont.innerHTML = "";
    const list = services.length ? services : [{}];
    list.forEach((svc, idx) => {
      cont.insertAdjacentHTML("beforeend", serviceCard(svc, idx));
    });
    initServiceDescriptionEditors(cont);
  }

  function setLegalForm(story = {}) {
    setVal("legal-title", story.title || "");
    const editor = q("legal-content-editor");
    const html = story.html || "";
    const paragraphs = story.paragraphs || [];
    if (editor) {
      if (html) {
        editor.innerHTML = html;
      } else if (paragraphs.length) {
        editor.innerHTML = paragraphs.map((p) => `<p>${safe(p)}</p>`).join("");
      } else {
        editor.innerHTML = "";
      }
      if (typeof linkEnsurers["legal-content-editor"] === "function") {
        linkEnsurers["legal-content-editor"](editor);
      }
      ensureResizableImages(editor);
    }
  }

  function readLegalForm() {
    const editor = q("legal-content-editor");
    const html = editor ? serializeEditorContent(editor) : getVal("legal-content");
    const textSource = editor ? editor.textContent || "" : getVal("legal-content") || "";
    const paragraphs = textSource
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: getVal("legal-title"),
      html,
      paragraphs,
    };
  }

  async function loadLegalPage(pageKey) {
    const page = LEGAL_PAGE_SET.has(pageKey) ? pageKey : currentLegalPage;
    currentLegalPage = page;
    const select = q("legal-page-select");
    if (select) select.value = page;
    const status = q("status-legales");
    if (status) status.textContent = "Cargando...";
    try {
      const res = await apiFetch("/config/page/" + page);
      if (!res.ok) {
        if (status) status.textContent = "Error al cargar";
        return;
      }
      const data = await res.json();
      setLegalForm(data.story || {});
      if (status) status.textContent = "";
    } catch (err) {
      console.error("Error cargando legales", err);
      if (status) status.textContent = "Error al cargar";
    }
  }

  async function saveLegalPage() {
    const status = q("status-legales");
    if (status) status.textContent = "Guardando...";
    const story = readLegalForm();
    const payload = {
      hero: [],
      story,
      team: [],
      about: {},
      team_meta: {},
      services: [],
      services_meta: {},
    };
    try {
      const res = await apiFetch("/config/page/" + currentLegalPage, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save");
      if (status) status.textContent = "Contenido guardado";
    } catch (err) {
      console.error("Error guardando legales", err);
      if (status) status.textContent = "Error al guardar";
    }
  }

  async function loadPage(page) {
    currentPage = page;
    setText("page-title", "Contenido: " + page.charAt(0).toUpperCase() + page.slice(1));
    document.querySelectorAll(".sidebar button").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === page));

    let data = {};
    try {
      const res = await apiFetch("/config/page/" + page);
      if (!res.ok) {
        const text = await res.text();
        console.error("Fetch page failed", page, res.status, text);
        setText("status-page", "Error cargando datos (" + res.status + ")");
        return;
      }
      data = await res.json();
    } catch (err) {
      console.error("Error cargando página", page, err);
      setText("status-page", "Error al cargar");
      return;
    }

    const heroCont = q("hero-slides");
    heroCont.innerHTML = "";
    (data.hero?.length ? data.hero : [{}]).forEach((h, idx) => heroCont.insertAdjacentHTML("beforeend", heroCard(h, idx)));

    setStoryForm(data.story || {});
    setAboutForm(data.about || {});
    setServicesForm(data.services || [], data.services_meta || {});

    setVal("team-title", data.team_meta?.title || "");
    setVal("team-subtitle", data.team_meta?.subtitle || "");

    const teamCont = q("team-cards");
    teamCont.innerHTML = "";
    const teamWrapper = q("team-wrapper");
    const storySection = q("story-section");
    const storyImageRow = q("story-image-row");
    const aboutSectionEl = q("about-section");
    const aboutTitleWrap = q("about-title-wrap");
    const aboutImageWrap = q("about-image-wrap");
    const aboutActionsWrap = q("about-actions-wrap");
    const servicesSection = q("services-section");
    const heroSection = q("page-hero-body")?.closest(".section-card");
    const isHome = page === "home";
    const isNosotros = page === "nosotros";
    const isServicios = page === "servicios";
    const isLegal = LEGAL_PAGE_SET.has(page);
    if (aboutSectionEl) {
      aboutSectionEl.classList.toggle("hidden", !(isHome || isNosotros));
      const aboutTitle = aboutSectionEl.querySelector("h3");
      if (aboutTitle) aboutTitle.textContent = isNosotros ? "Mensaje previo al equipo" : "Seccion sobre la empresa";
    }
    if (aboutTitleWrap) aboutTitleWrap.classList.toggle("hidden", isNosotros);
    if (aboutImageWrap) aboutImageWrap.classList.toggle("hidden", isNosotros);
    if (aboutActionsWrap) aboutActionsWrap.classList.toggle("hidden", isNosotros);
    if (storySection) {
      storySection.classList.toggle("hidden", !(isNosotros || isLegal));
      const storyTitle = storySection.querySelector("h3");
      if (storyTitle) storyTitle.textContent = isLegal ? "Contenido" : "Historia";
    }
    if (storyImageRow) storyImageRow.classList.toggle("hidden", isLegal);
    if (servicesSection) servicesSection.classList.toggle("hidden", !isServicios);
    if (heroSection) heroSection.classList.toggle("hidden", isLegal);
    if (teamWrapper) {
      const hideTeam = isHome || isServicios || isLegal;
      teamWrapper.classList.toggle("hidden", hideTeam);
      teamWrapper.style.display = hideTeam ? "none" : "";
    }
    const addTeamBtn = q("add-team");
    if (addTeamBtn) addTeamBtn.style.display = isHome || isServicios || isLegal ? "none" : "";

      if (!isHome && !isServicios && !isLegal) {
        const team = data.team || [];
        (team.length ? team : [{}]).forEach((m, idx) => {
          if (!m._uid) m._uid = m.id || `member-${idx}-${Date.now()}`;
          teamCont.insertAdjacentHTML("beforeend", teamCard(m, idx));
        });
        initTeamDescriptionEditors(teamCont);
      }
  }

  async function savePage() {
    const isLegal = LEGAL_PAGE_SET.has(currentPage);
    const hero = isLegal ? [] : serializeCards("#hero-slides .hero-card");
    const team = currentPage === "home" || isLegal ? [] : serializeCards(".team-card-admin");
    const story = readStoryForm();
    const about = (currentPage === "home" || currentPage === "nosotros") && !isLegal ? readAboutForm() : {};
    const services = currentPage === "servicios" ? serializeServices() : [];
    const services_meta =
      currentPage === "servicios"
        ? { title: getVal("services-title"), subtitle: getVal("services-subtitle") }
        : {};
    const team_meta = isLegal
      ? {}
      : {
          title: getVal("team-title"),
          subtitle: getVal("team-subtitle"),
        };
    const status = q("status-page");
    status.textContent = "Guardando...";
    const res = await apiFetch("/config/page/" + currentPage, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hero, story, team, about, team_meta, services, services_meta }),
    });
    status.textContent = res.ok ? "Pagina guardada" : "Error al guardar";
  }

  async function loadSubscriptions() {
    const status = q("status-subs");
    status.textContent = "Cargando...";
    try {
      const res = await apiFetch("/subscriptions");
      if (!res.ok) {
        status.textContent = "Error al cargar suscriptores";
        return;
      }
      subsCache = (await res.json()) || [];
      subsPage = 1;
      applySubsFilters(true);
      status.textContent = subsCache.length ? `${subsCache.length} suscriptores` : "Sin suscriptores";
    } catch (err) {
      console.error("Error cargando suscriptores", err);
      status.textContent = "Error al cargar suscriptores";
    }
  }

  // --- Publicaciones ---
  function parseDate(val) {
    if (!val) return null;
    try {
      // force UTC midnight to avoid TZ shifts
      const d = new Date(`${val}T00:00:00Z`);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  function renderPublicationsTable() {
    const tbody = q("pub-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const totalPages = Math.max(1, Math.ceil(pubsFiltered.length / pubsPageSize));
    pubsPage = Math.min(totalPages, Math.max(1, pubsPage));
    const start = (pubsPage - 1) * pubsPageSize;
    const slice = pubsFiltered.slice(start, start + pubsPageSize);
    slice.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(p.title)}</td>
        <td>${safe(p.category || "")}</td>
        <td>${safe(p.published_at || "")}</td>
        <td>${p.active ? "Activa" : "Inactiva"}</td>
        <td>
          <button class="secondary small-btn" data-action="pub-edit" data-id="${p.id}">Editar</button>
          <button class="danger small-btn" data-action="pub-delete" data-id="${p.id}">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    const status = q("status-publications");
    if (status) status.textContent = pubsFiltered.length ? `${pubsFiltered.length} publicaciones` : "Sin publicaciones";
    const pageInfo = q("pub-page-info");
    if (pageInfo) pageInfo.textContent = pubsFiltered.length ? `Página ${pubsPage} de ${totalPages}` : "";
  }

  function applyPubFilters() {
    const term = (q("pub-filter-title")?.value || "").toLowerCase().trim();
    const cat = q("pub-filter-category")?.value || "";
    const activeVal = q("pub-filter-active")?.value || "";
    const start = parseDate(q("pub-filter-start")?.value || "");
    const end = parseDate(q("pub-filter-end")?.value || "");
    if (end) {
      // include end date entire day by adding 1 day for comparison
      end.setDate(end.getDate() + 1);
    }
    pubsFiltered = pubsCache.filter((p) => {
      const matchTitle = !term || (p.title || "").toLowerCase().includes(term);
      const matchCat = !cat || String(p.category_id || "") === String(cat);
      const matchActive = activeVal === "" || String(p.active) === activeVal;
      const pubDate = parseDate(p.published_at);
      const matchStart = !start || (pubDate && pubDate >= start);
      const matchEnd = !end || (pubDate && pubDate < end);
      return matchTitle && matchCat && matchActive && matchStart && matchEnd;
    });
    // sort by published_at desc
    pubsFiltered.sort((a, b) => {
      const da = parseDate(a.published_at);
      const db = parseDate(b.published_at);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });
    pubsPage = 1;
    renderPublicationsTable();
  }

  // --- KDBWEB ---
  function buildKdbwebTree(entries) {
    const nodes = new Map();
    (entries || []).forEach((entry) => {
      if (!entry || !entry.slug) return;
      nodes.set(entry.slug, { ...entry, children: [] });
    });
    const roots = [];
    (entries || []).forEach((entry) => {
      if (!entry || !entry.slug) return;
      const node = nodes.get(entry.slug);
      const parentSlug = entry.parent_slug;
      if (parentSlug && nodes.has(parentSlug)) {
        nodes.get(parentSlug).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  function renderKdbwebNode(node, depth) {
    const slug = safe(node.slug || "");
    const title = safe(node.title || node.card_title || "");
    const parentSlug = safe(node.parent_slug || "");
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const collapsed = kdbwebCollapsed.has(node.slug);
    const toggleLabel = hasChildren ? (collapsed ? "+" : "-") : "";
    const toggleDisabled = hasChildren ? "" : "disabled";
    const childrenHtml = (node.children || []).map((child) => renderKdbwebNode(child, depth + 1)).join("");
    const depthClass = `depth-${Math.min(depth, 3)}`;
    const rowClass = `kdbweb-row ${depthClass}`.trim();
    return `
      <div class="kdbweb-item${collapsed ? " is-collapsed" : ""}" data-slug="${slug}">
        <div class="${rowClass}" data-slug="${slug}" data-parent="${parentSlug}" style="--depth:${depth}" draggable="true">
          <button type="button" class="tree-toggle${hasChildren ? "" : " is-empty"}" data-action="kdbweb-toggle" data-slug="${slug}" ${toggleDisabled}>${toggleLabel}</button>
          <div class="kdbweb-labels">
            <span class="kdbweb-title">${title}</span>
          </div>
          <div class="kdbweb-actions">
            <button class="secondary small-btn" data-action="kdbweb-edit" data-slug="${slug}">Editar</button>
          </div>
        </div>
        <div class="kdbweb-children${collapsed ? " is-collapsed" : ""}" data-kdbweb-children="true" data-parent="${slug}">
          ${childrenHtml}
        </div>
      </div>
    `;
  }

  function renderKdbwebTree() {
    const tree = q("kdbweb-tree");
    if (!tree) return;
    const known = new Set((kdbwebEntries || []).map((entry) => entry.slug));
    Array.from(kdbwebCollapsed).forEach((slug) => {
      if (!known.has(slug)) kdbwebCollapsed.delete(slug);
    });
    const roots = buildKdbwebTree(kdbwebEntries);
    tree.innerHTML = roots.map((node) => renderKdbwebNode(node, 0)).join("");
  }

  function syncKdbwebEntriesFromDom() {
    const tree = q("kdbweb-tree");
    if (!tree) return;
    const entriesBySlug = new Map();
    kdbwebEntries.forEach((entry) => {
      if (entry && entry.slug) entriesBySlug.set(entry.slug, entry);
    });
    const newEntries = [];
    const walk = (container, parentSlug) => {
      const items = Array.from(container.children).filter((el) => el.classList.contains("kdbweb-item"));
      items.forEach((item) => {
        const slug = item.dataset.slug || "";
        const entry = entriesBySlug.get(slug);
        if (!entry) return;
        entry.parent_slug = parentSlug || null;
        newEntries.push(entry);
        const childContainer = item.querySelector(":scope > .kdbweb-children");
        if (childContainer) walk(childContainer, slug);
      });
    };
    walk(tree, null);
    newEntries.forEach((entry, idx) => {
      entry.position = idx;
    });
    kdbwebEntries = newEntries;
  }

  function openKdbwebForm(entry) {
    const panel = q("kdbweb-edit-panel");
    if (!panel) return;
    panel.classList.remove("hidden");
    const body = q("kdbweb-edit-body");
    const collapseBtn = panel.querySelector(".collapse-btn");
    if (body) body.classList.remove("collapsed");
    if (collapseBtn) collapseBtn.textContent = "-";
    setText("kdbweb-edit-title", `Editar subpagina: ${entry.title || ""}`);
    setVal("kdbweb-form-title", entry.title || "");
    setVal("kdbweb-form-slug", entry.slug || "");
    setVal("kdbweb-form-summary", entry.summary || "");
    setImgPicker("kdbweb-form-hero-image", entry.hero_image_url || "");
    kdbwebEditingSlug = entry.slug || null;
    // Notify katweb-admin.js so it can show slug-specific meta editors
    document.dispatchEvent(new CustomEvent("katweb:open-form", { detail: entry }));
  }

  function closeKdbwebForm() {
    const panel = q("kdbweb-edit-panel");
    if (panel) panel.classList.add("hidden");
    kdbwebEditingSlug = null;
    setText("status-kdbweb-edit", "");
  }

  function saveKdbwebEdit(silent = false) {
    if (!kdbwebEditingSlug) return;
    const entry = kdbwebEntries.find((e) => e.slug === kdbwebEditingSlug);
    if (!entry) return;
    entry.title = getVal("kdbweb-form-title");
    entry.card_title = entry.title;
    entry.summary = getVal("kdbweb-form-summary");
    entry.hero_image_url = getVal("kdbweb-form-hero-image");
    // Keep hero fields in sync with publication-like behavior (no extra UI fields)
    entry.hero_title = entry.title;
    entry.hero_subtitle = entry.summary;
    entry.hero_kicker = "KDBWEB";
    entry.content_html = "";
    // Let katweb-admin.js populate entry.meta_json from active structured editor
    document.dispatchEvent(new CustomEvent("katweb:collect-meta", { detail: entry }));
    renderKdbwebTree();
    if (!silent) setText("status-kdbweb-edit", "Cambios listos para guardar.");
  }

  async function loadKdbwebEntries() {
    const status = q("status-kdbweb-list");
    if (status) status.textContent = "Cargando subpaginas...";
    try {
      const res = await apiFetch("/api/kdbweb");
      if (!res.ok) throw new Error("kdbweb list");
      const list = await res.json();
      const details = await Promise.all(
        (list || []).map(async (entry) => {
          try {
            const detailRes = await apiFetch(`/api/kdbweb/${encodeURIComponent(entry.slug)}`);
            if (!detailRes.ok) throw new Error("detail");
            return await detailRes.json();
          } catch (err) {
            console.warn(`[KDBWEB] No se pudo cargar el detalle de "${entry.slug}". Guarda con precaución.`, err);
            return { ...entry, content_html: "", _detailFailed: true };
          }
        }),
      );
      kdbwebEntries = details || [];
      if (kdbwebCollapsed.size === 0) {
        const parents = new Set();
        kdbwebEntries.forEach((entry) => {
          if (entry.parent_slug) parents.add(entry.parent_slug);
        });
        parents.forEach((slug) => kdbwebCollapsed.add(slug));
      }
      renderKdbwebTree();
      if (status) status.textContent = kdbwebEntries.length ? `${kdbwebEntries.length} subpaginas` : "Sin subpaginas";
    } catch (err) {
      console.error("Error cargando KDBWEB", err);
      if (status) status.textContent = "Error al cargar KDBWEB";
    }
  }

  async function saveKdbwebEntries() {
    if (kdbwebEditingSlug) saveKdbwebEdit(true);
    const status = q("status-kdbweb");
    if (status) status.textContent = "Guardando...";
    try {
      // Re-fetch detail for any entries that failed to load, to avoid wiping their meta_json
      const entriesToSave = await Promise.all(kdbwebEntries.map(async (e) => {
        if (!e._detailFailed) return e;
        try {
          const r = await apiFetch(`/api/kdbweb/${encodeURIComponent(e.slug)}`);
          if (r.ok) {
            const fresh = await r.json();
            // Merge: keep any local title/summary changes but restore meta_json from DB
            return { ...e, meta_json: fresh.meta_json, _detailFailed: false };
          }
        } catch (_) {}
        return e; // still failed — meta_json may be absent; console warns above
      }));
      const res = await apiFetch("/api/kdbweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: entriesToSave }),
      });
      if (!res.ok) throw new Error("save");
      if (status) status.textContent = "KDBWEB guardado";
    } catch (err) {
      console.error("Error guardando KDBWEB", err);
      if (status) status.textContent = "Error al guardar KDBWEB";
    }
  }

  async function loadKdbwebHero() {
    const status = q("status-kdbweb-hero");
    if (status) status.textContent = "Cargando banner...";
    try {
      const res = await apiFetch("/config/page/kdbweb");
      if (!res.ok) throw new Error("hero");
      kdbwebPageData = await res.json();
      kdbwebHeroSlides = (kdbwebPageData && kdbwebPageData.hero) || [];
      renderKdbwebHeroForm();
      if (status) status.textContent = "";
    } catch (err) {
      console.error("Error cargando banner KDBWEB", err);
      if (status) status.textContent = "Error al cargar banner";
    }
  }

  function renderKdbwebHeroForm() {
    const cont = q("kdbweb-hero-slides");
    if (!cont) return;
    cont.innerHTML = "";
    (kdbwebHeroSlides.length ? kdbwebHeroSlides : [{}]).forEach((h, idx) => cont.insertAdjacentHTML("beforeend", heroCard(h, idx)));
  }

  async function saveKdbwebHero() {
    const status = q("status-kdbweb-hero");
    if (status) status.textContent = "Guardando banner...";
    const hero = serializeCards("#kdbweb-hero-slides .hero-card");
    const payload = {
      hero,
      story: kdbwebPageData?.story || {},
      team: kdbwebPageData?.team || [],
      about: kdbwebPageData?.about || {},
      team_meta: kdbwebPageData?.team_meta || {},
      services: kdbwebPageData?.services || [],
      services_meta: kdbwebPageData?.services_meta || {},
    };
    try {
      const res = await apiFetch("/config/page/kdbweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save hero");
      if (status) status.textContent = "Banner guardado";
    } catch (err) {
      console.error("Error guardando banner KDBWEB", err);
      if (status) status.textContent = "Error al guardar banner";
    }
  }

  async function loadKdbwebAdmin() {
    await loadKdbwebHero();
    await loadKdbwebEntries();
  }

  // ── Academia ──────────────────────────────────────────────────────────────

  let acEditId = null;
  let acCourses = [];
  let acEventsBound = false;

  function acSlugify(str) {
    return str.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function acModuleHtml(mod, mi) {
    const lessons = (mod.lessons || []).map((l, li) => `
      <div class="ac-lesson-row" data-li="${li}">
        <input type="text" class="ac-lesson-title" placeholder="Lección ${li+1}" value="${escHtml(l.title||'')}">
        <input type="text" class="ac-lesson-dur" placeholder="12:30" style="width:80px" value="${escHtml(l.duration||'')}">
        <select class="ac-lesson-type form-select" style="width:90px">
          <option value="video"${l.type==='video'?' selected':''}>Video</option>
          <option value="pdf"${l.type==='pdf'?' selected':''}>PDF</option>
          <option value="quiz"${l.type==='quiz'?' selected':''}>Quiz</option>
        </select>
        <button type="button" class="secondary small-btn danger ac-del-lesson">✕</button>
      </div>`).join('');

    return `
      <div class="ac-module-block" data-mi="${mi}" style="border:1px solid #e4e9f4;margin-bottom:.75rem;padding:1rem;">
        <div class="row" style="gap:.5rem;margin-bottom:.5rem;align-items:center;">
          <strong style="min-width:24px;color:var(--brand-blue,#06186d);">${mi+1}</strong>
          <input type="text" class="ac-mod-title" placeholder="Título del módulo" value="${escHtml(mod.title||'')}" style="flex:1">
          <input type="text" class="ac-mod-dur" placeholder="38 min" style="width:80px" value="${escHtml(mod.duration||'')}">
          <button type="button" class="secondary small-btn danger ac-del-module">Quitar</button>
        </div>
        <div class="ac-lessons-list">${lessons}</div>
        <button type="button" class="secondary small-btn ac-add-lesson" style="margin-top:.5rem;">+ Lección</button>
      </div>`;
  }

  function acGetModules() {
    return [...q('ac-modules-list').querySelectorAll('.ac-module-block')].map(block => ({
      title: block.querySelector('.ac-mod-title')?.value?.trim() || '',
      duration: block.querySelector('.ac-mod-dur')?.value?.trim() || '',
      lessons_count: block.querySelectorAll('.ac-lesson-row').length,
      lessons: [...block.querySelectorAll('.ac-lesson-row')].map(row => ({
        title: row.querySelector('.ac-lesson-title')?.value?.trim() || '',
        duration: row.querySelector('.ac-lesson-dur')?.value?.trim() || '',
        type: row.querySelector('.ac-lesson-type')?.value || 'video',
      })),
    }));
  }

  function acRenderModules(modules) {
    const list = q('ac-modules-list');
    list.innerHTML = (modules || []).map((m, i) => acModuleHtml(m, i)).join('');
  }

  function acRenumberModules() {
    q('ac-modules-list').querySelectorAll('.ac-module-block strong').forEach((el, i) => {
      el.textContent = String(i + 1);
    });
  }

  // ── Dynamic text-item list editors for courses ──────────────────────────────
  function acDynListHtml(containerId, items) {
    const container = q(containerId);
    if (!container) return;
    if (!items || !items.length) {
      container.innerHTML = '<p class="small muted ac-dynlist-empty">Sin ítems. Haz clic en "+ Agregar".</p>';
      return;
    }
    container.innerHTML = items.map((text, i) => `
      <div class="ac-dynlist-row" data-di="${i}" style="display:flex;gap:.5rem;margin-bottom:.4rem;align-items:center;">
        <input type="text" class="ac-dynlist-item" style="flex:1;" value="${escHtml(String(text||''))}">
        <button type="button" class="secondary small-btn danger ac-dynlist-del">✕</button>
      </div>`).join('');
    container.querySelectorAll('.ac-dynlist-del').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.ac-dynlist-row').remove());
    });
  }

  function acDynListAdd(containerId) {
    const container = q(containerId);
    if (!container) return;
    const empty = container.querySelector('.ac-dynlist-empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = 'ac-dynlist-row';
    row.style.cssText = 'display:flex;gap:.5rem;margin-bottom:.4rem;align-items:center;';
    row.innerHTML = `<input type="text" class="ac-dynlist-item" style="flex:1;" placeholder="Nuevo ítem…">
      <button type="button" class="secondary small-btn danger ac-dynlist-del">✕</button>`;
    row.querySelector('.ac-dynlist-del').addEventListener('click', () => row.remove());
    container.appendChild(row);
    row.querySelector('input').focus();
  }

  function acDynListGet(containerId) {
    const container = q(containerId);
    if (!container) return [];
    return [...container.querySelectorAll('.ac-dynlist-item')]
      .map(inp => inp.value.trim())
      .filter(Boolean);
  }

  function acOpenForm(course) {
    acEditId = course?.id || null;
    q('ac-id').value = acEditId || '';
    q('ac-form-title').textContent = acEditId ? 'Editar curso' : 'Nuevo curso';
    q('ac-title').value = course?.title || '';
    q('ac-slug').value = course?.slug || '';
    q('ac-subtitle').value = course?.subtitle || '';
    q('ac-description').value = course?.description || '';
    q('ac-category').value = course?.category || 'tributario';
    q('ac-price').value = course?.price || '';
    q('ac-original-price').value = course?.original_price || '';
    q('ac-duration').value = course?.duration || '';
    q('ac-level').value = course?.level || 'Todos los niveles';
    q('ac-moodle-course-id').value = course?.moodle_course_id || '';
    q('ac-published').value = course?.is_published ? '1' : '0';
    // image picker
    setImgPicker('ac-image-url', course?.image_url || '');
    // modules
    acRenderModules(course?.modules || []);
    // dynamic lists
    acDynListHtml('ac-learn-list',    course?.what_you_learn || []);
    acDynListHtml('ac-includes-list', course?.includes_list  || []);
    acDynListHtml('ac-audience-list', course?.audience       || []);
    q('ac-form-card').classList.remove('hidden');
    q('ac-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    q('ac-save-status').textContent = '';
  }

  function acCloseForm() {
    acEditId = null;
    q('ac-form-card').classList.add('hidden');
  }

  async function acSaveCourse() {
    const status = q('ac-save-status');
    const title = q('ac-title').value.trim();
    const slug = q('ac-slug').value.trim();
    if (!title || !slug) {
      status.textContent = 'Título y slug son requeridos.';
      return;
    }
    const modules = acGetModules();
    const payload = {
      title,
      slug,
      subtitle: q('ac-subtitle').value.trim(),
      description: q('ac-description').value.trim(),
      category: q('ac-category').value,
      price: parseFloat(q('ac-price').value) || 0,
      original_price: parseFloat(q('ac-original-price').value) || null,
      image_url: q('ac-image-url').value.trim() || null,
      duration: q('ac-duration').value.trim(),
      level: q('ac-level').value,
      moodle_course_id: parseInt(q('ac-moodle-course-id').value) || null,
      is_published: q('ac-published').value === '1',
      modules_count: modules.length,
      lessons_count: modules.reduce((s, m) => s + m.lessons.length, 0),
      modules,
      what_you_learn: acDynListGet('ac-learn-list'),
      includes_list:  acDynListGet('ac-includes-list'),
      audience:       acDynListGet('ac-audience-list'),
    };
    status.textContent = 'Guardando…';
    try {
      const method = acEditId ? 'PUT' : 'POST';
      const path = acEditId ? `/api/admin/courses/${acEditId}` : '/api/admin/courses';
      const res = await apiFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        status.textContent = `Error: ${data.error || res.status}`;
        return;
      }
      status.textContent = '✓ Guardado';
      setTimeout(() => { acCloseForm(); loadAcademiaAdmin(); }, 800);
    } catch (err) {
      status.textContent = `Error: ${err.message || 'No se pudo guardar'}`;
    }
  }

  async function acDeleteCourse(id, title) {
    if (!confirm(`¿Eliminar el curso "${title}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await apiFetch(`/api/admin/courses/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Error al eliminar: ${data.error || res.status}`);
        return;
      }
      loadAcademiaAdmin();
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  }

  async function loadAcademiaAdmin() {
    // Load courses
    const tbody = q('ac-table-body');
    const countEl = q('ac-count');
    tbody.innerHTML = '<tr><td colspan="5" class="muted small">Cargando…</td></tr>';
    try {
      const cRes = await apiFetch('/api/admin/courses');
      acCourses = await cRes.json().catch(() => []);
      const courses = Array.isArray(acCourses) ? acCourses : [];
      countEl.textContent = courses.length;
      if (!courses.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted small">Sin cursos. Haz clic en "+ Nuevo curso" para crear el primero.</td></tr>';
      } else {
        tbody.innerHTML = courses.map(c => `
          <tr>
            <td><strong>${escHtml(c.title)}</strong><br><small class="muted">${escHtml(c.slug)}</small>${c.moodle_course_id ? `<br><small class="muted">Moodle ID: ${c.moodle_course_id}</small>` : ''}</td>
            <td>${escHtml(c.category || '—')}</td>
            <td>S/ ${Number(c.price).toFixed(0)}${c.original_price ? ` <small class="muted" style="text-decoration:line-through">S/ ${Number(c.original_price).toFixed(0)}</small>` : ''}</td>
            <td><span class="${c.is_published ? 'badge-active' : 'badge-inactive'}">${c.is_published ? 'Publicado' : 'Borrador'}</span></td>
            <td class="row" style="gap:.35rem;flex-wrap:wrap;">
              <a class="secondary small-btn" href="/curso.html?slug=${encodeURIComponent(c.slug)}" target="_blank">Ver</a>
              <button type="button" class="secondary small-btn ac-edit-btn" data-id="${c.id}">Editar</button>
              ${c.moodle_course_id ? `<button type="button" class="secondary small-btn ac-moodle-hide-btn" data-id="${c.id}" data-title="${escHtml(c.title)}">Ocultar Moodle</button>
              <button type="button" class="cta small-btn ac-moodle-show-btn" data-id="${c.id}" data-title="${escHtml(c.title)}">Activar Moodle</button>` : ''}
              <button type="button" class="secondary small-btn danger ac-del-btn" data-id="${c.id}" data-title="${escHtml(c.title)}">Eliminar</button>
            </td>
          </tr>`).join('');
        // bind edit/delete/moodle visibility
        tbody.querySelectorAll('.ac-edit-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              const r = await apiFetch(`/api/admin/courses/${btn.dataset.id}`);
              const course = await r.json();
              acOpenForm(course);
            } catch {
              alert('No se pudo cargar el curso.');
            }
          });
        });
        tbody.querySelectorAll('.ac-del-btn').forEach(btn => {
          btn.addEventListener('click', () => acDeleteCourse(btn.dataset.id, btn.dataset.title));
        });
        const toggleMoodleVisibility = async (id, visible) => {
          const r = await apiFetch(`/api/admin/courses/${id}/moodle_visibility`, {
            method: 'POST', body: JSON.stringify({ visible })
          });
          const data = await r.json();
          alert(data.message || data.error);
        };
        tbody.querySelectorAll('.ac-moodle-hide-btn').forEach(btn => {
          btn.addEventListener('click', () => toggleMoodleVisibility(btn.dataset.id, false));
        });
        tbody.querySelectorAll('.ac-moodle-show-btn').forEach(btn => {
          btn.addEventListener('click', () => toggleMoodleVisibility(btn.dataset.id, true));
        });
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted small">Error: ${escHtml(err.message)}</td></tr>`;
    }

    // Load orders
    const ordTbody = q('ac-orders-body');
    const ordCount = q('ac-orders-count');
    try {
      const oRes = await apiFetch('/api/admin/orders');
      const orders = await oRes.json().catch(() => []);
      _ordersCache = Array.isArray(orders) ? orders : [];
      ordCount.textContent = _ordersCache.length;
      if (!_ordersCache.length) {
        ordTbody.innerHTML = '<tr><td colspan="7" class="muted small">Sin órdenes aún.</td></tr>';
      } else {
        ordTbody.innerHTML = _ordersCache.map(o => {
          const d = new Date(o.created_at + 'Z').toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'2-digit' });
          const ordRef = `ORD-${String(o.id).padStart(4,'0')}`;
          const compNumBadge = o.comprobante_number
            ? `<span class="badge-active small">${escHtml(o.comprobante_number)}</span>`
            : `<span class="badge-inactive small">Pendiente</span>`;
          const paidBadge = o.status === 'paid'
            ? `<span class="badge-active">Pagado</span>`
            : `<span class="badge-inactive">Pendiente</span>`;
          const moodleBadge = o.moodle_enrolled
            ? `<span class="badge-active small">Inscrito</span>`
            : `<span class="badge-inactive small">No</span>`;
          const voucherCell = o.voucher_url
            ? `<a href="${escHtml(o.voucher_url)}" target="_blank" class="small voucher-link">📎 Ver</a>`
            : `<span class="small muted">—</span>`;
          const notesSnippet = o.notes
            ? `<div class="order-notes-preview small muted" title="${escHtml(o.notes)}">📝 ${escHtml(o.notes.substring(0,30))}${o.notes.length>30?'…':''}</div>`
            : '';
          return `<tr data-order-id="${o.id}">
            <td class="small"><strong>${escHtml(ordRef)}</strong><br><span class="muted">${d}</span></td>
            <td>${escHtml(o.student_name)}<br><a href="mailto:${escHtml(o.student_email)}" class="small muted">${escHtml(o.student_email)}</a>${notesSnippet}</td>
            <td class="small">${escHtml(o.course_title || o.course_slug || '—')}</td>
            <td>${voucherCell}</td>
            <td>${(o.comprobante_type === 'factura' ? 'Factura' : 'Boleta')}<br>${compNumBadge}</td>
            <td>${paidBadge}<br>${moodleBadge}</td>
            <td><button class="secondary small-btn ac-ord-manage" data-id="${o.id}">⚙ Gestionar</button></td>
          </tr>`;
        }).join('');

        ordTbody.querySelectorAll('.ac-ord-manage').forEach(btn => {
          btn.addEventListener('click', () => openManageModal(Number(btn.dataset.id)));
        });
      }
    } catch {
      ordTbody.innerHTML = '<tr><td colspan="7" class="muted small">Error al cargar órdenes.</td></tr>';
    }

    // Load students
    await loadStudentsAdmin();

    // expand cards
    ['ac-table-wrap', 'ac-orders-wrap', 'ac-students-wrap'].forEach(id => {
      const el = q(id);
      if (el?.classList.contains('collapsed')) el.classList.remove('collapsed');
    });
  }

  async function loadStudentsAdmin() {
    const tbody = q('ac-students-body');
    const countEl = q('ac-students-count');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="muted small">Cargando…</td></tr>';
    try {
      const res = await apiFetch('/api/admin/students');
      const students = await res.json().catch(() => []);
      countEl.textContent = Array.isArray(students) ? students.length : 0;
      if (!Array.isArray(students) || !students.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="muted small">Sin alumnos registrados aún.</td></tr>';
        return;
      }
      tbody.innerHTML = students.map(s => `
        <tr>
          <td><strong>${escHtml(s.student_name || '—')}</strong></td>
          <td>${escHtml(s.student_email)}</td>
          <td style="text-align:center;">${s.total_orders}</td>
          <td style="text-align:center;">${s.paid_orders}</td>
          <td>S/ ${Number(s.total_paid || 0).toFixed(2)}</td>
          <td style="text-align:center;">${s.enrolled_count > 0 ? '<span class="badge-active">Sí</span>' : '<span class="badge-inactive">No</span>'}</td>
          <td>
            <button type="button" class="secondary small-btn ac-student-detail-btn" data-email="${escHtml(s.student_email)}" data-name="${escHtml(s.student_name || '')}">Ver órdenes</button>
          </td>
        </tr>`).join('');
      tbody.querySelectorAll('.ac-student-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => showStudentDetail(btn.dataset.email, btn.dataset.name));
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="7" class="muted small">Error al cargar alumnos.</td></tr>';
    }
  }

  async function showStudentDetail(email, name) {
    const modal = q('ac-student-modal');
    const title = q('ac-student-modal-name');
    const tbody = q('ac-student-orders-body');
    if (!modal) return;
    title.textContent = name || email;
    tbody.innerHTML = '<tr><td colspan="8" class="muted small">Cargando…</td></tr>';
    modal.classList.remove('hidden');
    try {
      const res = await apiFetch(`/api/admin/students/${encodeURIComponent(email)}/orders`);
      const orders = await res.json().catch(() => []);
      // Merge into cache so openManageModal can find them
      orders.forEach(o => {
        const idx = _ordersCache.findIndex(c => c.id === o.id);
        if (idx >= 0) _ordersCache[idx] = o; else _ordersCache.push(o);
      });
      if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted small">Sin órdenes.</td></tr>';
        return;
      }
      const compLabel = t => t === 'factura' ? 'Factura' : 'Boleta';
      const statusBadge = s => s === 'paid'
        ? '<span class="badge-active">Pagado</span>'
        : s === 'pending'
        ? '<span class="badge-inactive">Pendiente</span>'
        : `<span class="badge-inactive">${escHtml(s)}</span>`;
      tbody.innerHTML = orders.map(o => {
        const opnum = o.operation_number ? `<br><small class="muted">#${escHtml(o.operation_number)}</small>` : '';
        const voucherIcon = o.voucher_url ? ` <a href="${escHtml(o.voucher_url)}" target="_blank" title="Ver constancia">📎</a>` : '';
        const compNum = o.comprobante_number ? `<br><small class="muted">${escHtml(o.comprobante_number)}</small>` : '';
        return `<tr>
          <td><strong>ORD-${String(o.id).padStart(4,'0')}</strong><br><small class="muted">${escHtml((o.created_at||'').slice(0,10))}</small></td>
          <td>${escHtml(o.course_title||'—')}</td>
          <td>S/ ${Number(o.amount||0).toFixed(2)}${opnum}</td>
          <td>${compLabel(o.comprobante_type)}${compNum}<br><small class="muted">${escHtml(o.taxpayer_id||'')}</small></td>
          <td>${statusBadge(o.status)}${voucherIcon}</td>
          <td>${o.moodle_enrolled ? '<span class="badge-active">Matriculado</span>' : '<span class="badge-inactive">No</span>'}</td>
          <td>${o.notes ? `<span class="small muted" title="${escHtml(o.notes)}">📝</span>` : ''}</td>
          <td><button type="button" class="secondary small-btn ac-stud-ord-manage" data-id="${o.id}">⚙ Gestionar</button></td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('.ac-stud-ord-manage').forEach(btn => {
        btn.addEventListener('click', () => {
          modal.classList.add('hidden');
          openManageModal(Number(btn.dataset.id));
        });
      });
    } catch {
      tbody.innerHTML = '<tr><td colspan="8" class="muted small">Error al cargar.</td></tr>';
    }
  }

  // ── Gestionar orden modal ────────────────────────────────────────────────────

  let _ordersCache = [];
  let _managedOrderId = null;

  function openManageModal(orderId) {
    const o = _ordersCache.find(x => x.id === orderId);
    if (!o) return;
    _managedOrderId = orderId;

    const ordRef = `ORD-${String(o.id).padStart(4,'0')}`;
    const d = new Date(o.created_at + 'Z').toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' });

    // Summary
    q('mgmt-ref').textContent = ordRef;
    q('mgmt-student').textContent = o.student_name || '—';
    const emailEl = q('mgmt-email'); emailEl.textContent = o.student_email || '—'; emailEl.href = `mailto:${o.student_email}`;
    q('mgmt-course').textContent = o.course_title || o.course_slug || '—';
    q('mgmt-amount').textContent = `S/ ${Number(o.amount || 0).toFixed(2)}`;
    q('mgmt-method').textContent = o.payment_method || '—';
    const opnumRow = q('mgmt-opnum-row');
    if (o.operation_number) { q('mgmt-opnum').textContent = o.operation_number; opnumRow.style.display = ''; }
    else { opnumRow.style.display = 'none'; }
    q('mgmt-date').textContent = d;
    q('mgmt-comp-type-info').textContent = `${o.comprobante_type === 'factura' ? 'Factura' : 'Boleta'}${o.taxpayer_id ? ' · ' + o.taxpayer_id : ''}`;

    // Pago section
    const isPaid = o.status === 'paid';
    q('mgmt-pay-badge').innerHTML = isPaid
      ? '<span class="badge-active">Pagado</span>'
      : '<span class="badge-inactive">Pendiente</span>';
    q('mgmt-pay-form').style.display = '';
    q('mgmt-confirm-pay').style.display = isPaid ? 'none' : '';
    q('mgmt-confirm-pay').textContent = '✓ Confirmar pago';
    q('mgmt-confirm-pay').disabled = false;
    const saveOpnumBtn = q('mgmt-save-opnum');
    if (saveOpnumBtn) saveOpnumBtn.style.display = isPaid ? '' : 'none';
    q('mgmt-pay-opnum').value = o.operation_number || '';
    q('mgmt-pay-opnum').placeholder = isPaid ? 'N° operación (editar)' : 'Ej. 12345678';
    q('mgmt-pay-status').textContent = '';

    // Constancia section
    const voucherCur = q('mgmt-voucher-current');
    voucherCur.innerHTML = o.voucher_url
      ? `<a href="${escHtml(o.voucher_url)}" target="_blank" class="voucher-link small">📎 Ver constancia adjunta</a>`
      : '<span class="small muted">Sin constancia</span>';
    q('mgmt-voucher-file').value = '';
    q('mgmt-voucher-status').textContent = '';
    q('mgmt-voucher-dropzone').classList.remove('dragover');
    q('mgmt-req-voucher').textContent = '📩 Solicitar al alumno';
    q('mgmt-req-voucher').disabled = false;
    q('mgmt-req-voucher').style.display = '';

    // Comprobante section
    q('mgmt-comp-type').textContent = o.comprobante_type === 'factura' ? 'Factura' : 'Boleta';
    const taxpayerEl = q('mgmt-taxpayer-info');
    taxpayerEl.textContent = [o.taxpayer_id, o.taxpayer_name].filter(Boolean).join(' · ') || '';
    q('mgmt-comp-number').value = o.comprobante_number || '';
    q('mgmt-comp-status').textContent = '';

    // Moodle section
    q('mgmt-moodle-badge').innerHTML = o.moodle_enrolled
      ? '<span class="badge-active">Inscrito</span>'
      : '<span class="badge-inactive">No inscrito</span>';
    q('mgmt-provision-btn-wrap').style.display = (o.status === 'paid' && !o.moodle_enrolled) ? '' : 'none';
    const provBtn = q('mgmt-provision'); provBtn.disabled = false; provBtn.textContent = '📧 Enviar credenciales';
    q('mgmt-unenroll-btn-wrap').style.display = o.moodle_enrolled ? '' : 'none';
    const unenBtn = q('mgmt-unenroll'); unenBtn.disabled = false; unenBtn.textContent = '🚫 Desmatricular';
    q('mgmt-moodle-status').textContent = '';

    // Notas
    q('mgmt-notes').value = o.notes || '';
    q('mgmt-notes-status').textContent = '';

    q('ac-manage-modal').classList.remove('hidden');
  }

  async function mgmtApiCall(path, body) {
    return apiFetch(path, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function mgmtRefresh() {
    const id = _managedOrderId;
    await loadAcademiaAdmin();
    if (id) openManageModal(id);
  }

  async function uploadMgmtVoucher(file) {
    const id = _managedOrderId;
    const statusEl = q('mgmt-voucher-status');
    if (file.size > 10 * 1024 * 1024) { statusEl.textContent = 'Archivo demasiado grande (máx 10 MB).'; return; }
    statusEl.textContent = 'Subiendo archivo…';
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(`/api/admin/orders/${id}/voucher-upload`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        statusEl.textContent = `Error: ${err.error || res.status}`;
        return;
      }
      const { voucher_url } = await res.json();
      const o = _ordersCache.find(x => x.id === id);
      if (o) o.voucher_url = voucher_url;
      statusEl.textContent = '✓ Constancia guardada.';
      setTimeout(() => mgmtRefresh(), 1000);
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
    }
  }

  function bindAcademiaEvents() {
    if (acEventsBound) return;
    acEventsBound = true;

    bindOnce('ac-new-btn', () => acOpenForm(null));
    bindOnce('ac-form-cancel', acCloseForm);
    bindOnce('ac-form-cancel2', acCloseForm);
    bindOnce('ac-save-btn', acSaveCourse);

    // Dynamic list "+" buttons for course fields
    bindOnce('ac-add-learn',    () => acDynListAdd('ac-learn-list'));
    bindOnce('ac-add-include',  () => acDynListAdd('ac-includes-list'));
    bindOnce('ac-add-audience', () => acDynListAdd('ac-audience-list'));

    // Page content — dynamic stat/benefit rows
    bindOnce('ac-stat-add', function () {
      renderAcStatRows([...getAcStats(), { num: "", label: "" }]);
    });
    bindOnce('ac-benefit-add', function () {
      renderAcBenefitRows([...getAcBenefits(), { icon: "estrella", title: "", description: "" }]);
    });

    // ── Gestionar orden modal ───────────────────────────────────────────────
    bindOnce('ac-manage-close', () => q('ac-manage-modal').classList.add('hidden'));

    // Confirm pay / save operation number
    bindOnce('mgmt-confirm-pay', async () => {
      const id = _managedOrderId;
      const o = _ordersCache.find(x => x.id === id);
      const isPaid = o?.status === 'paid';
      const opnum = (q('mgmt-pay-opnum').value || '').trim();
      const statusEl = q('mgmt-pay-status');
      statusEl.textContent = 'Guardando…';
      const body = isPaid ? {} : { status: 'paid', payment_method: 'manual' };
      if (opnum) body.operation_number = opnum;
      const res = await mgmtApiCall(`/api/admin/orders/${id}`, body);
      if (res.ok) {
        statusEl.textContent = isPaid ? '✓ N° de operación guardado.' : '✓ Pago confirmado.';
        await mgmtRefresh();
      } else statusEl.textContent = 'Error al guardar.';
    });

    // Save operation number (also used above - separate "Guardar N° op" button for paid orders)
    bindOnce('mgmt-save-opnum', async () => {
      const id = _managedOrderId;
      const opnum = (q('mgmt-pay-opnum').value || '').trim();
      const statusEl = q('mgmt-pay-status');
      statusEl.textContent = 'Guardando…';
      const res = await mgmtApiCall(`/api/admin/orders/${id}`, { operation_number: opnum });
      if (res.ok) { statusEl.textContent = '✓ Guardado.'; await mgmtRefresh(); }
      else statusEl.textContent = 'Error al guardar.';
    });

    // Voucher upload in modal
    {
      const dropzone = q('mgmt-voucher-dropzone');
      const fileInput = q('mgmt-voucher-file');
      const browse = q('mgmt-voucher-browse');
      if (dropzone && fileInput) {
        browse?.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', e => {
          e.preventDefault(); dropzone.classList.remove('dragover');
          const f = e.dataTransfer.files[0]; if (f) uploadMgmtVoucher(f);
        });
        fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadMgmtVoucher(fileInput.files[0]); });
      }
    }

    // Request voucher email
    bindOnce('mgmt-req-voucher', async () => {
      const id = _managedOrderId;
      const o = _ordersCache.find(x => x.id === id);
      if (!confirm(`¿Enviar correo a ${o?.student_email} solicitando la constancia de pago?`)) return;
      const btn = q('mgmt-req-voucher');
      btn.disabled = true; btn.textContent = 'Enviando…';
      const res = await apiFetch(`/api/admin/orders/${id}/request_voucher`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { btn.textContent = '✓ Correo enviado'; }
      else { alert(data.error || 'Error al enviar correo.'); btn.disabled = false; btn.textContent = '📩 Solicitar al alumno'; }
    });

    // Save comprobante number
    bindOnce('mgmt-save-comp', async () => {
      const id = _managedOrderId;
      const num = (q('mgmt-comp-number').value || '').trim();
      const statusEl = q('mgmt-comp-status');
      if (!num) { statusEl.textContent = 'Ingresa el N° de comprobante.'; return; }
      statusEl.textContent = 'Guardando…';
      const res = await mgmtApiCall(`/api/admin/orders/${id}`, { comprobante_number: num });
      if (res.ok) { statusEl.textContent = '✓ Guardado.'; await mgmtRefresh(); }
      else statusEl.textContent = 'Error al guardar.';
    });

    // Send Moodle credentials
    bindOnce('mgmt-provision', async () => {
      const id = _managedOrderId;
      const o = _ordersCache.find(x => x.id === id);
      if (!confirm(`¿Enviar credenciales Moodle a ${o?.student_name} (${o?.student_email})?\n\nEsto enviará el correo de bienvenida.`)) return;
      const btn = q('mgmt-provision');
      btn.disabled = true; btn.textContent = 'Enviando…';
      const res = await apiFetch(`/api/admin/orders/${id}/provision`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        q('mgmt-moodle-status').textContent = '✓ Procesando matrícula…';
        btn.textContent = '✓ Enviado';
        setTimeout(() => mgmtRefresh(), 2000);
      } else {
        alert(data.error || 'Error al enviar credenciales.');
        btn.disabled = false; btn.textContent = '📧 Enviar credenciales';
      }
    });

    // Unenroll from Moodle
    bindOnce('mgmt-unenroll', async () => {
      const id = _managedOrderId;
      const o = _ordersCache.find(x => x.id === id);
      if (!confirm(`¿Desmatricular a ${o?.student_name} del curso en Moodle?\n\nEsto revocará su acceso al curso.`)) return;
      const btn = q('mgmt-unenroll');
      btn.disabled = true; btn.textContent = 'Desmatriculando…';
      const res = await apiFetch(`/api/admin/orders/${id}/unenroll`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { q('mgmt-moodle-status').textContent = '✓ Desmatriculado.'; await mgmtRefresh(); }
      else { alert(data.error || 'Error al desmatricular.'); btn.disabled = false; btn.textContent = '🚫 Desmatricular'; }
    });

    // Save notes
    bindOnce('mgmt-save-notes', async () => {
      const id = _managedOrderId;
      const notes = (q('mgmt-notes').value || '').trim();
      const statusEl = q('mgmt-notes-status');
      statusEl.textContent = 'Guardando…';
      const res = await mgmtApiCall(`/api/admin/orders/${id}`, { notes });
      if (res.ok) { statusEl.textContent = '✓ Guardado.'; await mgmtRefresh(); }
      else statusEl.textContent = 'Error al guardar.';
    });

    // Close modal on overlay click
    q('ac-manage-modal')?.addEventListener('click', e => {
      if (e.target === q('ac-manage-modal')) q('ac-manage-modal').classList.add('hidden');
    });
    bindOnce('ac-add-module', () => {
      const list = q('ac-modules-list');
      const mi = list.querySelectorAll('.ac-module-block').length;
      const tmp = document.createElement('div');
      tmp.innerHTML = acModuleHtml({ title: '', duration: '', lessons: [] }, mi);
      list.appendChild(tmp.firstElementChild);
    });

    // auto-slug from title
    const titleInput = q('ac-title');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        if (!acEditId) q('ac-slug').value = acSlugify(titleInput.value);
      });
    }

    // Module list event delegation (set up once, works for all dynamic content)
    const modList = q('ac-modules-list');
    if (modList) {
      modList.addEventListener('click', (ev) => {
        if (ev.target.closest('.ac-del-module')) {
          ev.target.closest('.ac-module-block').remove();
          acRenumberModules();
        } else if (ev.target.closest('.ac-del-lesson')) {
          ev.target.closest('.ac-lesson-row').remove();
        } else if (ev.target.closest('.ac-add-lesson')) {
          const block = ev.target.closest('.ac-module-block');
          const container = block.querySelector('.ac-lessons-list');
          const li = container.querySelectorAll('.ac-lesson-row').length;
          const tmp = document.createElement('div');
          tmp.innerHTML = `<div class="ac-lesson-row"><input type="text" class="ac-lesson-title" placeholder="Lección ${li+1}"><input type="text" class="ac-lesson-dur" placeholder="12:30" style="width:80px"><select class="ac-lesson-type form-select" style="width:90px"><option value="video">Video</option><option value="pdf">PDF</option><option value="quiz">Quiz</option></select><button type="button" class="secondary small-btn danger ac-del-lesson">✕</button></div>`;
          container.appendChild(tmp.firstElementChild);
        }
      });
    }
  }

  function bindOnce(id, fn) {
    const el = q(id);
    if (el && !el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener('click', fn); }
  }

  function escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // endregion Academia

  async function loadPublicationsAdmin() {
    const status = q("status-publications");
    if (status) status.textContent = "Cargando publicaciones...";
    try {
      const [catsRes, pubsRes, heroRes] = await Promise.all([apiFetch("/api/categories"), apiFetch("/api/publications?all=1"), apiFetch("/config/page/publicaciones")]);
      const cats = catsRes.ok ? await catsRes.json() : [];
      const pubs = pubsRes.ok ? await pubsRes.json() : [];
      const heroData = heroRes.ok ? await heroRes.json() : {};
      categoriesCache = cats || [];
      pubsCache = pubs || [];
      pubsFiltered = pubsCache.slice();
      pubsPage = 1;
      publicationsHeroData = heroData || {};
      publicationsHeroSlides = (heroData && heroData.hero) || [];
      const catFilter = q("pub-filter-category");
      if (catFilter) {
        catFilter.innerHTML = `<option value="">Todas</option>${categoriesCache.map((c) => `<option value="${c.id}">${safe(c.name)}</option>`).join("")}`;
      }
      renderCategoriesAdmin();
      applyPubFilters();
      renderPubHeroForm();
      if (status) status.textContent = pubsCache.length ? `${pubsCache.length} publicaciones` : "Sin publicaciones";
    } catch (err) {
      console.error("Error cargando publicaciones admin", err);
      if (status) status.textContent = "Error al cargar publicaciones";
    }
  }

  async function openPublicationForm(pub) {
    currentPubEditing = pub && pub.id ? pub.id : null;
    setText("pub-edit-title", pub?.id ? "Editar publicación" : "Nueva publicación");
    q("pub-table-card")?.classList.add("hidden");
    const panel = q("pub-edit-panel");
    const body = q("pub-edit-body");
    const collapseBtn = panel?.querySelector(".collapse-btn");
    const setValSafe = (id, v) => {
      const el = q(id);
      if (el) el.value = v || "";
    };
    setValSafe("pub-form-title", pub?.title || "");
    setValSafe("pub-form-slug", pub?.slug || "");
    const slugInput = q("pub-form-slug");
    if (slugInput) {
      slugInput.readOnly = true;
      slugInput.dataset.auto = pub?.id ? "0" : "1";
    }
    const contentEditor = q("pub-content-editor");
    if (contentEditor) contentEditor.innerHTML = "";
    setValSafe("pub-form-content", pub?.content_html || "");
    setValSafe("pub-form-date", pub?.published_at || "");
    setValSafe("pub-form-author", pub?.author || "");
    setImgPicker("pub-hero-image", pub?.hero_image_url || "");
    const catSel = q("pub-form-category");
    if (catSel) {
      catSel.innerHTML = categoriesCache.map((c) => `<option value="${c.id}">${safe(c.name)}</option>`).join("");
      catSel.value = pub?.category_id || "";
    }
    const activeSel = q("pub-form-active");
    if (activeSel) activeSel.value = pub?.active ? "1" : "0";
    publicationEditorReady = setupPublicationEditor(pub?.content_html || "");
    await publicationEditorReady;
    if (panel) panel.classList.remove("hidden");
    if (body) body.classList.remove("collapsed");
    if (collapseBtn) collapseBtn.textContent = "-";
  }

  function closePublicationForm() {
    currentPubEditing = null;
    destroyPublicationEditor();
    q("pub-edit-panel")?.classList.add("hidden");
    q("pub-table-card")?.classList.remove("hidden");
    setText("status-pub-edit", "");
  }

  async function savePublicationForm() {
    const status = q("status-pub-edit");
    if (status) status.textContent = "Guardando...";
    if (publicationEditorReady) await publicationEditorReady;
    const content_html = publicationEditor
      ? normalizePublicationHtmlForStorage(publicationEditor.getHTML().trim())
      : q("pub-form-content")?.value.trim();
    const slugInput = q("pub-form-slug");
    const rawTitle = q("pub-form-title")?.value.trim();
    const currentSlug = slugInput?.value.trim();
    const computedSlug = slugify(rawTitle);
    const payload = {
      title: rawTitle,
      slug: currentSlug || computedSlug,
      content_html,
      category_id: q("pub-form-category")?.value,
      published_at: q("pub-form-date")?.value || null,
      active: q("pub-form-active")?.value === "1" ? 1 : 0,
      author: q("pub-form-author")?.value.trim(),
      hero_image_url: q("pub-hero-image")?.value.trim(),
    };
    if (slugInput && (!currentPubEditing || slugInput.dataset.auto === "1")) {
      slugInput.value = payload.slug;
    }
    if (!payload.title) {
      if (status) status.textContent = "Título requerido";
      return;
    }
    if (!payload.category_id) {
      if (status) status.textContent = "Categoría requerida";
      return;
    }
    try {
      if (currentPubEditing) {
        const res = await apiFetch(`/api/publications/${currentPubEditing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Error al actualizar");
        }
      } else {
        const res = await apiFetch("/api/publications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Error al crear");
        }
      }
      if (status) status.textContent = "Guardado";
      await loadPublicationsAdmin();
      closePublicationForm();
    } catch (err) {
      console.error("Error guardando publicación", err);
      if (status) status.textContent = err.message || "Error al guardar";
    }
  }

  // categories admin actions
  q('add-category-btn')?.addEventListener('click', async () => {
    const name = getVal('new-category-name');
    if (!name) return;
    const res = await apiFetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!res.ok) return alert('Error creando categoría');
    q('new-category-name').value = '';
      await loadPublicationsAdmin();
    });

    q("save-pub-hero")?.addEventListener("click", savePubHero);
    q("reload-pub-hero")?.addEventListener("click", renderPubHeroForm);

  function renderCategoriesAdmin() {
    const wrap = q("categories-list");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!categoriesCache.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" class="muted">No hay categorías creadas.</td>`;
      wrap.appendChild(tr);
      return;
    }
    categoriesCache.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(c.name)}</td>
        <td>${safe(c.posts || 0)}</td>
        <td><button type="button" class="danger small-btn" data-action="delete-category" data-id="${safe(c.id)}">Eliminar</button></td>
      `;
      wrap.appendChild(tr);
    });
  }

  function renderPubHeroForm() {
    const cont = q("pub-hero-slides");
    if (!cont) return;
    cont.innerHTML = "";
    const slides = publicationsHeroSlides && publicationsHeroSlides.length ? publicationsHeroSlides : [{}];
    slides.forEach((h, idx) => {
      cont.insertAdjacentHTML("beforeend", heroCard(h, idx));
    });
    setText("status-pub-hero", "");
  }

  async function savePubHero() {
    const status = q("status-pub-hero");
    if (status) status.textContent = "Guardando...";
    const heroSlides = serializeCards("#pub-hero-slides .hero-card");
    const payload = {
      hero: heroSlides,
      story: publicationsHeroData?.story || {},
      about: publicationsHeroData?.about || {},
      team: publicationsHeroData?.team || [],
      team_meta: publicationsHeroData?.team_meta || {},
      services: publicationsHeroData?.services || [],
      services_meta: publicationsHeroData?.services_meta || {},
    };
    try {
      const res = await apiFetch("/config/page/publicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      if (status) status.textContent = "Hero guardado";
      publicationsHeroSlides = heroSlides;
      await loadPublicationsAdmin();
    } catch (err) {
      console.error("Error guardando hero publicaciones", err);
      if (status) status.textContent = "Error al guardar hero";
    }
  }



  function renderSubscriptions(list) {
    const tbody = q("subs-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / subsPageSize));
    if (subsPage > totalPages) subsPage = totalPages;
    const start = (subsPage - 1) * subsPageSize;
    const pageItems = list.slice(start, start + subsPageSize);

    pageItems.forEach((sub) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(sub.email)}</td>
        <td>${safe(sub.created_at)}</td>
        <td><button class="danger small-btn" data-action="delete-sub" data-id="${safe(sub.id)}">Eliminar</button></td>
      `;
      tbody.appendChild(tr);
    });

    const info = q("subs-page-info");
    if (info) info.textContent = `Página ${subsPage} de ${totalPages}`;
    const prev = q("subs-prev");
    const next = q("subs-next");
    if (prev) prev.disabled = subsPage <= 1;
    if (next) next.disabled = subsPage >= totalPages;
  }

  function applySubsFilters(resetPage = false) {
    if (resetPage) subsPage = 1;
    const term = (q("subs-filter-email")?.value || "").toLowerCase().trim();
    const start = q("subs-filter-start")?.value;
    const end = q("subs-filter-end")?.value;
    subsFiltered = subsCache.filter((sub) => {
      const emailOk = !term || (sub.email || "").toLowerCase().includes(term);
      let dateOk = true;
      if (start) {
        dateOk = dateOk && new Date(sub.created_at) >= new Date(start);
      }
      if (end) {
        const endDate = new Date(end);
        endDate.setDate(endDate.getDate() + 1);
        dateOk = dateOk && new Date(sub.created_at) < endDate;
      }
      return emailOk && dateOk;
    });
    renderSubscriptions(subsFiltered);
    const status = q("status-subs");
    if (status) status.textContent = subsFiltered.length ? `${subsFiltered.length} suscriptores` : "Sin suscriptores";
  }

  function changeSubsPage(delta) {
    const totalPages = Math.max(1, Math.ceil(subsFiltered.length / subsPageSize));
    subsPage = Math.min(totalPages, Math.max(1, subsPage + delta));
    renderSubscriptions(subsFiltered);
  }

  async function deleteSubscription(id) {
    const status = q("status-subs");
    status.textContent = "Eliminando...";
    const res = await apiFetch(`/subscriptions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      status.textContent = "Error al eliminar";
      return;
    }
    await loadSubscriptions();
    status.textContent = "Eliminado";
  }
    async function exportSubscriptions() {
      const status = q("status-subs");
      status.textContent = "Exportando...";
      try {
        const data = subsFiltered.length ? subsFiltered : subsCache;
      const rows = [["email", "created_at"], ...data.map((s) => [s.email, s.created_at])];
      const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "suscriptores.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      status.textContent = "Exportado";
    } catch (err) {
      console.error("Error exportando suscriptores", err);
        status.textContent = "Error al exportar";
      }
    }

    function truncateText(text, limit = 160) {
      const s = (text || "").trim();
      if (s.length <= limit) return s;
      return s.slice(0, limit) + "...";
    }

    async function loadContactMessages() {
      const status = q("status-contact");
      if (status) status.textContent = "Cargando...";
      try {
        const res = await apiFetch("/api/contact?limit=500");
        if (!res.ok) {
          if (status) status.textContent = "Error al cargar mensajes";
          return;
        }
        contactCache = (await res.json()) || [];
        contactPage = 1;
        applyContactFilters(true);
        if (status) status.textContent = contactCache.length ? `${contactCache.length} mensajes` : "Sin mensajes";
      } catch (err) {
        console.error("Error cargando mensajes", err);
        if (status) status.textContent = "Error al cargar mensajes";
      }
    }

    function renderContactMessages(list) {
      const tbody = q("contact-body");
      if (!tbody) return;
      tbody.innerHTML = "";
      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / contactPageSize));
      if (contactPage > totalPages) contactPage = totalPages;
      const start = (contactPage - 1) * contactPageSize;
      const pageItems = list.slice(start, start + contactPageSize);

      pageItems.forEach((msg) => {
        const created = msg.created_at ? new Date(msg.created_at) : null;
        const createdText = created && !Number.isNaN(created.getTime())
          ? created.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })
          : "";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${safe(msg.name)}</td>
          <td>${safe(msg.email)}</td>
          <td>${safe(msg.subject || "")}</td>
          <td class="message">${safe(truncateText(msg.message))}</td>
          <td>${safe(createdText)}</td>
          <td><button class="secondary small-btn" data-action="contact-view" data-id="${safe(msg.id)}">Ver</button></td>
          <td><button class="danger small-btn" data-action="contact-delete" data-id="${safe(msg.id)}">Eliminar</button></td>
        `;
        tbody.appendChild(tr);
      });

      const info = q("contact-page-info");
      if (info) info.textContent = `Página ${contactPage} de ${totalPages}`;
      const prev = q("contact-prev");
      const next = q("contact-next");
      if (prev) prev.disabled = contactPage <= 1;
      if (next) next.disabled = contactPage >= totalPages;
    }

    function applyContactFilters(resetPage = false) {
      if (resetPage) contactPage = 1;
      const nameTerm = (q("contact-filter-name")?.value || "").toLowerCase().trim();
      const emailTerm = (q("contact-filter-email")?.value || "").toLowerCase().trim();
      const subjectTerm = (q("contact-filter-subject")?.value || "").toLowerCase().trim();
      const start = q("contact-filter-start")?.value;
      const end = q("contact-filter-end")?.value;
      contactFiltered = contactCache.filter((msg) => {
        const nameOk = !nameTerm || (msg.name || "").toLowerCase().includes(nameTerm);
        const emailOk = !emailTerm || (msg.email || "").toLowerCase().includes(emailTerm);
        const subjectOk = !subjectTerm || (msg.subject || "").toLowerCase().includes(subjectTerm);
        let dateOk = true;
        if (start) {
          const startDate = new Date(`${start}T00:00:00Z`);
          dateOk = dateOk && new Date(msg.created_at) >= startDate;
        }
        if (end) {
          const endDate = new Date(`${end}T23:59:59Z`);
          dateOk = dateOk && new Date(msg.created_at) <= endDate;
        }
        return nameOk && emailOk && subjectOk && dateOk;
      });
      renderContactMessages(contactFiltered);
      const status = q("status-contact");
      if (status) status.textContent = contactFiltered.length ? `${contactFiltered.length} mensajes` : "Sin mensajes";
    }

    function changeContactPage(delta) {
      const totalPages = Math.max(1, Math.ceil(contactFiltered.length / contactPageSize));
      contactPage = Math.min(totalPages, Math.max(1, contactPage + delta));
      renderContactMessages(contactFiltered);
    }

    async function exportContactMessages() {
      const status = q("status-contact");
      if (status) status.textContent = "Exportando...";
      try {
        const data = contactFiltered.length ? contactFiltered : contactCache;
        const rows = [
          ["name", "email", "phone", "subject", "message", "created_at", "status"],
          ...data.map((m) => [m.name, m.email, m.phone, m.subject, m.message, m.created_at, m.status]),
        ];
        const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mensajes-contacto.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (status) status.textContent = "Exportado";
      } catch (err) {
        console.error("Error exportando mensajes", err);
        if (status) status.textContent = "Error al exportar";
      }
    }

  function resetAdminForm() {
    currentAdminUserId = null;
    const username = q("admin-user-username");
    const password = q("admin-user-password");
    if (username) {
      username.value = "";
      username.readOnly = false;
    }
    if (password) password.value = "";
    const role = q("admin-user-role");
    if (role) role.value = "editor";
    const active = q("admin-user-active");
    if (active) active.value = "1";
  }

  function renderAdminUsers() {
    const body = q("admin-user-table");
    if (!body) return;
    body.innerHTML = adminUsers
      .map((u) => {
        const active = Number(u.active) === 1 ? "Si" : "No";
        return `
          <tr>
            <td>${safe(u.username)}</td>
            <td>${safe(u.role)}</td>
            <td>${active}</td>
            <td>
              <button type="button" class="secondary small-btn" data-action="admin-edit" data-id="${safe(u.id)}">Editar</button>
              <button type="button" class="danger small-btn" data-action="admin-delete" data-id="${safe(u.id)}">Eliminar</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadAdminUsers() {
    const status = q("admin-user-status");
    if (status) status.textContent = "Cargando usuarios...";
    try {
      const res = await apiFetch("/auth/admins");
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        if (status) status.textContent = data.error || "No autorizado";
        adminUsers = [];
        renderAdminUsers();
        return;
      }
      adminUsers = Array.isArray(data) ? data : [];
      renderAdminUsers();
      if (status) status.textContent = adminUsers.length ? `${adminUsers.length} usuarios` : "Sin usuarios";
    } catch (err) {
      console.error("Error cargando usuarios admin", err);
      if (status) status.textContent = "Error al cargar usuarios";
    }
  }

  function openAdminUserForm(user) {
    const username = q("admin-user-username");
    const password = q("admin-user-password");
    const role = q("admin-user-role");
    const active = q("admin-user-active");
    currentAdminUserId = user?.id || null;
    if (username) {
      username.value = user?.username || "";
      username.readOnly = false;
    }
    if (password) password.value = "";
    if (role) role.value = user?.role || "editor";
    if (active) active.value = user?.active ? "1" : "0";
  }

  async function saveAdminUser() {
    const status = q("admin-user-status");
    if (status) status.textContent = "Guardando...";
    const username = getVal("admin-user-username");
    const password = getVal("admin-user-password");
    const role = (q("admin-user-role")?.value || "editor").trim();
    const active = (q("admin-user-active")?.value || "1") === "1";
    try {
      if (currentAdminUserId) {
        const payload = { role, active, username };
        if (password) payload.password = password;
        const res = await apiFetch(`/auth/admins/${currentAdminUserId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (status) status.textContent = data.error || "No autorizado";
          return;
        }
        if (status) status.textContent = "Actualizado";
      } else {
        if (!username || !password) {
          if (status) status.textContent = "Usuario y password son obligatorios";
          return;
        }
        const res = await apiFetch("/auth/admins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, role, active }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (status) status.textContent = data.error || "No autorizado";
          return;
        }
        if (status) status.textContent = "Usuario creado";
      }
      resetAdminForm();
      await loadAdminUsers();
    } catch (err) {
      console.error("Error guardando admin", err);
      if (status) status.textContent = "Error al guardar";
    }
  }

  function setActive(page) {
    document.querySelectorAll(".sidebar button").forEach((btn) => btn.classList.toggle("active", btn.dataset.page === page));
  }

  function openContactModal(message) {
    const modal = q("contact-modal");
    const meta = q("contact-modal-meta");
    const body = q("contact-modal-message");
    if (!modal || !meta || !body) return;
    const parts = [];
    if (message.name) parts.push(message.name);
    if (message.email) parts.push(`<${message.email}>`);
    if (message.phone) parts.push(message.phone);
    if (message.subject) parts.push(`• ${message.subject}`);
    meta.textContent = parts.join(" ");
    body.textContent = message.message || "";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeContactModal() {
    const modal = q("contact-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  // --- Publicaciones admin UI helpers
  function publicationCard(post = {}) {
    const val = (f) => safe(post[f]);
    const uid = post.id ? `pub-${post.id}` : `pub-${Date.now()}`;
    // include current category id as data attribute so initialization can select the right option
    const activeVal = post.active === 0 || post.active === false ? "0" : "1";
    return `
      <div class="card pub-card" data-id="${post.id || ""}" data-uid="${uid}" data-cat="${val("category_id")}">
        <div class="row between">
          <div class="small" style="display:flex; flex-direction:column; gap:4px;">
            <label class="small" style="margin:0;">Estado</label>
            <select data-field="active" aria-label="Estado publicación">
              <option value="1" ${activeVal === "1" ? "selected" : ""}>Activa</option>
              <option value="0" ${activeVal === "0" ? "selected" : ""}>Inactiva</option>
            </select>
          </div>
          <div>
            <button type="button" class="small-btn" data-action="edit-pub">Editar</button>
            <button type="button" class="danger small-btn" data-action="delete-pub">Eliminar</button>
          </div>
        </div>
        <label>Título</label><input data-field="title" value="${val("title")}" placeholder="${val("title")}">
        <label>Slug</label><input data-field="slug" value="${val("slug")}" placeholder="${val("slug")}">

        <label>Extracto</label>
        <div class="rich-editor pub-excerpt-editor">
          <div class="editor-toolbar" id="excerpt-toolbar-${uid}">
            <button type="button" data-cmd="undo">Deshacer</button>
            <button type="button" data-cmd="redo">Rehacer</button>
            <button type="button" data-cmd="bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic"><em>I</em></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="styleTitle">Titulo</button>
            <button type="button" data-cmd="styleSubtitle">Subtitulo</button>
            <select class="editor-block-select" data-cmd="formatBlock">
              <option value="">Bloque</option>
              <option value="P">Parrafo</option>
              <option value="H2">H2</option>
              <option value="H3">H3</option>
              <option value="H4">H4</option>
            </select>
            <select class="font-size-select" data-cmd="fontSizePx">
              <option value="">Tamano</option>
              <option value="10">10 px</option>
              <option value="11">11 px</option>
              <option value="12">12 px</option>
              <option value="14">14 px</option>
              <option value="16">16 px</option>
              <option value="18">18 px</option>
              <option value="20">20 px</option>
              <option value="24">24 px</option>
              <option value="28">28 px</option>
              <option value="32">32 px</option>
            </select>
            <select class="editor-palette-select" data-cmd="textColor">
              <option value="">Color texto</option>
              <option value="#0b3b91">Azul marca</option>
              <option value="#b07d2f">Dorado marca</option>
              <option value="#233656">Azul oscuro</option>
              <option value="#4b5563">Gris</option>
              <option value="#111111">Negro</option>
            </select>
            <select class="editor-palette-select" data-cmd="textBackgroundColor">
              <option value="">Resaltado</option>
              <option value="#fff4bf">Amarillo suave</option>
              <option value="#dbeafe">Azul suave</option>
              <option value="#dcfce7">Verde suave</option>
              <option value="#fee2e2">Rojo suave</option>
              <option value="#f3e8ff">Lila suave</option>
            </select>
            <button type="button" data-cmd="insertUnorderedList">Lista</button>
            <button type="button" data-cmd="insertOrderedList">1. Lista</button>
            <button type="button" data-cmd="blockquote">Cita</button>
            <button type="button" data-cmd="insertHorizontalRule">Linea</button>
            <button type="button" data-cmd="createLink">Enlace</button>
            <button type="button" data-cmd="unlink">Quitar enlace</button>
            <button type="button" data-cmd="textAlignLeft">Alinear izq</button>
            <button type="button" data-cmd="textAlignCenter">Centrar</button>
            <button type="button" data-cmd="textAlignRight">Alinear der</button>
            <button type="button" data-cmd="insertTable">Tabla</button>
            <button type="button" data-cmd="removeFormat">Limpiar</button>
          </div>
          <div id="excerpt-editor-${uid}" class="editor-surface" contenteditable="true" data-editor-field="excerpt">${post.excerpt || ''}</div>
        </div>

        <label>Contenido (HTML)</label>
        <div class="rich-editor pub-content-editor">
          <div class="editor-toolbar" id="content-toolbar-${uid}">
            <button type="button" data-cmd="undo">Deshacer</button>
            <button type="button" data-cmd="redo">Rehacer</button>
            <button type="button" data-cmd="bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic"><em>I</em></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="styleTitle">Titulo</button>
            <button type="button" data-cmd="styleSubtitle">Subtitulo</button>
            <select class="editor-block-select" data-cmd="formatBlock">
              <option value="">Bloque</option>
              <option value="P">Parrafo</option>
              <option value="H2">H2</option>
              <option value="H3">H3</option>
              <option value="H4">H4</option>
            </select>
            <select class="font-size-select" data-cmd="fontSizePx">
              <option value="">Tamano</option>
              <option value="10">10 px</option>
              <option value="11">11 px</option>
              <option value="12">12 px</option>
              <option value="14">14 px</option>
              <option value="16">16 px</option>
              <option value="18">18 px</option>
              <option value="20">20 px</option>
              <option value="24">24 px</option>
              <option value="28">28 px</option>
              <option value="32">32 px</option>
            </select>
            <select class="editor-palette-select" data-cmd="textColor">
              <option value="">Color texto</option>
              <option value="#0b3b91">Azul marca</option>
              <option value="#b07d2f">Dorado marca</option>
              <option value="#233656">Azul oscuro</option>
              <option value="#4b5563">Gris</option>
              <option value="#111111">Negro</option>
            </select>
            <select class="editor-palette-select" data-cmd="textBackgroundColor">
              <option value="">Resaltado</option>
              <option value="#fff4bf">Amarillo suave</option>
              <option value="#dbeafe">Azul suave</option>
              <option value="#dcfce7">Verde suave</option>
              <option value="#fee2e2">Rojo suave</option>
              <option value="#f3e8ff">Lila suave</option>
            </select>
            <button type="button" data-cmd="insertUnorderedList">Lista</button>
            <button type="button" data-cmd="insertOrderedList">1. Lista</button>
            <button type="button" data-cmd="blockquote">Cita</button>
            <button type="button" data-cmd="insertHorizontalRule">Linea</button>
            <button type="button" data-cmd="createLink">Enlace</button>
            <button type="button" data-cmd="unlink">Quitar enlace</button>
            <button type="button" data-cmd="insertImage">Imagen</button>
            <button type="button" data-cmd="textAlignLeft">Alinear izq</button>
            <button type="button" data-cmd="textAlignCenter">Centrar</button>
            <button type="button" data-cmd="textAlignRight">Alinear der</button>
            <button type="button" data-cmd="wrapSquare">Ajuste cuadrado</button>
            <button type="button" data-cmd="wrapBlock">Ajuste arriba/abajo</button>
            <button type="button" data-cmd="insertTable">Tabla</button>
            <button type="button" data-cmd="removeFormat">Limpiar</button>
          </div>
          <div id="content-editor-${uid}" class="editor-surface" contenteditable="true" data-editor-field="content_html">${post.content_html || ''}</div>
        </div>

        <label>Categoría</label>
        <select data-field="category_id" class="pub-category-select">
          <option value="">(Sin categoría)</option>
        </select>
        <label>Fecha de publicación</label>
        <div class="row">
          <input type="date" data-field="published_at" value="${val("published_at") || ''}" placeholder="${val("published_at") || ''}" aria-label="Fecha de publicación">
        </div>
        ${val("published_at") ? '<small class="muted">Fecha guardada en DB: <span class="saved-pub-date" data-date="' + val("published_at") + '">' + val("published_at") + '</span></small>' : '<small class="muted">Dejar vacío para asignar la fecha actual al guardar</small>'}
      </div>
    `;
  }

  function hideAllSections() {
    q("company-section").classList.add("hidden");
    q("page-section").classList.add("hidden");
    q("subs-section")?.classList.add("hidden");
    q("contact-section")?.classList.add("hidden");
    q("publications-section")?.classList.add("hidden");
    q("academia-section")?.classList.add("hidden");
    q("pagos-section")?.classList.add("hidden");
    q("kdbweb-section")?.classList.add("hidden");
    q("users-section")?.classList.add("hidden");
    q("legales-section")?.classList.add("hidden");
  }

  function switchToCompany() {
    currentPage = null;
    currentSection = "company";
    setActive("company");
    hideAllSections();
    q("company-section").classList.remove("hidden");
    loadPageVisibility();
  }

  async function switchToLegales(pageKey) {
    currentPage = null;
    currentSection = "legales";
    setActive("legales");
    hideAllSections();
    q("legales-section")?.classList.remove("hidden");
    await loadLegalPage(pageKey || currentLegalPage);
  }

  async function switchToPage(page) {
    currentPage = page;
    currentSection = "page";
    setActive(page);
    hideAllSections();
    q("page-section").classList.remove("hidden");
    await loadPage(page);
  }

  async function switchToSubs() {
    currentPage = null;
    currentSection = "subs";
    setActive("subs");
    hideAllSections();
    q("subs-section").classList.remove("hidden");
    await loadSubscriptions();
  }

  async function switchToContact() {
    currentPage = null;
    currentSection = "contacto";
    setActive("contacto");
    hideAllSections();
    q("contact-section").classList.remove("hidden");
    await loadContactMessages();
  }

  async function switchToPublications() {
    currentPage = null;
    currentSection = "publicaciones";
    setActive("publicaciones");
    hideAllSections();
    q("publications-section").classList.remove("hidden");
    await loadPublicationsAdmin();
  }

  // ── Academia page content — dynamic rows ───────────────────────────────────

  var BENEFIT_ICON_OPTS = [
    ["docentes", "Graduación / Docentes"],
    ["reloj",    "Reloj / Tiempo"],
    ["escudo",   "Escudo / Seguridad"],
    ["monitor",  "Monitor / Online"],
    ["archivo",  "Archivo / Material"],
    ["chat",     "Chat / Soporte"],
    ["estrella", "Estrella / Calidad"],
    ["personas", "Personas / Equipo"],
    ["check",    "Check / Completado"],
    ["rayo",     "Rayo / Dinamismo"],
  ];

  function renderAcStatRows(stats) {
    const container = q("ac-stats-rows");
    if (!container) return;
    container.innerHTML = "";
    (stats || []).forEach(function (s) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem;";
      row.innerHTML =
        '<input type="text" class="ac-stat-num" placeholder="6+" value="' + safe(s.num || "") + '" style="width:90px;flex-shrink:0" />' +
        '<input type="text" class="ac-stat-label" placeholder="Cursos" value="' + safe(s.label || "") + '" style="flex:1" />' +
        '<button type="button" class="secondary small-btn danger" style="flex-shrink:0;padding:.25rem .5rem;">✕</button>';
      row.querySelector("button").addEventListener("click", function () { row.remove(); });
      container.appendChild(row);
    });
  }

  function renderAcBenefitRows(benefits) {
    const container = q("ac-benefits-rows");
    if (!container) return;
    container.innerHTML = "";
    (benefits || []).forEach(function (b) {
      const row = document.createElement("div");
      row.style.cssText = "border:1px solid #e4e9f4;padding:.65rem .75rem;border-radius:6px;margin-bottom:.5rem;";
      const iconOpts = BENEFIT_ICON_OPTS.map(function (opt) {
        return '<option value="' + opt[0] + '"' + (b.icon === opt[0] ? " selected" : "") + ">" + opt[1] + "</option>";
      }).join("");
      row.innerHTML =
        '<div style="display:flex;gap:.5rem;margin-bottom:.4rem;align-items:center;">' +
          '<select class="ac-benefit-icon" style="flex-shrink:0;font-size:.8rem;">' + iconOpts + "</select>" +
          '<input type="text" class="ac-benefit-title" placeholder="Título" value="' + safe(b.title || "") + '" style="flex:1" />' +
          '<button type="button" class="secondary small-btn danger" style="flex-shrink:0;padding:.25rem .5rem;">✕</button>' +
        "</div>" +
        '<input type="text" class="ac-benefit-desc" placeholder="Descripción" value="' + safe(b.description || "") + '" style="width:100%;box-sizing:border-box" />';
      row.querySelector("button").addEventListener("click", function () { row.remove(); });
      container.appendChild(row);
    });
  }

  function getAcStats() {
    const container = q("ac-stats-rows");
    if (!container) return [];
    return Array.from(container.querySelectorAll(":scope > div")).map(function (row) {
      return {
        num:   (row.querySelector(".ac-stat-num")   || {}).value || "",
        label: (row.querySelector(".ac-stat-label") || {}).value || "",
      };
    }).filter(function (s) { return s.num || s.label; });
  }

  function getAcBenefits() {
    const container = q("ac-benefits-rows");
    if (!container) return [];
    return Array.from(container.querySelectorAll(":scope > div")).map(function (row) {
      return {
        icon:        (row.querySelector(".ac-benefit-icon")  || {}).value || "estrella",
        title:       (row.querySelector(".ac-benefit-title") || {}).value || "",
        description: (row.querySelector(".ac-benefit-desc")  || {}).value || "",
      };
    }).filter(function (b) { return b.title || b.description; });
  }

  async function loadAcademiaPageContent() {
    const status = q("ac-page-status");
    if (status) status.textContent = "Cargando...";
    try {
      const res = await apiFetch("/config/page/academia");
      if (!res.ok) {
        if (status) status.textContent = "Error al cargar";
        return;
      }
      const data = await res.json();
      const about = data.about || {};
      const story = data.story || {};
      const services = data.services || [];
      const servicesMeta = data.services_meta || {};

      // Hero
      setVal("ac-page-kicker", about.primary_label || "");
      setVal("ac-page-title", about.title || "");
      setVal("ac-page-desc", about.content || "");
      setImgPicker("ac-page-hero-image", about.image_url || "");

      // Stats (stored as JSON in story.html)
      let stats = [];
      try { stats = JSON.parse(story.html || "[]"); } catch (_) {}
      renderAcStatRows(stats);

      // Benefits
      setVal("ac-benefits-title", servicesMeta.title || "");
      renderAcBenefitRows(services);

      // CTA
      setVal("ac-cta-title",     story.title      || "");
      setVal("ac-cta-desc",      story.paragraphs || "");
      setVal("ac-cta-btn-label", about.secondary_label || "");
      setVal("ac-cta-btn-href",  about.secondary_href  || "");

      if (status) status.textContent = "";
    } catch (err) {
      console.error("Error cargando contenido academia", err);
      if (status) status.textContent = "Error al cargar";
    }
  }

  async function saveAcademiaPageContent() {
    const status = q("ac-page-status");
    if (status) status.textContent = "Guardando...";

    const stats = getAcStats();
    const benefits = getAcBenefits();

    const payload = {
      about: {
        primary_label:   (q("ac-page-kicker")       || {}).value || "",
        title:           (q("ac-page-title")         || {}).value || "",
        content:         (q("ac-page-desc")          || {}).value || "",
        image_url:       (q("ac-page-hero-image")    || {}).value || "",
        secondary_label: (q("ac-cta-btn-label")      || {}).value || "",
        secondary_href:  (q("ac-cta-btn-href")       || {}).value || "",
      },
      story: {
        title:        (q("ac-cta-title") || {}).value || "",
        paragraphs:   (q("ac-cta-desc")  || {}).value || "",
        content_html: JSON.stringify(stats),
      },
      services_meta: { title: (q("ac-benefits-title") || {}).value || "" },
      services:      benefits,
      hero:          [],
      team:          [],
      team_meta:     {},
    };

    try {
      const res = await apiFetch("/config/page/academia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save");
      if (status) status.textContent = "Contenido guardado";
      setTimeout(() => { if (status) status.textContent = ""; }, 3000);
    } catch (err) {
      console.error("Error guardando contenido academia", err);
      if (status) status.textContent = "Error al guardar";
    }
  }

  async function switchToAcademia() {
    currentPage = null;
    currentSection = "academia";
    setActive("academia");
    hideAllSections();
    q("academia-section").classList.remove("hidden");
    bindAcademiaEvents();
    await loadAcademiaAdmin();
    await loadAcademiaPageContent();
    const saveBtn = q("ac-page-save");
    if (saveBtn && !saveBtn._acPageBound) {
      saveBtn._acPageBound = true;
      saveBtn.addEventListener("click", saveAcademiaPageContent);
    }
  }

  // ── Pagos ──────────────────────────────────────────────────────────────────

  let payBankData = [];

  function payBankRowHtml(bank, idx) {
    return `
      <div class="pay-bank-row" data-bi="${idx}" style="border:1px solid #e4e9f4;padding:1rem;margin-bottom:.6rem;">
        <div class="grid-2" style="gap:.5rem;">
          <div><label style="font-size:.78rem;">Nombre del banco</label><input type="text" class="pb-name" placeholder="BCP" value="${escHtml(bank.bank_name||'')}" /></div>
          <div><label style="font-size:.78rem;">Moneda</label><input type="text" class="pb-currency" placeholder="PEN" style="max-width:80px;" value="${escHtml(bank.currency||'PEN')}" /></div>
          <div class="full"><label style="font-size:.78rem;">Titular</label><input type="text" class="pb-holder" placeholder="Katarzyna Legal &amp; Tributario SAC" value="${escHtml(bank.holder||'')}" /></div>
          <div><label style="font-size:.78rem;">N° de cuenta</label><input type="text" class="pb-account" placeholder="191-12345678-0-12" value="${escHtml(bank.account||'')}" /></div>
          <div><label style="font-size:.78rem;">CCI</label><input type="text" class="pb-cci" placeholder="00219101234567801234" value="${escHtml(bank.cci||'')}" /></div>
          <div style="display:flex;align-items:flex-end;">
            <button type="button" class="secondary small-btn danger pb-del-btn" style="margin-top:auto;">Quitar</button>
          </div>
        </div>
      </div>`;
  }

  function payRenderBanks() {
    const container = q('pay-banks-list');
    if (!container) return;
    if (!payBankData.length) {
      container.innerHTML = '<p class="small muted">Sin cuentas bancarias. Haz clic en "+ Agregar banco".</p>';
      return;
    }
    container.innerHTML = payBankData.map((b, i) => payBankRowHtml(b, i)).join('');
    container.querySelectorAll('.pb-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.pay-bank-row');
        const idx = parseInt(row.dataset.bi, 10);
        payBankData.splice(idx, 1);
        payRenderBanks();
      });
    });
  }

  function payGetBanks() {
    const container = q('pay-banks-list');
    if (!container) return [];
    return [...container.querySelectorAll('.pay-bank-row')].map(row => ({
      bank_name: row.querySelector('.pb-name')?.value?.trim() || '',
      currency:  row.querySelector('.pb-currency')?.value?.trim() || 'PEN',
      holder:    row.querySelector('.pb-holder')?.value?.trim() || '',
      account:   row.querySelector('.pb-account')?.value?.trim() || '',
      cci:       row.querySelector('.pb-cci')?.value?.trim() || '',
    }));
  }

  async function loadPagosAdmin() {
    try {
      const res = await apiFetch('/api/payment-config');
      if (!res.ok) return;
      const data = await res.json();
      setVal('pay-yape-number', data.yape_number || '');
      setImgPicker('pay-yape-qr-url', data.yape_qr_url || '');
      setVal('pay-plin-number', data.plin_number || '');
      setImgPicker('pay-plin-qr-url', data.plin_qr_url || '');
      payBankData = Array.isArray(data.bank_accounts) ? data.bank_accounts : [];
      payRenderBanks();
    } catch (err) {
      console.error('Error cargando config de pagos', err);
    }
  }

  async function savePagosAdmin() {
    const status = q('pay-save-status');
    if (status) status.textContent = 'Guardando…';
    const payload = {
      yape_number: (q('pay-yape-number')?.value || '').trim(),
      yape_qr_url: (q('pay-yape-qr-url')?.value || '').trim(),
      plin_number: (q('pay-plin-number')?.value || '').trim(),
      plin_qr_url: (q('pay-plin-qr-url')?.value || '').trim(),
      bank_accounts: payGetBanks(),
    };
    try {
      const res = await apiFetch('/config/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save');
      if (status) status.textContent = '✓ Guardado';
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } catch (err) {
      if (status) status.textContent = 'Error al guardar';
    }
  }

  let pagosBound = false;
  async function switchToPagos() {
    currentPage = null;
    currentSection = "pagos";
    setActive("pagos");
    hideAllSections();
    q("pagos-section").classList.remove("hidden");
    await loadPagosAdmin();
    if (!pagosBound) {
      pagosBound = true;
      q('pay-add-bank')?.addEventListener('click', () => {
        payBankData.push({ bank_name: '', currency: 'PEN', holder: '', account: '', cci: '' });
        payRenderBanks();
      });
      q('pay-save-btn')?.addEventListener('click', savePagosAdmin);
    }
  }

  async function switchToKdbweb() {
    currentPage = null;
    currentSection = "kdbweb";
    setActive("kdbweb");
    hideAllSections();
    q("kdbweb-section").classList.remove("hidden");
    await loadKdbwebAdmin();
  }

  async function switchToUsers() {
    currentPage = null;
    currentSection = "usuarios";
    setActive("usuarios");
    hideAllSections();
    q("users-section").classList.remove("hidden");
    resetAdminForm();
    await loadAdminUsers();
  }

  const applySection = async (section) => {
    if (LEGAL_PAGE_SET.has(section)) return switchToLegales(section);
    const normalized = adminSections.has(section) ? section : "company";
    if (normalized === "company") return switchToCompany();
    if (normalized === "subs") return switchToSubs();
    if (normalized === "contacto") return switchToContact();
    if (normalized === "publicaciones" || normalized === "publications") return switchToPublications();
    if (normalized === "academia") return switchToAcademia();
    if (normalized === "pagos") return switchToPagos();
    if (normalized === "kdbweb") return switchToKdbweb();
    if (normalized === "legales") return switchToLegales();
    if (normalized === "usuarios") return switchToUsers();
    return switchToPage(normalized);
  };

  const navigateToSection = async (section) => {
    await applySection(section);
    pushAdminState(section);
  };

  function setupRichEditor(toolbarId, editorId) {
    const toolbar = q(toolbarId);
    const editor = q(editorId);
    if (!toolbar || !editor) return;
    if (toolbar.dataset.bound === "1") return;
    toolbar.dataset.bound = "1";

    // Lazy-create hidden file input for image uploads
    if (!imagePickerEl) {
      imagePickerEl = document.createElement("input");
      imagePickerEl.type = "file";
      imagePickerEl.accept = "image/*";
      imagePickerEl.style.display = "none";
      document.body.appendChild(imagePickerEl);
    }

    const ensureLinkTargets = () => {
      editor.querySelectorAll("a").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      });
    };
    linkEnsurers[editorId] = ensureLinkTargets;

    toolbar.addEventListener("click", (ev) => {
      if (ev.target.closest("button[data-cmd]")) ev.preventDefault();
      const btn = ev.target.closest("button[data-cmd]");
      if (!btn) return;
      const cmd = btn.dataset.cmd;
      if (cmd === "createLink") {
        const selection = document.getSelection();
        const anchor = selection?.anchorNode ? selection.anchorNode.parentElement.closest("a") : null;
        const currentHref = anchor?.getAttribute("href") || "https://";
        const url = prompt("Ingresa la URL del enlace:", currentHref);
        if (!url) return;
        document.execCommand(cmd, false, url);
        ensureLinkTargets();
        editor.focus();
        return;
      }

      if (cmd === "insertImage") {
        openMediaModalForEditor(editor);
        return;
      }

      if (cmd === "wrapSquare" || cmd === "wrapBlock") {
        const img = requireImage(editor);
        if (!img) return;
        const wrap = makeResizable(img);
        const alignClass =
          ["img-align-left", "img-align-center", "img-align-right"].find((cls) => wrap.classList.contains(cls) || img.classList.contains(cls)) ||
          getAlignmentFromBlock(wrap);
        wrap.classList.remove("img-wrap-square", "img-wrap-block", "img-align-left", "img-align-center", "img-align-right");
        img.classList.remove("img-wrap-square", "img-wrap-block", "img-align-left", "img-align-center", "img-align-right");
        if (cmd === "wrapSquare") {
          wrap.classList.add("img-wrap-square");
          img.classList.add("img-wrap-square");
          if (alignClass) {
            wrap.classList.add(alignClass);
            img.classList.add(alignClass);
          }
        } else {
          wrap.classList.add("img-wrap-block");
          img.classList.add("img-wrap-block");
        }
        editor.focus();
        return;
      }

      if (cmd === "alignLeft" || cmd === "alignCenter" || cmd === "alignRight") {
        const img = requireImage(editor);
        if (!img) return;
        const target = makeResizable(img);
        img.classList.remove("img-align-left", "img-align-center", "img-align-right");
        target.classList.remove("img-align-left", "img-align-center", "img-align-right");
        if (cmd === "alignLeft") { img.classList.add("img-align-left"); target.classList.add("img-align-left"); }
        if (cmd === "alignCenter") { img.classList.add("img-align-center"); target.classList.add("img-align-center"); }
        if (cmd === "alignRight") { img.classList.add("img-align-right"); target.classList.add("img-align-right"); }
        document.execCommand("justify" + cmd.replace("align", ""), false, null);
        editor.focus();
        return;
      }
      if (cmd === "textAlignLeft" || cmd === "textAlignCenter" || cmd === "textAlignRight" || cmd === "textAlignJustify") {
        const map = {
          textAlignLeft: "justifyLeft",
          textAlignCenter: "justifyCenter",
          textAlignRight: "justifyRight",
          textAlignJustify: "justifyFull",
        };
        const img = getSelectedOrAnchoredImage(editor);
        if (img && cmd !== "textAlignJustify") {
          const wrap = makeResizable(img);
          const clsMap = {
            textAlignLeft: "img-align-left",
            textAlignCenter: "img-align-center",
            textAlignRight: "img-align-right",
          };
          const alignCls = clsMap[cmd];
          wrap.classList.remove("img-align-left", "img-align-center", "img-align-right");
          img.classList.remove("img-align-left", "img-align-center", "img-align-right");
          wrap.classList.add(alignCls);
          img.classList.add(alignCls);
          editor.focus();
          return;
        }
        const justifyCmd = map[cmd];
        editor.focus();
        const sel = window.getSelection();
        const anchorInEditor = sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode);
        if (!anchorInEditor) {
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        document.execCommand(justifyCmd, false, null);
        return;
      }

      if (cmd === "formatBlock") {
        const block = (btn.dataset.value || "P").toUpperCase();
        document.execCommand(cmd, false, block);
        editor.focus();
        ensureLinkTargets();
        return;
      }

      if (cmd === "blockquote") {
        document.execCommand("formatBlock", false, "BLOCKQUOTE");
        editor.focus();
        ensureLinkTargets();
        return;
      }

      if (cmd === "insertHorizontalRule") {
        document.execCommand("insertHorizontalRule", false, null);
        editor.focus();
        ensureLinkTargets();
        return;
      }

      if (cmd === "insertTable") {
        insertTableAtSelection(editor);
        ensureLinkTargets();
        return;
      }

      if (cmd === "styleTitle" || cmd === "styleSubtitle") {
        const className = cmd === "styleTitle" ? "text-title" : "text-subtitle";
        applyTextClass(editor, className);
        ensureLinkTargets();
        return;
      }

      if (cmd === "fontSizePx") {
        const raw = btn.dataset.value;
        if (!raw) return;
        applyFontSize(editor, raw);
        ensureLinkTargets();
        return;
      }

      // other toolbar commands: unlink, removeFormat, simple exec
      if (cmd === "unlink") {
        document.execCommand("unlink", false, null);
        editor.focus();
        ensureLinkTargets();
        return;
      }

      if (cmd === "removeFormat") {
        document.execCommand(cmd, false, null);
        editor.focus();
        ensureLinkTargets();
        return;
      }

      if (cmd === "undo" || cmd === "redo") {
        document.execCommand(cmd, false, null);
        editor.focus();
        ensureLinkTargets();
        return;
      }

      // fallback: execute command
      document.execCommand(cmd, false, null);
      editor.focus();
      ensureLinkTargets();
    });

    // keep links target attributes in sync on input
    editor.addEventListener("input", () => {
      ensureLinkTargets();
      ensureResizableImages(editor);
    });
    toolbar.addEventListener("change", (ev) => {
      const control = ev.target.closest("select[data-cmd], input[data-cmd]");
      if (!control) return;
      const cmd = control.dataset.cmd;
      if (cmd === "fontSizePx") {
        const size = control.value;
        if (!size) return;
        applyFontSize(editor, size);
        ensureLinkTargets();
        control.value = "";
        return;
      }
      if (cmd === "formatBlock") {
        const block = control.value;
        if (!block) return;
        document.execCommand("formatBlock", false, block.toUpperCase());
        ensureLinkTargets();
        control.value = "";
        editor.focus();
        return;
      }
      if (cmd === "textColor") {
        applyTextColor(editor, control.value);
        ensureLinkTargets();
        control.value = "";
        return;
      }
      if (cmd === "textBackgroundColor") {
        applyTextHighlight(editor, control.value);
        ensureLinkTargets();
        control.value = "";
      }
    });
    editor.addEventListener("keydown", (ev) => {
      if (ev.key !== "Backspace" && ev.key !== "Delete") return;
      const img = getSelectedOrAnchoredImage(editor);
      if (!img) return;
      ev.preventDefault();
      removeImageNode(img, editor);
    });
    editor.addEventListener("click", (ev) => {
      const img = ev.target.closest("img");
      const wrap = ev.target.closest(".img-resizable");
      const picked = img || wrap?.querySelector("img");
      if (picked) {
        selectImage(picked, editor);
      } else {
        selectImage(null, editor);
      }
    });
    editor.addEventListener("mousedown", (ev) => {
      const img = ev.target.closest("img") || ev.target.closest(".img-resizable")?.querySelector("img");
      if (!img) return;
      // select the image wrapper to make dragging/alignment easier
      const wrap = img.closest(".img-resizable");
      if (wrap) {
        selectImage(img, editor);
        const range = document.createRange();
        range.selectNode(wrap);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    enableImageDrag(editor);
  }

  async function loadTiptapModules() {
    if (window.__KDB_TIPTAP__) return window.__KDB_TIPTAP__;
    const [
      core,
      starterKitMod,
      underlineMod,
      linkMod,
      textStyleMod,
      colorMod,
      highlightMod,
      textAlignMod,
      imageMod,
      tableMod,
      tableRowMod,
      tableHeaderMod,
      tableCellMod,
    ] = await Promise.all([
      import("https://esm.sh/@tiptap/core@2.26.1"),
      import("https://esm.sh/@tiptap/starter-kit@2.26.1"),
      import("https://esm.sh/@tiptap/extension-underline@2.26.1"),
      import("https://esm.sh/@tiptap/extension-link@2.26.1"),
      import("https://esm.sh/@tiptap/extension-text-style@2.26.1"),
      import("https://esm.sh/@tiptap/extension-color@2.26.1"),
      import("https://esm.sh/@tiptap/extension-highlight@2.26.1"),
      import("https://esm.sh/@tiptap/extension-text-align@2.26.1"),
      import("https://esm.sh/@tiptap/extension-image@2.26.1"),
      import("https://esm.sh/@tiptap/extension-table@2.26.1"),
      import("https://esm.sh/@tiptap/extension-table-row@2.26.1"),
      import("https://esm.sh/@tiptap/extension-table-header@2.26.1"),
      import("https://esm.sh/@tiptap/extension-table-cell@2.26.1"),
    ]);
    window.__KDB_TIPTAP__ = {
      Editor: core.Editor,
      StarterKit: starterKitMod.default,
      Underline: underlineMod.default,
      Link: linkMod.default,
      TextStyle: textStyleMod.default,
      Color: colorMod.default,
      Highlight: highlightMod.default,
      TextAlign: textAlignMod.default,
      Image: imageMod.default,
      Table: tableMod.default,
      TableRow: tableRowMod.default,
      TableHeader: tableHeaderMod.default,
      TableCell: tableCellMod.default,
      FontSize: core.Extension.create({
        name: "fontSize",
        addGlobalAttributes() {
          return [{
            types: ["textStyle"],
            attributes: {
              fontSize: {
                default: null,
                parseHTML: element => element.style.fontSize || null,
                renderHTML: attributes => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
              },
            },
          }];
        },
        addCommands() {
          return {
            setFontSize: fontSize => ({ chain }) => chain().setMark("textStyle", { fontSize }).run(),
            unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
          };
        },
      }),
    };
    return window.__KDB_TIPTAP__;
  }

  function destroyPublicationEditor() {
    if (!publicationEditor) return;
    publicationEditor.destroy();
    publicationEditor = null;
    publicationEditorReady = null;
    publicationEditorSelection = null;
  }

  function preparePublicationHtmlForEditor(html) {
    if (!html) return "";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const textClassToHex = Object.fromEntries(Object.entries(PUBLICATION_TEXT_COLORS).map(([hex, cls]) => [cls, hex]));
    const highlightClassToHex = Object.fromEntries(Object.entries(PUBLICATION_HIGHLIGHTS).map(([hex, cls]) => [cls, hex]));
    temp.querySelectorAll("span").forEach((span) => {
      const colorClass = [...span.classList].find((cls) => textClassToHex[cls]);
      if (colorClass && !span.style.color) {
        span.style.color = textClassToHex[colorClass];
      }
    });
    temp.querySelectorAll("mark").forEach((mark) => {
      const highlightClass = [...mark.classList].find((cls) => highlightClassToHex[cls]);
      const color = mark.getAttribute("data-color") || (highlightClass ? highlightClassToHex[highlightClass] : "");
      if (color && !mark.style.backgroundColor) {
        mark.style.backgroundColor = color;
      }
      if (color && !mark.getAttribute("data-color")) {
        mark.setAttribute("data-color", color);
      }
    });
    return temp.innerHTML;
  }

  function normalizePublicationHtmlForStorage(html) {
    if (!html) return "";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const textLookup = PUBLICATION_TEXT_COLOR_LOOKUP();
    const highlightLookup = PUBLICATION_HIGHLIGHT_LOOKUP();
    temp.querySelectorAll("span[style], span[class]").forEach((span) => {
      const resolved = resolveCssColor(span.style.color || span.getAttribute("data-color") || "");
      const hit = textLookup[resolved] || textLookup[(span.style.color || "").toLowerCase()];
      Object.values(PUBLICATION_TEXT_COLORS).forEach((cls) => span.classList.remove(cls));
      if (hit) {
        span.classList.add(hit.cls);
        span.setAttribute("data-color", hit.hex);
      } else {
        span.removeAttribute("data-color");
      }
      span.style.removeProperty("color");
      if (!span.getAttribute("style")?.trim()) span.removeAttribute("style");
    });
    temp.querySelectorAll("mark").forEach((mark) => {
      const resolved = resolveCssColor(mark.style.backgroundColor || mark.getAttribute("data-color") || "");
      const hit = highlightLookup[resolved] || highlightLookup[(mark.style.backgroundColor || "").toLowerCase()];
      Object.values(PUBLICATION_HIGHLIGHTS).forEach((cls) => mark.classList.remove(cls));
      if (hit) {
        mark.classList.add(hit.cls);
        mark.setAttribute("data-color", hit.hex);
      } else {
        mark.removeAttribute("data-color");
      }
      mark.style.removeProperty("background-color");
      if (!mark.getAttribute("style")?.trim()) mark.removeAttribute("style");
    });
    return temp.innerHTML;
  }



  function capturePublicationSelectionFromDOM() {
    if (!publicationEditor) return;
    const editorRoot = document.querySelector("#pub-content-editor .ProseMirror");
    const sel = window.getSelection();
    if (!editorRoot || !sel || sel.rangeCount === 0) return;
    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    if (!anchorNode || !focusNode) return;
    if (!editorRoot.contains(anchorNode) || !editorRoot.contains(focusNode)) return;
    try {
      const from = publicationEditor.view.posAtDOM(anchorNode, sel.anchorOffset);
      const to = publicationEditor.view.posAtDOM(focusNode, sel.focusOffset);
      publicationEditorSelection = {
        from: Math.min(from, to),
        to: Math.max(from, to),
      };
    } catch (_) {
      // ignore
    }
  }

  async function setupPublicationEditor(initialHtml) {
    const editorEl = q("pub-content-editor");
    const textarea = q("pub-form-content");
    const toolbar = q("pub-content-toolbar");
    if (!editorEl || !toolbar) return null;
    editorEl.removeAttribute("contenteditable");
    try {
      if (publicationEditor) {
        publicationEditor.commands.setContent(initialHtml || "", false);
        if (textarea) textarea.value = publicationEditor.getHTML();
        return publicationEditor;
      }
      const {
        Editor,
        StarterKit,
        Underline,
        Link,
        TextStyle,
        Color,
        Highlight,
        TextAlign,
        Image,
        Table,
        TableRow,
        TableHeader,
        TableCell,
        FontSize,
      } = await loadTiptapModules();

      publicationEditor = new Editor({
        element: editorEl,
        extensions: [
          StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
          Underline,
          Link.configure({ openOnClick: false }),
          TextStyle,
          FontSize,
          Color,
          Highlight.configure({ multicolor: true }),
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          Image.configure({ HTMLAttributes: { class: "tiptap-image" } }),
          Table.configure({ resizable: true }),
          TableRow,
          TableHeader,
          TableCell,
        ],
        content: preparePublicationHtmlForEditor(initialHtml || ""),
      editorProps: {
        attributes: {
          class: "editor-surface tiptap-surface",
        },
      },
      onUpdate: ({ editor }) => {
        if (textarea) textarea.value = editor.getHTML();
      },
      onSelectionUpdate: ({ editor }) => {
        publicationEditorSelection = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        };
      },
    });

    window.__pubEditor = publicationEditor;

    toolbar.addEventListener("mousedown", (ev) => {
      const target = ev.target.closest("[data-cmd]");
      if (!target) return;
      capturePublicationSelectionFromDOM();
      if (target.matches("button[data-cmd]")) {
        ev.preventDefault();
      }
    });

    toolbar.onclick = (ev) => {
      if (ev.target.closest("button[data-cmd]")) ev.preventDefault();
      const btn = ev.target.closest("button[data-cmd]");
      if (!btn || !publicationEditor) return;
      const cmd = btn.dataset.cmd;
      const value = btn.dataset.value;
      const chain = publicationEditor.chain().focus();
      if (publicationEditorSelection) {
        chain.setTextSelection(publicationEditorSelection);
      }

        if (cmd === "undo") return publicationEditor.commands.undo();
        if (cmd === "redo") return publicationEditor.commands.redo();
        if (cmd === "bold") return chain.toggleBold().run();
        if (cmd === "italic") return chain.toggleItalic().run();
        if (cmd === "underline") return chain.toggleUnderline().run();
        if (cmd === "insertUnorderedList") return chain.toggleBulletList().run();
        if (cmd === "insertOrderedList") return chain.toggleOrderedList().run();
        if (cmd === "blockquote") return chain.toggleBlockquote().run();
        if (cmd === "insertHorizontalRule") return chain.setHorizontalRule().run();
        if (cmd === "createLink") {
          const previous = publicationEditor.getAttributes("link").href || "https://";
          const href = prompt("Ingresa la URL del enlace:", previous);
          if (!href) return;
          return chain.extendMarkRange("link").setLink({ href, target: "_blank", rel: "noopener noreferrer" }).run();
        }
        if (cmd === "unlink") return chain.unsetLink().run();
        if (cmd === "insertImage") return openMediaModalForTiptap(publicationEditor);
        if (cmd === "textAlignLeft") return chain.setTextAlign("left").run();
        if (cmd === "textAlignCenter") return chain.setTextAlign("center").run();
        if (cmd === "textAlignRight") return chain.setTextAlign("right").run();
        if (cmd === "textAlignJustify") return chain.setTextAlign("justify").run();
        if (cmd === "insertTable") {
          const rows = Number.parseInt(prompt("Numero de filas:", "3"), 10);
          const cols = Number.parseInt(prompt("Numero de columnas:", "3"), 10);
          if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 1 || cols < 1 || rows > 12 || cols > 8) return;
          return chain.insertTable({ rows, cols, withHeaderRow: true }).run();
        }
        if (cmd === "addRowAfter") return chain.addRowAfter().run();
        if (cmd === "addColumnAfter") return chain.addColumnAfter().run();
        if (cmd === "deleteRow") return chain.deleteRow().run();
        if (cmd === "deleteColumn") return chain.deleteColumn().run();
        if (cmd === "removeFormat") return chain.unsetAllMarks().clearNodes().run();
      if (cmd === "styleTitle") return chain.setHeading({ level: 2 }).run();
      if (cmd === "styleSubtitle") return chain.setHeading({ level: 3 }).run();
      if (cmd === "textColor" && value) return chain.setColor(value).run();
      if (cmd === "textBackgroundColor" && value) return chain.toggleHighlight({ color: value }).run();
    };

      toolbar.onchange = (ev) => {
        const control = ev.target.closest("select[data-cmd]");
        if (!control || !publicationEditor) return;
      const cmd = control.dataset.cmd;
      const value = control.value;
      if (!value) return;
      const chain = publicationEditor.chain().focus();
      if (publicationEditorSelection) {
        chain.setTextSelection(publicationEditorSelection);
      }
      if (cmd === "formatBlock") {
          if (value === "P") chain.setParagraph().run();
          if (value === "H2") chain.setHeading({ level: 2 }).run();
          if (value === "H3") chain.setHeading({ level: 3 }).run();
          if (value === "H4") chain.setHeading({ level: 4 }).run();
        }
        if (cmd === "fontSizePx") chain.setFontSize(`${value}px`).run();
        if (cmd === "textColor") chain.setColor(value).run();
        if (cmd === "textBackgroundColor") chain.toggleHighlight({ color: value }).run();
        control.value = "";
      };

      if (textarea) textarea.value = publicationEditor.getHTML();
      return publicationEditor;
    } catch (err) {
      console.error("TipTap failed, falling back to legacy editor", err);
      editorEl.innerHTML = initialHtml || "";
      setupRichEditor("pub-content-toolbar", "pub-content-editor");
      if (textarea) textarea.value = serializeEditorContent(editorEl);
      return null;
    }
  }

  // Publicaciones: eventos del UI
  document.addEventListener('change', (ev) => {
    const select = ev.target.closest('.hero-href-select');
    if (!select) return;
    const fieldName = select.dataset.hrefField;
    const card = select.closest('.hero-card');
    if (!card || !fieldName) return;
    const input = card.querySelector(`input[data-field="${fieldName}"]`);
    if (!input) return;
    if (select.value === '__custom__') {
      input.style.display = '';
      input.value = '';
      input.focus();
    } else {
      input.style.display = 'none';
      input.value = select.value;
    }
  });

  document.addEventListener('click', (ev) => {
    const actionTarget = ev.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    if (action === 'contact-view') {
      const id = Number(actionTarget.dataset.id);
      const message = contactCache.find((m) => Number(m.id) === id);
      if (message) openContactModal(message);
      return;
    }
    if (action === 'contact-delete') {
      const id = Number(actionTarget.dataset.id);
      if (!id) return;
      if (!confirm('Eliminar este mensaje?')) return;
      const status = q("status-contact");
      if (status) status.textContent = "Eliminando...";
      apiFetch(`/api/contact/${id}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error("Error");
          contactCache = contactCache.filter((m) => Number(m.id) !== id);
          applyContactFilters(true);
          if (status) status.textContent = "Mensaje eliminado";
        })
        .catch(() => {
          if (status) status.textContent = "Error al eliminar";
        });
      return;
    }
    if (action === 'kdbweb-edit') {
      const slug = actionTarget.dataset.slug;
      const entry = kdbwebEntries.find((item) => item.slug === slug);
      if (entry) openKdbwebForm(entry);
      return;
    }
    if (action === 'kdbweb-toggle') {
      const slug = actionTarget.dataset.slug;
      if (!slug) return;
      if (kdbwebCollapsed.has(slug)) {
        kdbwebCollapsed.delete(slug);
      } else {
        kdbwebCollapsed.add(slug);
      }
      renderKdbwebTree();
      return;
    }
    if (action === 'pub-edit') {
      const id = Number(actionTarget.dataset.id);
      const pub = pubsCache.find((p) => Number(p.id) === id);
      openPublicationForm(pub || {});
      return;
    }
    if (action === 'pub-delete') {
      const id = Number(actionTarget.dataset.id);
      if (!confirm('Eliminar publicación?')) return;
      apiFetch(`/api/publications/${id}`, { method: 'DELETE' }).then(() => loadPublicationsAdmin()).catch(() => alert('Error al eliminar'));
      return;
    }
    if (action === 'admin-edit') {
      const id = Number(actionTarget.dataset.id);
      const user = adminUsers.find((u) => Number(u.id) === id);
      if (user) openAdminUserForm(user);
      return;
    }
    if (action === 'admin-delete') {
      const id = Number(actionTarget.dataset.id);
      if (!id) return;
      if (!confirm('Eliminar usuario admin?')) return;
      apiFetch(`/auth/admins/${id}`, { method: 'DELETE' })
        .then((res) => {
          if (!res.ok) throw new Error("Error");
          adminUsers = adminUsers.filter((u) => Number(u.id) !== id);
          renderAdminUsers();
        })
        .catch(() => alert('Error al eliminar'));
      return;
    }
    if (action === 'delete-category') {
      const id = actionTarget.dataset.id;
      const cat = categoriesCache.find((c) => String(c.id) === String(id));
      if (cat && Number(cat.posts) > 0) {
        alert(`No se puede eliminar. La categoria "${cat.name}" tiene ${cat.posts} publicacion(es). Cambia la categoria de esos posts antes de eliminar.`);
        return;
      }
      if (!confirm('Eliminar categoria?')) return;
      apiFetch(`/api/categories/${id}`, { method: 'DELETE' }).then(() => loadPublicationsAdmin());
      return;
    }
  });

  const startAdmin = () => {
    if (adminInitialized) return;
    adminInitialized = true;
    init();
  };

  const checkAuth = async () => {
    try {
      const res = await apiFetch("/auth/me");
      if (!res.ok) return false;
      const data = await res.json();
      setCurrentAdminLabel(data.username ? `Usuario: ${data.username}` : "");
      return true;
    } catch (_) {
      return false;
    }
  };

  const bindAuthHandlers = () => {
    const loginForm = q("admin-login-form");
    const status = q("admin-login-status");
    const bootstrapBtn = q("admin-bootstrap-btn");
    const bootstrapWrap = q("admin-bootstrap");
    if (loginForm && loginForm.dataset.bound !== "1") {
      loginForm.dataset.bound = "1";
      loginForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (status) status.textContent = "Ingresando...";
        const username = getVal("admin-login-username");
        const password = getVal("admin-login-password");
        try {
          const res = await apiFetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (status) status.textContent = data.error || "Credenciales invalidas";
            return;
          }
          setAuthToken(data.token || "");
          setCurrentAdminLabel(data?.admin?.username ? `Usuario: ${data.admin.username}` : "");
          showAuthOverlay(false);
          startAdmin();
        } catch (err) {
          if (status) status.textContent = "Error al ingresar";
        }
      });
    }
    if (bootstrapBtn && bootstrapBtn.dataset.bound !== "1") {
      bootstrapBtn.dataset.bound = "1";
      bootstrapBtn.addEventListener("click", async () => {
        if (status) status.textContent = "Creando admin...";
        const username = getVal("admin-login-username");
        const password = getVal("admin-login-password");
        try {
          const res = await apiFetch("/auth/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (status) status.textContent = data.error || "No se pudo crear";
            return;
          }
          if (status) status.textContent = "Admin creado, ingresando...";
          const loginRes = await apiFetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const loginData = await loginRes.json().catch(() => ({}));
          if (!loginRes.ok) {
            if (status) status.textContent = loginData.error || "No se pudo ingresar";
            return;
          }
          setAuthToken(loginData.token || "");
          setCurrentAdminLabel(loginData?.admin?.username ? `Usuario: ${loginData.admin.username}` : "");
          showAuthOverlay(false);
          startAdmin();
        } catch (_) {
          if (status) status.textContent = "Error al crear admin";
        }
      });
    }
    if (bootstrapWrap) bootstrapWrap.classList.remove("hidden");
  };

  const bootstrapAuth = async () => {
    const ok = await checkAuth();
    if (ok) {
      showAuthOverlay(false);
      startAdmin();
      return;
    }
    showAuthOverlay(true);
    bindAuthHandlers();
  };

  function init() {
    try {
      loadCompany();
      const initial = getSectionFromPath();
      applySection(initial);
      pushAdminState(initial, true);
    } catch (err) {
      console.error("Error init:", err);
    }

    const sidebarToggle = q("sidebar-toggle");
    const sidebarBackdrop = q("sidebar-backdrop");
    const sidebar = document.querySelector(".sidebar");
    const closeSidebar = () => document.body.classList.remove("sidebar-open");
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        document.body.classList.toggle("sidebar-open");
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", closeSidebar);
    }
    if (sidebar) {
      sidebar.addEventListener("click", (ev) => {
        if (ev.target.closest("button")) closeSidebar();
      });
    }

    const bind = (id, handler) => {
      const el = q(id);
      if (!el) {
        console.warn("Elemento no encontrado:", id);
        return;
      }
      el.addEventListener("click", handler);
    };

    bind("admin-logout", async () => {
      try {
        await apiFetch("/auth/logout", { method: "POST" });
      } catch (_) {}
      setAuthToken("");
      setCurrentAdminLabel("");
      showAuthOverlay(true);
      bindAuthHandlers();
    });

    bind("admin-user-save", saveAdminUser);
    bind("admin-user-cancel", resetAdminForm);

    bind("save-company", saveCompany);
    bind("logo-open", openLogoPicker);
    bind("logo-clear", () => {
      setVal("c-logo-url", "");
      setLogoPreview("");
    });
    bind("favicon-open", openFaviconPicker);
    bind("favicon-clear", () => {
      setVal("c-favicon-url", "");
      setFaviconPreview("");
    });
    bind("brochure-upload-btn", () => { const fi = q("c-brochure-file"); if (fi) fi.click(); });
    bind("brochure-clear-btn", async () => {
      const status = q("status-brochure");
      if (status) status.textContent = "Eliminando...";
      const res = await apiFetch("/api/brochure/delete", { method: "POST" });
      if (status) status.textContent = res.ok ? "Brochure eliminado" : "Error al eliminar";
      const display = q("c-brochure-display");
      if (display && res.ok) display.textContent = "Sin archivo";
    });
    const brochureFileInput = q("c-brochure-file");
    if (brochureFileInput) {
      brochureFileInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const status = q("status-brochure");
        if (status) status.textContent = "Subiendo...";
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch("/api/brochure/upload", { method: "POST", body: formData });
        if (res.ok) {
          if (status) status.textContent = "Subido correctamente";
          const display = q("c-brochure-display");
          if (display) display.textContent = "brochure.pdf";
        } else {
          if (status) status.textContent = "Error al subir el archivo";
        }
        brochureFileInput.value = "";
      });
    }
    bind("save-page-visibility", savePageVisibility);
    bind("save-page", savePage);
    bind("legal-save", saveLegalPage);
    bind("legal-save-bottom", saveLegalPage);
      bind("legal-cancel", () => loadLegalPage(currentLegalPage));
      setupRichEditor("about-title-toolbar", "about-title-editor");
      setupRichEditor("about-toolbar", "about-content-editor");
      setupRichEditor("story-title-toolbar", "story-title-editor");
      setupRichEditor("story-toolbar", "story-content-editor");
      setupRichEditor("kw-const-right-toolbar", "kw-const-right-editor");
      setupRichEditor("kw-tratados-right-toolbar", "kw-tratados-right-editor");
      setupRichEditor("kw-leg-right-toolbar",     "kw-leg-right-editor");
    setupRichEditor("legal-content-toolbar", "legal-content-editor");
    const legalSelect = q("legal-page-select");
    if (legalSelect) {
      legalSelect.addEventListener("change", () => loadLegalPage(legalSelect.value));
    }
    bind("add-pub-hero", () => {
      const cont = q("pub-hero-slides");
      if (!cont) return;
      cont.insertAdjacentHTML("beforeend", heroCard({}, cont.children.length));
    });
    bind("reload-pub-hero", renderPubHeroForm);
    bind("save-pub-hero", savePubHero);
    bind("add-kdbweb-hero", () => {
      const cont = q("kdbweb-hero-slides");
      if (!cont) return;
      cont.insertAdjacentHTML("beforeend", heroCard({}, cont.children.length));
    });
    bind("reload-kdbweb-hero", loadKdbwebHero);
    bind("save-kdbweb-hero", saveKdbwebHero);
    bind("add-hero", () => {
      const cont = q("hero-slides");
      cont.insertAdjacentHTML("beforeend", heroCard({}, cont.children.length));
    });
    bind("add-service", () => {
      const cont = q("services-cards");
      if (!cont) return;
      const svc = { _uid: `service-${Date.now()}` };
      cont.insertAdjacentHTML("beforeend", serviceCard(svc, cont.children.length));
      initServiceDescriptionEditors(cont);
    });
    bind("add-team", () => {
      const cont = q("team-cards");
      const m = { _uid: `member-${Date.now()}` };
      cont.insertAdjacentHTML("beforeend", teamCard(m, cont.children.length));
      initTeamDescriptionEditors(cont);
    });
    bind("cancel-page", () => {
      if (!currentPage) return;
      loadPage(currentPage);
    });
    bind("refresh-subs", () => {
      loadSubscriptions();
    });
    bind("export-subs", () => {
      exportSubscriptions();
    });
    ["subs-filter-email", "subs-filter-start", "subs-filter-end"].forEach((id) => {
      const el = q(id);
      if (el) el.addEventListener("input", () => applySubsFilters(true));
    });
    bind("subs-filter-clear", () => {
      ["subs-filter-email", "subs-filter-start", "subs-filter-end"].forEach((id) => {
        const el = q(id);
        if (el) el.value = "";
      });
      applySubsFilters(true);
    });
    bind("subs-prev", () => changeSubsPage(-1));
    bind("subs-next", () => changeSubsPage(1));
    bind("refresh-contact", () => {
      loadContactMessages();
    });
    bind("export-contact", () => {
      exportContactMessages();
    });
    ["contact-filter-name", "contact-filter-email", "contact-filter-subject", "contact-filter-start", "contact-filter-end"].forEach((id) => {
      const el = q(id);
      if (el) el.addEventListener("input", () => applyContactFilters(true));
      if (el && el.tagName === "SELECT") el.addEventListener("change", () => applyContactFilters(true));
    });
    bind("contact-filter-clear", () => {
      ["contact-filter-name", "contact-filter-email", "contact-filter-subject", "contact-filter-start", "contact-filter-end"].forEach((id) => {
        const el = q(id);
        if (el) el.value = "";
      });
      applyContactFilters(true);
    });
    bind("contact-prev", () => changeContactPage(-1));
    bind("contact-next", () => changeContactPage(1));
    bind("contact-modal-close", closeContactModal);
    bind("contact-modal-backdrop", closeContactModal);
    bind("ac-student-modal-close", () => q("ac-student-modal")?.classList.add("hidden"));
    q("ac-student-modal")?.addEventListener("click", e => { if (e.target === q("ac-student-modal")) q("ac-student-modal").classList.add("hidden"); });
    bind("media-modal-close", closeMediaModal);
    bind("media-modal-backdrop", closeMediaModal);
    bind("media-refresh", () => loadMediaLibrary());
    bind("media-back", async () => {
      if (!mediaNavHistory.length) return;
      mediaNavFuture.push(currentMediaPrefix);
      currentMediaPrefix = normalizePrefix(mediaNavHistory.pop());
      setSelectedMediaItem(null);
      await loadMediaLibrary();
    });
    bind("media-forward", async () => {
      if (!mediaNavFuture.length) return;
      mediaNavHistory.push(currentMediaPrefix);
      currentMediaPrefix = normalizePrefix(mediaNavFuture.pop());
      setSelectedMediaItem(null);
      await loadMediaLibrary();
    });
    bind("media-view-grid", () => {
      mediaViewMode = "grid";
      q("media-view-grid")?.classList.add("active");
      q("media-view-list")?.classList.remove("active");
      renderMediaBrowser();
    });
    bind("media-view-list", () => {
      mediaViewMode = "list";
      q("media-view-list")?.classList.add("active");
      q("media-view-grid")?.classList.remove("active");
      renderMediaBrowser();
    });
    bind("media-create-folder", () => {
      const name = prompt("Nombre de la nueva carpeta:");
      if (!name) return;
      setMediaStatus("Creando carpeta...");
      apiFetch("/api/media/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_name: name, prefix: currentMediaPrefix }),
      })
        .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) { setMediaStatus(data.error || "No se pudo crear la carpeta"); return; }
          currentMediaPrefix = normalizePrefix(data.prefix || currentMediaPrefix);
          setMediaStatus("Carpeta creada");
          loadMediaLibrary();
        })
        .catch(() => setMediaStatus("No se pudo crear la carpeta"));
    });
    bind("media-delete-folder", () => {
      if (!currentMediaPrefix) { setMediaStatus("No hay carpeta seleccionada"); return; }
      if (!confirm("¿Eliminar esta carpeta? Debe estar vacía.")) return;
      setMediaStatus("Eliminando carpeta...");
      apiFetch("/api/media/folder/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: currentMediaPrefix }),
      })
        .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) { setMediaStatus(data.error || "No se pudo eliminar la carpeta"); return; }
          navigateToPrefix(getParentPrefix(currentMediaPrefix), false);
        })
        .catch(() => setMediaStatus("No se pudo eliminar la carpeta"));
    });
    bind("media-optimize-all", async () => {
      if (!confirm("¿Optimizar todas las imágenes del bucket? Esto puede tardar varios minutos. Las imágenes ya optimizadas se saltarán automáticamente.")) return;
      const btn = q("media-optimize-all");
      if (btn) { btn.disabled = true; btn.textContent = "⏳ Optimizando..."; }
      setMediaStatus("Optimizando imágenes... esto puede tardar varios minutos.");
      try {
        const res = await apiFetch("/api/media/optimize-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: "" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMediaStatus(data.error || "No se pudo optimizar"); return; }
        const savedMB = (data.saved_bytes / 1024 / 1024).toFixed(1);
        setMediaStatus(`✓ ${data.optimized} optimizadas, ${data.skipped} omitidas, ${data.errors} errores — ${savedMB} MB ahorrados`);
      } catch {
        setMediaStatus("Error al optimizar las imágenes");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "⚡ Optimizar todo"; }
      }
    });
    bind("preview-select-btn", () => {
      if (!selectedMediaItem) return;
      applyMediaSelection(selectedMediaItem.url);
      closeMediaModal();
    });
    const uploadInput = q("media-upload-input");
    if (uploadInput) {
      uploadInput.addEventListener("change", () => {
        const file = uploadInput.files[0];
        if (file) uploadMediaFile(file).then(() => { uploadInput.value = ""; });
      });
    }
    const mediaSearchEl = q("media-search");
    if (mediaSearchEl) mediaSearchEl.addEventListener("input", renderMediaBrowser);
    const breadcrumbEl = q("media-breadcrumb");
    if (breadcrumbEl) {
      breadcrumbEl.addEventListener("click", (ev) => {
        const seg = ev.target.closest(".bc-seg");
        if (seg && !seg.classList.contains("active")) navigateToPrefix(seg.dataset.prefix || "");
      });
    }
    const filesContainer = q("media-files");
    if (filesContainer) {
      filesContainer.addEventListener("click", (ev) => {
        const actionBtn = ev.target.closest("button[data-action]");
        if (actionBtn) {
          ev.stopPropagation();
          const action = actionBtn.dataset.action;
          const key = actionBtn.dataset.key || actionBtn.closest("[data-key]")?.dataset.key || "";
          if (!key) return;
          if (action === "delete") {
            if (!confirm("¿Eliminar esta imagen?")) return;
            setMediaStatus("Eliminando imagen...");
            apiFetch("/api/media/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) })
              .then(r => r.json().catch(() => ({})).then(d => ({ r, d })))
              .then(({ r, d }) => {
                if (!r.ok) { setMediaStatus(d.error || "No se pudo eliminar la imagen"); return; }
                setMediaStatus("Imagen eliminada");
                mediaCache = mediaCache.filter(i => i.key !== key);
                if (selectedMediaItem?.key === key) setSelectedMediaItem(null);
                renderMediaBrowser();
              })
              .catch(() => setMediaStatus("No se pudo eliminar la imagen"));
            return;
          }
          if (action === "move") {
            showMovePopover(key, actionBtn);
            return;
          }
          if (action === "rename") {
            const currentName = key.split("/").pop() || key;
            const newName = prompt("Nuevo nombre:", currentName);
            if (!newName || newName === currentName) return;
            setMediaStatus("Renombrando imagen...");
            apiFetch("/api/media/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, new_name: newName }) })
              .then(r => r.json().catch(() => ({})).then(d => ({ r, d })))
              .then(({ r, d }) => {
                if (!r.ok) { setMediaStatus(d.error || "No se pudo renombrar la imagen"); return; }
                setMediaStatus("Imagen renombrada");
                loadMediaLibrary();
              })
              .catch(() => setMediaStatus("No se pudo renombrar la imagen"));
            return;
          }
        }
        const folderEl = ev.target.closest(".expl-folder, .expl-folder-row");
        if (folderEl) { navigateToPrefix(folderEl.dataset.prefix || ""); return; }
        const fileEl = ev.target.closest(".expl-file, .expl-file-row");
        if (fileEl) {
          const key = fileEl.dataset.key; const url = fileEl.dataset.url;
          const item = mediaCache.find(i => i.key === key) || { key, url };
          setSelectedMediaItem(selectedMediaItem?.key === key ? null : item);
          return;
        }
        setSelectedMediaItem(null);
      });
      filesContainer.addEventListener("dblclick", (ev) => {
        const fileEl = ev.target.closest(".expl-file, .expl-file-row");
        if (fileEl && fileEl.dataset.url) { applyMediaSelection(fileEl.dataset.url); closeMediaModal(); }
      });
    }
    // logo picker uses the shared media modal
    if (!document.body.dataset.mediaPickerBound) {
      document.body.dataset.mediaPickerBound = "1";
      document.body.addEventListener("click", (ev) => {
        // Image picker "Elegir" button
        const btn = ev.target.closest(".media-picker-btn");
        if (btn) {
          const field = btn.closest(".image-picker-field");
          const row = btn.closest(".media-input-row") || btn.parentElement;
          const input = field?.querySelector("input") || row?.querySelector("input");
          if (input) openMediaModalForInput(input);
          return;
        }
        // Image picker "Quitar" (clear) button
        const clearBtn = ev.target.closest(".img-picker-clear");
        if (clearBtn) {
          const field = clearBtn.closest(".image-picker-field");
          const input = field?.querySelector("input");
          if (input) {
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          const thumb = field?.querySelector(".img-picker-thumb");
          const empty = field?.querySelector(".img-picker-empty");
          if (thumb) { thumb.src = ""; thumb.style.display = "none"; }
          if (empty) empty.style.display = "";
          clearBtn.style.display = "none";
        }
      });
    }
    bind("kdbweb-save-all", saveKdbwebEntries);
    bind("kdbweb-reload-all", () => {
      closeKdbwebForm();
      loadKdbwebAdmin();
    });
    bind("kdbweb-save-edit", async () => {
      const status = q("status-kdbweb-edit");
      if (status) status.textContent = "Guardando...";
      await saveKdbwebEntries();
      if (status) status.textContent = "Cambios guardados.";
    });
    bind("kdbweb-cancel-edit", closeKdbwebForm);

    const sidebarButtons = document.querySelectorAll(".sidebar button");
    sidebarButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.dataset.page;
        navigateToSection(page);
      });
    });

    q("hero-slides").addEventListener("click", (ev) => {
      if (ev.target.dataset.action === "remove-hero") {
        const card = ev.target.closest(".hero-card");
        if (card) card.remove();
      }
    });
    const kdbwebHeroSlidesEl = q("kdbweb-hero-slides");
    if (kdbwebHeroSlidesEl) {
      kdbwebHeroSlidesEl.addEventListener("click", (ev) => {
        if (ev.target.dataset.action === "remove-hero") {
          const card = ev.target.closest(".hero-card");
          if (card) card.remove();
        }
      });
    }
    const heroContainer = q("hero-slides");
    if (heroContainer) {
      let draggedHero = null;
      heroContainer.addEventListener("dragstart", (ev) => {
        draggedHero = ev.target.closest(".hero-card");
        if (!draggedHero) return;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "hero");
      });
      heroContainer.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(".hero-card");
        if (!target || target === draggedHero) return;
        target.classList.add("drag-over");
      });
      heroContainer.addEventListener("dragleave", (ev) => {
        const target = ev.target.closest(".hero-card");
        if (target) target.classList.remove("drag-over");
      });
      heroContainer.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(".hero-card");
        if (!draggedHero || !target || target === draggedHero) return;
        target.classList.remove("drag-over");
        const nodes = Array.from(heroContainer.querySelectorAll(".hero-card"));
        const draggedIndex = nodes.indexOf(draggedHero);
        const targetIndex = nodes.indexOf(target);
        if (draggedIndex < targetIndex) {
          heroContainer.insertBefore(draggedHero, target.nextSibling);
        } else {
          heroContainer.insertBefore(draggedHero, target);
        }
        draggedHero = null;
      });
      heroContainer.addEventListener("dragend", () => {
        draggedHero = null;
        heroContainer.querySelectorAll(".hero-card").forEach((c) => c.classList.remove("drag-over"));
      });
    }

    const kdbwebHeroContainer = q("kdbweb-hero-slides");
    if (kdbwebHeroContainer) {
      let draggedHero = null;
      kdbwebHeroContainer.addEventListener("dragstart", (ev) => {
        draggedHero = ev.target.closest(".hero-card");
        if (!draggedHero) return;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "hero");
      });
      kdbwebHeroContainer.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(".hero-card");
        if (!target || target === draggedHero) return;
        target.classList.add("drag-over");
      });
      kdbwebHeroContainer.addEventListener("dragleave", (ev) => {
        const target = ev.target.closest(".hero-card");
        if (target) target.classList.remove("drag-over");
      });
      kdbwebHeroContainer.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(".hero-card");
        if (!draggedHero || !target || target === draggedHero) return;
        target.classList.remove("drag-over");
        const nodes = Array.from(kdbwebHeroContainer.querySelectorAll(".hero-card"));
        const draggedIndex = nodes.indexOf(draggedHero);
        const targetIndex = nodes.indexOf(target);
        if (draggedIndex < targetIndex) {
          kdbwebHeroContainer.insertBefore(draggedHero, target.nextSibling);
        } else {
          kdbwebHeroContainer.insertBefore(draggedHero, target);
        }
        draggedHero = null;
      });
      kdbwebHeroContainer.addEventListener("dragend", () => {
        draggedHero = null;
        kdbwebHeroContainer.querySelectorAll(".hero-card").forEach((c) => c.classList.remove("drag-over"));
      });
    }

    const teamCards = q("team-cards");
    teamCards.addEventListener("click", (ev) => {
      if (ev.target.dataset.action === "remove-team") {
        const card = ev.target.closest(".team-card-admin");
        if (card) card.remove();
      }
    });

    let draggedCard = null;
    teamCards.addEventListener("dragstart", (ev) => {
      draggedCard = ev.target.closest(".team-card-admin");
      if (!draggedCard) return;
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", draggedCard.dataset.uid || "");
    });
    teamCards.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      const target = ev.target.closest(".team-card-admin");
      if (!target || target === draggedCard) return;
      target.classList.add("drag-over");
    });
    teamCards.addEventListener("dragleave", (ev) => {
      const target = ev.target.closest(".team-card-admin");
      if (target) target.classList.remove("drag-over");
    });
    teamCards.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const target = ev.target.closest(".team-card-admin");
      if (!draggedCard || !target || target === draggedCard) return;
      target.classList.remove("drag-over");
      const rect = target.getBoundingClientRect();
      const before = ev.clientY < rect.top + rect.height / 2;
      if (before) {
        teamCards.insertBefore(draggedCard, target);
      } else {
        teamCards.insertBefore(draggedCard, target.nextSibling);
      }
      draggedCard = null;
    });
    teamCards.addEventListener("dragend", () => {
      draggedCard = null;
      teamCards.querySelectorAll(".team-card-admin").forEach((c) => c.classList.remove("drag-over"));
    });

    const servicesCards = q("services-cards");
    if (servicesCards) {
      servicesCards.addEventListener("click", (ev) => {
        if (ev.target.dataset.action === "remove-service") {
          const card = ev.target.closest(".service-card-admin");
          if (card) card.remove();
        }
      });
      let draggedSvc = null;
      servicesCards.addEventListener("dragstart", (ev) => {
        draggedSvc = ev.target.closest(".service-card-admin");
        if (!draggedSvc) return;
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "service");
      });
      servicesCards.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(".service-card-admin");
        if (!target || target === draggedSvc) return;
        target.classList.add("drag-over");
      });
      servicesCards.addEventListener("dragleave", (ev) => {
        const target = ev.target.closest(".service-card-admin");
        if (target) target.classList.remove("drag-over");
      });
      servicesCards.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(".service-card-admin");
        if (!draggedSvc || !target || target === draggedSvc) return;
        target.classList.remove("drag-over");
        const nodes = Array.from(servicesCards.querySelectorAll(".service-card-admin"));
        const draggedIndex = nodes.indexOf(draggedSvc);
        const targetIndex = nodes.indexOf(target);
        if (draggedIndex < targetIndex) {
          servicesCards.insertBefore(draggedSvc, target.nextSibling);
        } else {
          servicesCards.insertBefore(draggedSvc, target);
        }
        draggedSvc = null;
      });
      servicesCards.addEventListener("dragend", () => {
        draggedSvc = null;
        servicesCards.querySelectorAll(".service-card-admin").forEach((c) => c.classList.remove("drag-over"));
      });
    }

    const subsBody = q("subs-body");
    if (subsBody) {
      subsBody.addEventListener("click", (ev) => {
        if (ev.target.dataset.action === "delete-sub") {
          const id = ev.target.dataset.id;
          deleteSubscription(id);
        }
      });
    }

    const kdbwebTree = q("kdbweb-tree");
    if (kdbwebTree) {
      let draggedItem = null;
      let draggedParent = "";
      const clearHints = () => {
        kdbwebTree.querySelectorAll(".kdbweb-row.drop-before, .kdbweb-row.drop-after").forEach((el) => {
          el.classList.remove("drop-before", "drop-after");
        });
      };
      kdbwebTree.addEventListener("dragstart", (ev) => {
        const row = ev.target.closest(".kdbweb-row");
        if (!row) return;
        draggedItem = row.closest(".kdbweb-item");
        if (!draggedItem) return;
        draggedParent = row.dataset.parent || "";
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", draggedItem.dataset.slug || "");
        draggedItem.classList.add("dragging");
      });
      kdbwebTree.addEventListener("dragover", (ev) => {
        if (!draggedItem) return;
        ev.preventDefault();
        clearHints();
        const row = ev.target.closest(".kdbweb-row");
        if (!row) return;
        const targetParent = row.dataset.parent || "";
        if (targetParent !== draggedParent) return;
        const targetItem = row.closest(".kdbweb-item");
        if (!targetItem || targetItem === draggedItem || draggedItem.contains(targetItem)) return;
        const rect = row.getBoundingClientRect();
        const before = ev.clientY < rect.top + rect.height / 2;
        row.classList.add(before ? "drop-before" : "drop-after");
      });
      kdbwebTree.addEventListener("drop", (ev) => {
        if (!draggedItem) return;
        ev.preventDefault();
        const row = ev.target.closest(".kdbweb-row");
        if (!row) {
          clearHints();
          if (draggedItem) draggedItem.classList.remove("dragging");
          draggedItem = null;
          return;
        }
        const targetParent = row.dataset.parent || "";
        if (targetParent !== draggedParent) {
          clearHints();
          if (draggedItem) draggedItem.classList.remove("dragging");
          draggedItem = null;
          return;
        }
        const targetItem = row?.closest(".kdbweb-item");
        if (row && targetItem && targetItem !== draggedItem && !draggedItem.contains(targetItem)) {
          const parentContainer = targetItem.parentElement;
          if (parentContainer) {
            const rect = row.getBoundingClientRect();
            const before = ev.clientY < rect.top + rect.height / 2;
            parentContainer.insertBefore(draggedItem, before ? targetItem : targetItem.nextSibling);
          }
        }
        clearHints();
        if (draggedItem) draggedItem.classList.remove("dragging");
        draggedItem = null;
        syncKdbwebEntriesFromDom();
        renderKdbwebTree();
        setText("status-kdbweb", "Cambios listos para guardar.");
      });
      kdbwebTree.addEventListener("dragend", () => {
        if (draggedItem) draggedItem.classList.remove("dragging");
        draggedItem = null;
        clearHints();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", bootstrapAuth);
  window.addEventListener("popstate", (ev) => {
    const section = ev.state?.section || getSectionFromPath();
    applySection(section);
  });

  // filtros publicaciones
  ["pub-filter-title", "pub-filter-category", "pub-filter-active"].forEach((id) => {
    const el = q(id);
    if (el) el.addEventListener("input", applyPubFilters);
    if (el && el.tagName === "SELECT") el.addEventListener("change", applyPubFilters);
  });
  const clearPub = q("pub-filter-clear");
  if (clearPub) {
    clearPub.addEventListener("click", () => {
      ["pub-filter-title", "pub-filter-category", "pub-filter-active"].forEach((id) => {
        const el = q(id);
        if (el) el.value = "";
      });
      ["pub-filter-start", "pub-filter-end"].forEach((id) => {
        const el = q(id);
        if (el) el.value = "";
      });
      applyPubFilters();
    });
  }
  const addPub = q("pub-add-new");
  if (addPub) addPub.addEventListener("click", () => openPublicationForm({}));
  q("pub-save-edit")?.addEventListener("click", savePublicationForm);
  q("pub-cancel-edit")?.addEventListener("click", () => {
    closePublicationForm();
    renderPublicationsTable();
  });
  const pubTitleInput = q("pub-form-title");
  const pubSlugInput = q("pub-form-slug");
  if (pubTitleInput && pubSlugInput && !pubTitleInput.dataset.slugBound) {
    pubTitleInput.dataset.slugBound = "1";
    pubTitleInput.addEventListener("input", () => {
      if (pubSlugInput.dataset.auto !== "1") return;
      pubSlugInput.value = slugify(pubTitleInput.value.trim());
    });
  }
  ["pub-filter-start", "pub-filter-end"].forEach((id) => {
    const el = q(id);
    if (el) el.addEventListener("change", applyPubFilters);
  });
  q("pub-prev")?.addEventListener("click", () => {
    pubsPage = Math.max(1, pubsPage - 1);
    renderPublicationsTable();
  });
  q("pub-next")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(pubsFiltered.length / pubsPageSize));
    pubsPage = Math.min(totalPages, pubsPage + 1);
    renderPublicationsTable();
  });
})();




document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".collapse-btn");
  if (!btn) return;
  const targetId = btn.dataset.collapseTarget;
  if (!targetId) return;
  const body = document.getElementById(targetId);
  if (!body) return;
  body.classList.toggle("collapsed");
  btn.textContent = body.classList.contains("collapsed") ? "+" : "-";
});





