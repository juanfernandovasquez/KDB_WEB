"use strict";

(() => {
  if (window.__KDB_ADMIN_BOOTED__) {
    console.warn("admin.js already initialized");
    return;
  }
  window.__KDB_ADMIN_BOOTED__ = true;
  console.log("admin.js bootstrap");

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
  let imagePickerEl = null;
  let selectedImage = null;
  let mediaTargetEditor = null;
  let mediaTargetInput = null;
  let mediaCache = [];
  let currentMediaPrefix = "";
  const isHttpUrl = (value) => {
    const clean = (value || "").trim().toLowerCase();
    return clean.startsWith("http://") || clean.startsWith("https://");
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
  const renderMediaGrid = () => {
    const grid = q("media-grid");
    if (!grid) return;
    const term = (q("media-search")?.value || "").toLowerCase().trim();
    const items = mediaCache.filter((item) => {
      if (!term) return true;
      return (item.key || "").toLowerCase().includes(term) || (item.url || "").toLowerCase().includes(term);
    });
    if (!items.length) {
      grid.innerHTML = "<div class=\"media-empty\">Sin imagenes</div>";
      return;
    }
    grid.innerHTML = items
      .map(
        (item) => `
        <div class="media-card" data-url="${safe(item.url || "")}" data-key="${safe(item.key || "")}" title="${safe(item.key || "")}" role="button" tabindex="0">
          <img src="${safe(item.url || "")}" alt="${safe(item.key || "imagen")}" loading="lazy">
          <span class="media-name">${safe(item.key || "")}</span>
          <div class="media-actions">
            <button type="button" class="media-icon-btn" data-action="rename" title="Renombrar" aria-label="Renombrar">&#9998;</button>
            <button type="button" class="media-icon-btn danger" data-action="delete" title="Eliminar" aria-label="Eliminar">X</button>
          </div>
        </div>
      `
      )
      .join("");
  };
  const loadMediaLibrary = async () => {
    setMediaStatus("Cargando imagenes...");
    const grid = q("media-grid");
    if (grid) grid.innerHTML = "";
    try {
      const params = new URLSearchParams();
      if (currentMediaPrefix) params.set("prefix", currentMediaPrefix);
      const url = params.toString() ? `/api/media?${params.toString()}` : "/api/media";
      const res = await apiFetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = data.error || "No se pudo cargar el repositorio";
        setMediaStatus(err);
        mediaCache = [];
        renderMediaGrid();
        return;
      }
      mediaCache = Array.isArray(data.items) ? data.items : [];
      if (typeof data.prefix === "string") {
        currentMediaPrefix = normalizePrefix(data.prefix);
      }
      const prefixInput = q("media-prefix");
      if (prefixInput) prefixInput.value = currentMediaPrefix;
      const prefixLabel = currentMediaPrefix ? `Carpeta: ${currentMediaPrefix}` : "Carpeta: raiz";
      setMediaStatus(mediaCache.length ? `${prefixLabel} · ${mediaCache.length} imagenes` : `${prefixLabel} · Sin imagenes`);
      renderMediaGrid();
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
    mediaTargetEditor = editor || null;
    mediaTargetInput = null;
    await openMediaModal();
  };
  const openMediaModalForInput = async (input) => {
    mediaTargetInput = input || null;
    mediaTargetEditor = null;
    await openMediaModal();
  };
  const closeMediaModal = () => {
    const modal = q("media-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    mediaTargetEditor = null;
    mediaTargetInput = null;
  };
  const normalizePrefix = (value) => {
    let prefix = (value || "").trim().replace(/^\/+/, "");
    if (prefix && !prefix.endsWith("/")) prefix += "/";
    return prefix;
  };
  const uploadMediaFile = async (file) => {
    if (!file) return;
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
        renderMediaGrid();
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

  const applyFontSize = (editor, sizePx) => {
    const size = Number.parseInt(sizePx, 10);
    if (!editor || !Number.isFinite(size) || size < 8 || size > 96) {
      alert("Tamano invalido. Usa un valor entre 8 y 96.");
      return;
    }
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      const endRange = document.createRange();
      endRange.selectNodeContents(editor);
      endRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(endRange);
      range = sel.getRangeAt(0);
    }
    if (range.collapsed) {
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      span.appendChild(document.createTextNode("\u200B"));
      range.insertNode(span);
      const textNode = span.firstChild;
      const newRange = document.createRange();
      newRange.setStart(textNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      newRange.collapse(false);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
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
    "kdbweb",
    "subs",
    "contacto",
    "legales",
  ]);
  const getSectionFromPath = () => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "admin") return "company";
    const section = parts[1] || "company";
    if (LEGAL_PAGE_SET.has(section)) {
      currentLegalPage = section;
      return "legales";
    }
    return adminSections.has(section) ? section : "company";
  };
  const buildAdminUrl = (section) => (section === "company" ? "/admin" : `/admin/${section}`);
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
          <div><label>Enlace primario</label><input type="text" data-field="primary_href" value="${val("primary_href")}" placeholder="${val("primary_href")}"></div>
          <div><label>Boton secundario</label><input type="text" data-field="secondary_label" value="${val("secondary_label")}" placeholder="${val("secondary_label")}"></div>
          <div><label>Enlace secundario</label><input type="text" data-field="secondary_href" value="${val("secondary_href")}" placeholder="${val("secondary_href")}"></div>
        </div>
        <label>Imagen (URL)</label>
        <div class="row media-input-row">
          <input type="text" data-field="image_url" value="${val("image_url")}" placeholder="${val("image_url")}">
          <button type="button" class="secondary small-btn media-picker-btn">Elegir</button>
        </div>
      </div>
    `;
  };

  const serviceCard = (svc = {}, idx = 0) => {
    const val = (field) => safe(svc[field]);
    const bullets = Array.isArray(svc.bullets) ? svc.bullets.join("\n") : "";
    return `
      <div class="card service-card-admin" draggable="true">
        <div class="row between">
          <span class="small"></span>
          <button type="button" class="danger small-btn" data-action="remove-service">Eliminar</button>
        </div>
        <label>Titulo</label><input type="text" data-field="title" value="${val("title")}" placeholder="${val("title")}">
        <label>Descripcion</label><textarea data-field="description" placeholder="${val("description")}">${val("description")}</textarea>
        <label>Bullets (uno por linea)</label><textarea data-field="bullets" placeholder="Linea 1\nLinea 2">${safe(bullets)}</textarea>
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
        <label>Imagen (URL)</label>
        <div class="row media-input-row">
          <input type="text" data-field="image_url" value="${val("image_url")}" placeholder="${val("image_url")}">
          <button type="button" class="secondary small-btn media-picker-btn">Elegir</button>
        </div>
        <label>LinkedIn</label><input type="text" data-field="linkedin" value="${val("linkedin")}" placeholder="${val("linkedin")}">
        <label>Mas info</label><input type="text" data-field="more_url" value="${val("more_url")}" placeholder="${val("more_url")}">
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
      return obj;
    });
  }

  function serializeServices() {
    return Array.from(document.querySelectorAll("#services-cards .service-card-admin")).map((card) => {
      const title = (card.querySelector('[data-field="title"]')?.value || "").trim();
      const description = (card.querySelector('[data-field="description"]')?.value || "").trim();
      const bulletsRaw = (card.querySelector('[data-field="bullets"]')?.value || "").split(/\r?\n/);
      const bullets = bulletsRaw.map((b) => b.trim()).filter(Boolean);
      return { title, description, bullets };
    });
  }

  async function loadCompany() {
    const res = await fetch("/config/company");
    const data = await res.json();
    setVal("c-name", data.name);
    setVal("c-tagline", data.tagline);
    setVal("c-phone", data.phone);
    setVal("c-email", data.email);
    setVal("c-address", data.address);
    setVal("c-linkedin", data.linkedin);
    setVal("c-facebook", data.facebook);
    setVal("c-instagram", data.instagram);
  }

  async function saveCompany() {
    const payload = {
      name: getVal("c-name"),
      tagline: getVal("c-tagline"),
      phone: getVal("c-phone"),
      email: getVal("c-email"),
      address: getVal("c-address"),
      linkedin: getVal("c-linkedin"),
      facebook: getVal("c-facebook"),
      instagram: getVal("c-instagram"),
    };
    const status = q("status-company");
    status.textContent = "Guardando...";
    const res = await fetch("/config/company", {
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
      const res = await fetch("/config/pages");
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
      const res = await fetch("/config/pages", {
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

  const getStoryHTML = () => {
    const editor = q("story-content-editor");
    return editor ? editor.innerHTML : getVal("story-paragraphs");
  };

  function readAboutForm() {
    const content = getAboutHTML();
    setVal("about-content", content);
    return {
      title: getVal("about-title"),
      content,
      image_url: getVal("about-image"),
      primary_label: getVal("about-primary-label"),
      primary_href: getVal("about-primary-href"),
      secondary_label: getVal("about-secondary-label"),
      secondary_href: getVal("about-secondary-href"),
    };
  }

  function readStoryForm() {
    const html = getStoryHTML();
    const editor = q("story-content-editor");
    const textSource = editor ? editor.textContent || "" : getVal("story-paragraphs") || "";
    const paragraphs = textSource
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setVal("story-paragraphs", paragraphs.join("\n"));
    return {
      title: getVal("story-title"),
      html,
      paragraphs,
    };
  }

  function setAboutForm(about = {}) {
    setVal("about-title", about.title || "");
    setVal("about-content", about.content || "");
    const editor = q("about-content-editor");
    if (editor) {
      editor.innerHTML = about.content || "";
      if (typeof linkEnsurers["about-content-editor"] === "function") {
        linkEnsurers["about-content-editor"](editor);
      }
    }
    setVal("about-image", about.image_url || "");
    setVal("about-primary-label", about.primary_label || "");
    setVal("about-primary-href", about.primary_href || "");
    setVal("about-secondary-label", about.secondary_label || "");
    setVal("about-secondary-href", about.secondary_href || "");
  }

  function setStoryForm(story = {}) {
    setVal("story-title", story.title || "");
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
      const res = await fetch("/config/page/" + page);
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
      const res = await fetch("/config/page/" + currentLegalPage, {
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
      const res = await fetch("/config/page/" + page);
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
    const aboutSectionEl = q("about-section");
    const servicesSection = q("services-section");
    const heroSection = q("page-hero-body")?.closest(".section-card");
    const isHome = page === "home";
    const isNosotros = page === "nosotros";
    const isServicios = page === "servicios";
    const isLegal = LEGAL_PAGE_SET.has(page);
    if (aboutSectionEl) aboutSectionEl.classList.toggle("hidden", !isHome);
    if (storySection) {
      storySection.classList.toggle("hidden", !(isNosotros || isLegal));
      const storyTitle = storySection.querySelector("h3");
      if (storyTitle) storyTitle.textContent = isLegal ? "Contenido" : "Historia";
    }
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
    }
  }

  async function savePage() {
    const isLegal = LEGAL_PAGE_SET.has(currentPage);
    const hero = isLegal ? [] : serializeCards("#hero-slides .hero-card");
    const team = currentPage === "home" || isLegal ? [] : serializeCards(".team-card-admin");
    const story = readStoryForm();
    const about = currentPage === "home" && !isLegal ? readAboutForm() : {};
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
    const res = await fetch("/config/page/" + currentPage, {
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
      const res = await fetch("/subscriptions");
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
    setVal("kdbweb-form-hero-image", entry.hero_image_url || "");
    const editor = q("kdbweb-content-editor");
    if (editor) {
      editor.innerHTML = entry.content_html || "";
      if (typeof linkEnsurers["kdbweb-content-editor"] === "function") {
        linkEnsurers["kdbweb-content-editor"](editor);
      }
      ensureResizableImages(editor);
    }
    kdbwebEditingSlug = entry.slug || null;
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
    entry.content_html = serializeEditorContent(q("kdbweb-content-editor"));
    renderKdbwebTree();
    if (!silent) setText("status-kdbweb-edit", "Cambios listos para guardar.");
  }

  async function loadKdbwebEntries() {
    const status = q("status-kdbweb-list");
    if (status) status.textContent = "Cargando subpaginas...";
    try {
      const res = await fetch("/api/kdbweb");
      if (!res.ok) throw new Error("kdbweb list");
      const list = await res.json();
      const details = await Promise.all(
        (list || []).map(async (entry) => {
          try {
            const detailRes = await fetch(`/api/kdbweb/${encodeURIComponent(entry.slug)}`);
            if (!detailRes.ok) throw new Error("detail");
            return await detailRes.json();
          } catch (err) {
            return { ...entry, content_html: "" };
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
      const res = await fetch("/api/kdbweb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: kdbwebEntries }),
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
      const res = await fetch("/config/page/kdbweb");
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
      const res = await fetch("/config/page/kdbweb", {
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

  async function loadPublicationsAdmin() {
    const status = q("status-publications");
    if (status) status.textContent = "Cargando publicaciones...";
    try {
      const [catsRes, pubsRes, heroRes] = await Promise.all([fetch("/api/categories"), fetch("/api/publications?all=1"), fetch("/config/page/publicaciones")]);
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

  // eventos de tabla de publicaciones
  document.addEventListener("click", (ev) => {
    const action = ev.target.dataset.action;
    if (!action) return;
    if (action === "pub-edit") {
      const id = Number(ev.target.dataset.id);
      const pub = pubsCache.find((p) => Number(p.id) === id);
      openPublicationForm(pub || {});
    }
    if (action === "pub-delete") {
      const id = Number(ev.target.dataset.id);
      if (!confirm("Eliminar publicación?")) return;
      fetch(`/api/publications/${id}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error("Error al eliminar");
          return loadPublicationsAdmin();
        })
        .catch((err) => {
          console.error("Error deleting publication", err);
          alert("Error al eliminar");
        });
    }
  });

  function openPublicationForm(pub) {
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
    if (contentEditor) {
      contentEditor.innerHTML = pub?.content_html || "";
      ensureResizableImages(contentEditor);
    }
    setValSafe("pub-form-content", pub?.content_html || "");
    setValSafe("pub-form-date", pub?.published_at || "");
    setValSafe("pub-form-author", pub?.author || "");
    setValSafe("pub-hero-image", pub?.hero_image_url || "");
    const catSel = q("pub-form-category");
    if (catSel) {
      catSel.innerHTML = categoriesCache.map((c) => `<option value="${c.id}">${safe(c.name)}</option>`).join("");
      catSel.value = pub?.category_id || "";
    }
    const activeSel = q("pub-form-active");
    if (activeSel) activeSel.value = pub?.active ? "1" : "0";
    // init rich editor for publication content
    setupRichEditor("pub-content-toolbar", "pub-content-editor");
    if (panel) panel.classList.remove("hidden");
    if (body) body.classList.remove("collapsed");
    if (collapseBtn) collapseBtn.textContent = "-";
  }

  function closePublicationForm() {
    currentPubEditing = null;
    q("pub-edit-panel")?.classList.add("hidden");
    q("pub-table-card")?.classList.remove("hidden");
    setText("status-pub-edit", "");
  }

  async function savePublicationForm() {
    const status = q("status-pub-edit");
    if (status) status.textContent = "Guardando...";
    const contentEditor = q("pub-content-editor");
    const content_html = contentEditor ? serializeEditorContent(contentEditor).trim() : q("pub-form-content")?.value.trim();
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
        const res = await fetch(`/api/publications/${currentPubEditing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Error al actualizar");
        }
      } else {
        const res = await fetch("/api/publications", {
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
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
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
      const res = await fetch("/config/page/publicaciones", {
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
    const res = await fetch(`/subscriptions/${id}`, { method: "DELETE" });
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
        const res = await fetch("/api/contact?limit=500");
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
            <button type="button" data-cmd="bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic"><em>I</em></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="styleTitle">Titulo</button>
            <button type="button" data-cmd="styleSubtitle">Subtitulo</button>
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
            <button type="button" data-cmd="insertUnorderedList">• Lista</button>
            <button type="button" data-cmd="insertOrderedList">1. Lista</button>
            <button type="button" data-cmd="createLink">Enlace</button>
            <button type="button" data-cmd="unlink">Quitar enlace</button>
            <button type="button" data-cmd="removeFormat">Limpiar</button>
          </div>
          <div id="excerpt-editor-${uid}" class="editor-surface" contenteditable="true" data-editor-field="excerpt">${post.excerpt || ''}</div>
        </div>

        <label>Contenido (HTML)</label>
        <div class="rich-editor pub-content-editor">
          <div class="editor-toolbar" id="content-toolbar-${uid}">
            <button type="button" data-cmd="bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic"><em>I</em></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="styleTitle">Titulo</button>
            <button type="button" data-cmd="styleSubtitle">Subtitulo</button>
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
            <button type="button" data-cmd="insertUnorderedList">• Lista</button>
            <button type="button" data-cmd="insertOrderedList">1. Lista</button>
            <button type="button" data-cmd="createLink">Enlace</button>
            <button type="button" data-cmd="unlink">Quitar enlace</button>
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
    q("kdbweb-section")?.classList.add("hidden");
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

  async function switchToKdbweb() {
    currentPage = null;
    currentSection = "kdbweb";
    setActive("kdbweb");
    hideAllSections();
    q("kdbweb-section").classList.remove("hidden");
    await loadKdbwebAdmin();
  }

  const applySection = async (section) => {
    if (LEGAL_PAGE_SET.has(section)) return switchToLegales(section);
    const normalized = adminSections.has(section) ? section : "company";
    if (normalized === "company") return switchToCompany();
    if (normalized === "subs") return switchToSubs();
    if (normalized === "contacto") return switchToContact();
    if (normalized === "publicaciones" || normalized === "publications") return switchToPublications();
    if (normalized === "kdbweb") return switchToKdbweb();
    if (normalized === "legales") return switchToLegales();
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
      if (cmd === "textAlignLeft" || cmd === "textAlignCenter" || cmd === "textAlignRight") {
        const map = {
          textAlignLeft: "justifyLeft",
          textAlignCenter: "justifyCenter",
          textAlignRight: "justifyRight",
        };
        const img = getSelectedOrAnchoredImage(editor);
        if (img) {
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
      const select = ev.target.closest("select[data-cmd]");
      if (!select) return;
      const cmd = select.dataset.cmd;
      if (cmd !== "fontSizePx") return;
      const size = select.value;
      if (!size) return;
      applyFontSize(editor, size);
      ensureLinkTargets();
      select.value = "";
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

  // Publicaciones: eventos del UI
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
      fetch(`/api/contact/${id}`, { method: "DELETE" })
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
      fetch(`/api/publications/${id}`, { method: 'DELETE' }).then(() => loadPublicationsAdmin()).catch(() => alert('Error al eliminar'));
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
      fetch(`/api/categories/${id}`, { method: 'DELETE' }).then(() => loadPublicationsAdmin());
      return;
    }
  });

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

    bind("save-company", saveCompany);
    bind("save-page-visibility", savePageVisibility);
    bind("save-page", savePage);
    bind("legal-save", saveLegalPage);
    bind("legal-save-bottom", saveLegalPage);
    bind("legal-cancel", () => loadLegalPage(currentLegalPage));
    setupRichEditor("about-toolbar", "about-content-editor");
    setupRichEditor("story-toolbar", "story-content-editor");
    setupRichEditor("kdbweb-content-toolbar", "kdbweb-content-editor");
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
      cont.insertAdjacentHTML("beforeend", serviceCard({}, cont.children.length));
    });
    bind("add-team", () => {
      const cont = q("team-cards");
      const m = { _uid: `member-${Date.now()}` };
      cont.insertAdjacentHTML("beforeend", teamCard(m, cont.children.length));
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
    bind("media-modal-close", closeMediaModal);
    bind("media-modal-backdrop", closeMediaModal);
    bind("media-refresh", () => loadMediaLibrary());
    bind("media-open-prefix", () => {
      const input = q("media-prefix");
      currentMediaPrefix = normalizePrefix(input?.value || "");
      if (input) input.value = currentMediaPrefix;
      loadMediaLibrary();
    });
    bind("media-clear-prefix", () => {
      const input = q("media-prefix");
      currentMediaPrefix = "";
      if (input) input.value = "";
      loadMediaLibrary();
    });
    bind("media-create-folder", () => {
      const name = prompt("Nombre de la carpeta:");
      if (!name) return;
      setMediaStatus("Creando carpeta...");
      apiFetch("/api/media/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_name: name, prefix: currentMediaPrefix }),
      })
        .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            setMediaStatus(data.error || "No se pudo crear la carpeta");
            return;
          }
          currentMediaPrefix = normalizePrefix(data.prefix || currentMediaPrefix);
          const input = q("media-prefix");
          if (input) input.value = currentMediaPrefix;
          setMediaStatus("Carpeta creada");
          loadMediaLibrary();
        })
        .catch(() => setMediaStatus("No se pudo crear la carpeta"));
    });
    bind("media-upload-btn", () => {
      const input = q("media-upload-input");
      const file = input?.files && input.files[0];
      if (!file) {
        setMediaStatus("Selecciona una imagen primero");
        return;
      }
      uploadMediaFile(file).then(() => {
        if (input) input.value = "";
      });
    });
    bind("media-insert-url", () => {
      const url = q("media-url-input")?.value.trim();
      if (!url) return;
      if (!mediaTargetEditor && !mediaTargetInput) {
        alert("No hay destino para la imagen.");
        return;
      }
      applyMediaSelection(url);
      closeMediaModal();
    });
    const mediaSearch = q("media-search");
    if (mediaSearch) mediaSearch.addEventListener("input", renderMediaGrid);
    const mediaGrid = q("media-grid");
    if (mediaGrid) {
      mediaGrid.addEventListener("click", (ev) => {
        const actionBtn = ev.target.closest("button[data-action]");
        if (actionBtn) {
          const action = actionBtn.dataset.action;
          const card = actionBtn.closest(".media-card");
          if (!card) return;
          const key = card.dataset.key || "";
          if (!key) return;
          if (action === "delete") {
            if (!confirm("¿Eliminar esta imagen del repositorio?")) return;
            setMediaStatus("Eliminando imagen...");
            apiFetch("/api/media/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key }),
            })
              .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
              .then(({ res, data }) => {
                if (!res.ok) {
                  setMediaStatus(data.error || "No se pudo eliminar la imagen");
                  return;
                }
                setMediaStatus("Imagen eliminada");
                loadMediaLibrary();
              })
              .catch(() => setMediaStatus("No se pudo eliminar la imagen"));
            return;
          }
          if (action === "rename") {
            const currentName = key.split("/").pop() || key;
            const newName = prompt("Nuevo nombre:", currentName);
            if (!newName) return;
            setMediaStatus("Renombrando imagen...");
            apiFetch("/api/media/rename", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key, new_name: newName }),
            })
              .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
              .then(({ res, data }) => {
                if (!res.ok) {
                  setMediaStatus(data.error || "No se pudo renombrar la imagen");
                  return;
                }
                setMediaStatus("Imagen renombrada");
                loadMediaLibrary();
              })
              .catch(() => setMediaStatus("No se pudo renombrar la imagen"));
            return;
          }
        }
        const card = ev.target.closest(".media-card");
        if (!card) return;
        const url = card.dataset.url || "";
        if (!mediaTargetEditor && !mediaTargetInput) {
          alert("No hay destino para la imagen.");
          return;
        }
        applyMediaSelection(url);
        closeMediaModal();
      });
    }
    if (!document.body.dataset.mediaPickerBound) {
      document.body.dataset.mediaPickerBound = "1";
      document.body.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".media-picker-btn");
        if (!btn) return;
        const row = btn.closest(".media-input-row") || btn.parentElement;
        const input = row?.querySelector("input");
        if (!input) return;
        openMediaModalForInput(input);
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

  document.addEventListener("DOMContentLoaded", init);
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

