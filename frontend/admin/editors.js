import { q } from "./utils.js";

let imagePickerEl = null;
let selectedImage = null;
let draggingEditorImage = false;
let dragFallbackNode = null;
let dragFallbackParent = null;
let dragFallbackNext = null;
let currentDragEditor = null;

const getBlockContainerAtPoint = (editor, ev) => {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!el || !editor.contains(el)) return null;
  return el.closest("div, p, li, blockquote, h1, h2, h3, h4, h5, h6");
};

const placeNodeAtPoint = (editor, ev, node) => {
  if (!editor || !node) return;
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
  if (range && node.contains(range.startContainer)) return;
  if (range && range.startContainer === editor) {
    const block = getBlockContainerAtPoint(editor, ev);
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
    console.warn("placeNodeAtPoint fallback", err);
  }
  editor.appendChild(node);
};

const restoreIfOutsideEditor = (editor, node, originParent, originNext) => {
  if (!editor || !node) return false;
  if (editor.contains(node)) return true;
  if (originParent) originParent.insertBefore(node, originNext);
  return false;
};

const safe = (str) => {
  const s = str == null ? "" : String(str);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

export const makeResizable = (img) => {
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
  if (!img.style.width && !savedW) {
    img.style.width = "100%";
    wrapper.style.width = "100%";
  }
  img.style.height = img.style.height || "auto";

  ["mouseup", "mouseleave", "touchend"].forEach((evt) => {
    wrapper.addEventListener(evt, syncSizeToImg);
  });
  syncSizeToImg();
  return wrapper;
};

const getSelectedOrAnchoredImage = (editor) => {
  if (selectedImage && editor.contains(selectedImage)) return selectedImage;
  const sel = document.getSelection();
  const node = sel?.anchorNode ? sel.anchorNode.parentElement : null;
  const wrap = node?.closest?.(".img-resizable");
  if (wrap && editor.contains(wrap)) return wrap.querySelector("img");
  const img = node?.closest?.("img");
  if (img && editor.contains(img)) return img;
  return null;
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

const requireImage = (editor) => {
  const img = getSelectedOrAnchoredImage(editor);
  if (!img) {
    alert("Selecciona una imagen para esta acción.");
    return null;
  }
  return img;
};

const ensureResizableImages = (editor) => {
  if (!editor) return;
  editor.querySelectorAll("img").forEach((img) => makeResizable(img));
};

const enableImageDrag = (editor) => {
  if (!editor) return;
  let dragged = null;
  let dragGhost = null;
  let dragOriginParent = null;
  let dragOriginNext = null;

  editor.addEventListener("dragstart", (ev) => {
    const wrap = ev.target.closest(".img-resizable");
    if (!wrap) return;
    dragged = wrap;
    currentDragEditor = editor;
    dragOriginParent = wrap.parentNode;
    dragOriginNext = wrap.nextSibling;
    dragFallbackNode = wrap;
    dragFallbackParent = dragOriginParent;
    dragFallbackNext = dragOriginNext;
    draggingEditorImage = true;
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", "img-drag");
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
    const targetEditor = ev.target.closest?.(".editor-surface");
    if (targetEditor !== editor) return;
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
    const targetEditor = ev.target.closest?.(".editor-surface");
    if (targetEditor !== editor) {
      if (dragOriginParent) dragOriginParent.insertBefore(dragged, dragOriginNext);
      dragged = null;
      draggingEditorImage = false;
      dragFallbackNode = null;
      dragFallbackParent = null;
      dragFallbackNext = null;
      currentDragEditor = null;
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
      placeNodeAtPoint(editor, ev, dragged);
    }
    restoreIfOutsideEditor(editor, dragged, dragOriginParent, dragOriginNext);
    dragged = null;
    draggingEditorImage = false;
    dragOriginParent = null;
    dragOriginNext = null;
    dragFallbackNode = null;
    dragFallbackParent = null;
    dragFallbackNext = null;
    currentDragEditor = null;
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
  });

  editor.addEventListener("dragend", () => {
    if (dragged) restoreIfOutsideEditor(editor, dragged, dragOriginParent, dragOriginNext);
    dragged = null;
    draggingEditorImage = false;
    dragOriginParent = null;
    dragOriginNext = null;
    dragFallbackNode = null;
    dragFallbackParent = null;
    dragFallbackNext = null;
    currentDragEditor = null;
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
    editor.querySelectorAll(".img-resizable.drag-over").forEach((w) => w.classList.remove("drag-over"));
  });
};

["dragover", "drop"].forEach((evtName) => {
  document.addEventListener(
    evtName,
    (ev) => {
      if (!draggingEditorImage) return;
      const targetEditor = ev.target?.closest?.(".editor-surface");
      const inSameEditor = currentDragEditor && targetEditor === currentDragEditor;
      if (!inSameEditor) {
        ev.preventDefault();
        ev.stopPropagation();
        if (evtName === "drop" && dragFallbackNode && dragFallbackParent) {
          dragFallbackParent.insertBefore(dragFallbackNode, dragFallbackNext);
          dragFallbackNode = null;
          dragFallbackParent = null;
          dragFallbackNext = null;
          draggingEditorImage = false;
          currentDragEditor = null;
        }
        return;
      }
      // Allow drop inside the same editor to proceed to the editor handler.
    },
    true
  );
});

// Global drop: always block default insertion; place inside editor or revert.
document.addEventListener(
  "drop",
  (ev) => {
    if (!draggingEditorImage) return;
    ev.preventDefault();
    ev.stopPropagation();
    const targetEditor = ev.target?.closest?.(".editor-surface");
    if (currentDragEditor && targetEditor === currentDragEditor && dragFallbackNode) {
      // Place inside the editor at the drop point.
      if (dragFallbackNode.parentNode) dragFallbackNode.parentNode.removeChild(dragFallbackNode);
      placeNodeAtPoint(currentDragEditor, ev, dragFallbackNode);
    } else if (dragFallbackNode && dragFallbackParent) {
      dragFallbackParent.insertBefore(dragFallbackNode, dragFallbackNext);
    }
    dragFallbackNode = null;
    dragFallbackParent = null;
    dragFallbackNext = null;
    draggingEditorImage = false;
    currentDragEditor = null;
  },
  true
);

document.addEventListener(
  "dragover",
  (ev) => {
    if (!draggingEditorImage) return;
    ev.preventDefault();
    ev.stopPropagation();
  },
  true
);

const ensureLinkTargets = (editor) => {
  editor.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
};

export function serializeEditorContent(editor) {
  if (!editor) return "";
  const clone = editor.cloneNode(true);
  clone.querySelectorAll(".img-resizable").forEach((wrap) => {
    const img = wrap.querySelector("img");
    if (!img) {
      wrap.remove();
      return;
    }
    ["img-wrap-square", "img-wrap-block", "img-align-left", "img-align-center", "img-align-right"].forEach((cls) => {
      if (wrap.classList.contains(cls)) img.classList.add(cls);
    });
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
    img.removeAttribute("draggable");
    img.classList.remove("img-selected");
    const del = wrap.querySelector(".img-delete");
    if (del) del.remove();
    wrap.replaceWith(img);
  });
  clone.querySelectorAll(".img-delete").forEach((n) => n.remove());
  return clone.innerHTML;
}

export function setupRichEditor(toolbarId, editorId) {
  const toolbar = q(toolbarId);
  const editor = q(editorId);
  if (!toolbar || !editor) return;
  if (toolbar.dataset.bound === "1") return;
  toolbar.dataset.bound = "1";

  if (!imagePickerEl) {
    imagePickerEl = document.createElement("input");
    imagePickerEl.type = "file";
    imagePickerEl.accept = "image/*";
    imagePickerEl.style.display = "none";
    document.body.appendChild(imagePickerEl);
  }

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
      ensureLinkTargets(editor);
      editor.focus();
      return;
    }

    if (cmd === "insertImage") {
      const url = prompt("Pega la URL de la imagen (http/https):", "https://");
      const cleanUrl = (url || "").trim();
      if (!cleanUrl) return;
      const lowerUrl = cleanUrl.toLowerCase();
      const isHttp = lowerUrl.startsWith("http://") || lowerUrl.startsWith("https://");
      if (!isHttp) {
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
      if (lastImg) selectedImage = lastImg;
      editor.focus();
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

    if (cmd === "alignLeft" || cmd === "alignCenter" || cmd === "alignRight") {
      const img = requireImage(editor);
      if (!img) return;
      const target = makeResizable(img);
      img.classList.remove("img-align-left", "img-align-center", "img-align-right");
      target.classList.remove("img-align-left", "img-align-center", "img-align-right");
      if (cmd === "alignLeft") {
        img.classList.add("img-align-left");
        target.classList.add("img-align-left");
      }
      if (cmd === "alignCenter") {
        img.classList.add("img-align-center");
        target.classList.add("img-align-center");
      }
      if (cmd === "alignRight") {
        img.classList.add("img-align-right");
        target.classList.add("img-align-right");
      }
      document.execCommand("justify" + cmd.replace("align", ""), false, null);
      editor.focus();
      return;
    }

    if (cmd === "unlink") {
      document.execCommand("unlink", false, null);
      editor.focus();
      ensureLinkTargets(editor);
      return;
    }

    if (cmd === "removeFormat") {
      document.execCommand(cmd, false, null);
      editor.focus();
      ensureLinkTargets(editor);
      return;
    }

    document.execCommand(cmd, false, null);
    editor.focus();
    ensureLinkTargets(editor);
  });

  editor.addEventListener("input", () => {
    ensureLinkTargets(editor);
    ensureResizableImages(editor);
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
      selectedImage = picked;
      const pickedWrap = picked.closest(".img-resizable");
      editor.querySelectorAll(".img-resizable.img-selected").forEach((w) => w.classList.remove("img-selected"));
      if (pickedWrap) pickedWrap.classList.add("img-selected");
    } else {
      selectedImage = null;
    }
  });
  editor.addEventListener("mousedown", (ev) => {
    const img = ev.target.closest("img") || ev.target.closest(".img-resizable")?.querySelector("img");
    if (!img) return;
    const wrap = img.closest(".img-resizable");
    if (wrap) {
      selectedImage = img;
      editor.querySelectorAll(".img-resizable.img-selected").forEach((w) => w.classList.remove("img-selected"));
      wrap.classList.add("img-selected");
      const range = document.createRange();
      range.selectNode(wrap);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  enableImageDrag(editor);
}
