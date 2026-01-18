(() => {
  const qs = new URLSearchParams(window.location.search);
  const slug = qs.get("slug");

  if (!slug) {
    document.addEventListener("DOMContentLoaded", () => {
      const content = document.getElementById("post-content");
      if (content) content.innerHTML = '<p class="error">No se especifico la publicacion.</p>';
    });
    return;
  }

  function setHero(data) {
    const imgEl = document.getElementById("post-hero-image");
    const titleEl = document.getElementById("post-hero-title");
    const kickerEl = document.getElementById("post-hero-kicker");
    const dateEl = document.getElementById("post-hero-date");
    const subtitleEl = document.getElementById("post-hero-subtitle");
    const track = document.querySelector("#post-hero .hero-track");
    const contentWrap = document.querySelector("#post-hero .hero-content");
    const dots = document.querySelector("#post-hero .hero-dots");
    const bg = data.hero_image_url || "";

    if (imgEl && bg) {
      imgEl.src = bg;
      imgEl.alt = data.title || "";
    }
    if (titleEl) titleEl.textContent = data.title || "";
    if (dateEl && data.published_at) {
      dateEl.textContent = new Date(`${data.published_at}T00:00:00Z`).toLocaleDateString("es-ES", {
        timeZone: "UTC",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (subtitleEl) subtitleEl.textContent = data.excerpt || "";
    if (kickerEl) kickerEl.textContent = data.category || "";
    if (track) track.style.setProperty("--hero-track-width", "100%");
    if (contentWrap) contentWrap.classList.add("animate");
    if (dots) dots.innerHTML = "";
  }

  function setContent(data) {
    const metaAuthor = document.getElementById("post-author");
    const authorLabel = document.querySelector(".post-author-label");
    const content = document.getElementById("post-content");
    if (metaAuthor && authorLabel) {
      if (data.author) {
        metaAuthor.textContent = data.author;
        authorLabel.style.display = "";
      } else {
        metaAuthor.textContent = "";
        authorLabel.style.display = "none";
      }
    }
    if (content) {
      content.innerHTML = data.content_html || "";
      normalizePostContent(content);
    }
    document.title = `${data.title || "Publicacion"} | KDB Legal & Tributario`;
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripHtml(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || "").trim();
  }

  function renderLatest(publications) {
    const section = document.getElementById("post-latest-section");
    const list = document.getElementById("post-latest-list");
    if (!section || !list) return;
    if (!publications.length) {
      section.style.display = "none";
      return;
    }
    list.innerHTML = "";
    publications.forEach((p) => {
      const catName = p.category ? (typeof p.category === "object" ? p.category.name : p.category) : "";
      const categoryHtml = catName ? `<span class="category-badge">${escapeHtml(catName)}</span>` : "";
      const date = p.published_at
        ? new Date(`${p.published_at}T00:00:00Z`).toLocaleDateString("es-ES", {
            timeZone: "UTC",
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      const snippet = stripHtml(p.content_html || p.excerpt || "");
      const snippetText = snippet.slice(0, 160) + (snippet.length > 160 ? " ..." : "");
      const card = `
        <article class="publication-card" tabindex="0">
          <div class="pub-thumb">
            ${categoryHtml}
            <img src="${escapeHtml(p.hero_image_url || "")}" alt="${escapeHtml(p.title || "")}">
          </div>
          <div class="pub-body">
            <div class="meta"><span class="date">${escapeHtml(date)}</span></div>
            <h3 class="pub-title"><a href="publicacion.html?slug=${encodeURIComponent(p.slug || "")}">${escapeHtml(p.title)}</a></h3>
            ${snippetText ? `<p class="pub-snippet">${escapeHtml(snippetText)}</p>` : ""}
          </div>
        </article>
      `;
      list.insertAdjacentHTML("beforeend", card);
    });
    list.querySelectorAll(".publication-card").forEach((card) => {
      if (!window.matchMedia("(max-width: 768px)").matches) return;
      card.addEventListener("click", () => {
        card.classList.add("is-active");
        setTimeout(() => card.classList.remove("is-active"), 1200);
      });
    });
  }

  async function loadLatest(currentSlug) {
    try {
      const base = window.API_BASE || "";
      const res = await fetch(`${base}/api/publications`);
      if (!res.ok) throw new Error("No encontrado");
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.publications || [];
      const filtered = (list || []).filter((p) => p.slug && p.slug !== currentSlug);
      filtered.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
      renderLatest(filtered.slice(0, 3));
    } catch (_) {
      renderLatest([]);
    }
  }

  function normalizePostContent(root) {
    if (!root) return;
    root.querySelectorAll(".img-delete").forEach((n) => n.remove());
    root.querySelectorAll(".img-resizable").forEach((wrap) => {
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
      wrap.replaceWith(img);
    });
    root.querySelectorAll("img").forEach((img) => {
      if (img.classList.contains("img-wrap-square")) {
        img.classList.remove("img-align-center");
      }
      if (img.dataset.imgWidth && !img.style.width) img.style.width = img.dataset.imgWidth;
      if (img.dataset.imgHeight && !img.style.height) img.style.height = img.dataset.imgHeight;
    });
  }

  async function loadPost() {
    try {
      const base = window.API_BASE || "";
      const res = await fetch(`${base}/api/publications/slug/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("No encontrado");
      const data = await res.json();
      setHero(data);
      setContent(data);
      loadLatest(slug);
    } catch (err) {
      const content = document.getElementById("post-content");
      if (content) content.innerHTML = '<p class="error">No se pudo cargar la publicacion.</p>';
    }
  }

  document.addEventListener("DOMContentLoaded", loadPost);
})();
