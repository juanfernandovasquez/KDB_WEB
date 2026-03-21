(() => {
  const escapeHtmlLocal = (str) =>
    (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const fetchFallback = async () => {
    const base = window.API_BASE || "";
    const res = await fetch(`${base}/api/page/servicios`);
    if (!res.ok) throw new Error("No se pudo cargar servicios");
    return await res.json();
  };

  const setText = (el, txt) => {
    if (el && txt != null) el.textContent = txt;
  };

  const decodeHtmlValue = (value) => {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value || "";
    return textarea.value;
  };

  const normalizeRichText = (value) => {
    const decoded = decodeHtmlValue(value || "").trim();
    if (!decoded) return "";
    return /<[^>]+>/.test(decoded) ? decoded : `<p>${escapeHtmlLocal(decoded)}</p>`;
  };

  const buildDetailMarkup = (svc = {}) => {
    return `
      <div class="service-detail-content">
        ${
          svc.image_url
            ? `<figure class="service-detail-media"><img src="${escapeHtmlLocal(svc.image_url)}" alt="${escapeHtmlLocal(
                svc.title || "Servicio",
              )}"></figure>`
            : ""
        }
        <h3 class="service-detail-title">${escapeHtmlLocal(svc.title || "")}</h3>
        <div class="service-detail-description">${normalizeRichText(svc.description || "")}</div>
      </div>
    `;
  };

  const renderDetail = (panel, svc) => {
    if (!panel) return;
    const current = panel.querySelector(".service-detail-content");
    if (!current) {
      panel.innerHTML = buildDetailMarkup(svc);
      return;
    }

    current.classList.add("is-transitioning");
    window.setTimeout(() => {
      panel.innerHTML = buildDetailMarkup(svc);
    }, 180);
  };

  document.addEventListener("DOMContentLoaded", async () => {
    const page = document.body?.dataset?.page;
    if (page !== "servicios") return;

    const nav = document.getElementById("services-nav");
    const detailPanel = document.getElementById("service-detail-panel");
    const titleEl = document.getElementById("services-title-el");
    const subtitleEl = document.getElementById("services-subtitle-el");

    try {
      const data = window.apiClient?.getPage
        ? await window.apiClient.getPage("servicios")
        : await fetchFallback();
      const meta = data?.services_meta || {};
      const items = Array.isArray(data?.services) ? data.services : [];

      setText(titleEl, meta.title || "Servicios");
      setText(subtitleEl, meta.subtitle || "");

      if (!items.length) {
        if (nav) nav.innerHTML = "";
        if (detailPanel) {
          detailPanel.innerHTML = '<p class="service-detail-empty">No hay servicios configurados.</p>';
        }
        return;
      }

      let activeIndex = 0;

      const applyActiveState = (nextIndex) => {
        activeIndex = nextIndex;
        if (nav) {
          nav.querySelectorAll(".service-nav-item").forEach((button, idx) => {
            const isActive = idx === nextIndex;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
            button.setAttribute("tabindex", isActive ? "0" : "-1");
          });
        }
        renderDetail(detailPanel, items[nextIndex]);
      };

      if (nav) {
        nav.innerHTML = items
          .map(
            (svc, idx) => `
              <button
                type="button"
                class="service-nav-item${idx === 0 ? " is-active" : ""}"
                role="tab"
                aria-selected="${idx === 0 ? "true" : "false"}"
                tabindex="${idx === 0 ? "0" : "-1"}"
                data-service-index="${idx}"
              >
                ${
                  svc.icon_url
                    ? `<span class="service-nav-marker" aria-hidden="true"><img src="${escapeHtmlLocal(
                        svc.icon_url,
                      )}" alt=""></span>`
                    : `<span class="service-nav-marker" aria-hidden="true"><span class="service-nav-marker-fallback"></span></span>`
                }
                <span class="service-nav-copy">
                  <span class="service-nav-title">${escapeHtmlLocal(svc.title || "")}</span>
                </span>
              </button>
            `,
          )
          .join("");

        nav.addEventListener("click", (event) => {
          const button = event.target.closest(".service-nav-item");
          if (!button) return;
          const nextIndex = Number(button.dataset.serviceIndex || 0);
          if (Number.isNaN(nextIndex) || nextIndex === activeIndex) return;
          applyActiveState(nextIndex);
        });

        nav.addEventListener("keydown", (event) => {
          if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          let nextIndex = activeIndex;
          if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            nextIndex = (activeIndex + 1) % items.length;
          } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            nextIndex = (activeIndex - 1 + items.length) % items.length;
          } else if (event.key === "Home") {
            nextIndex = 0;
          } else if (event.key === "End") {
            nextIndex = items.length - 1;
          }
          applyActiveState(nextIndex);
          nav.querySelector(`.service-nav-item[data-service-index="${nextIndex}"]`)?.focus();
        });
      }

      renderDetail(detailPanel, items[0]);
    } catch (err) {
      console.error("Error cargando servicios", err);
      if (nav) nav.innerHTML = "";
      if (detailPanel) {
        detailPanel.innerHTML =
          '<p class="service-detail-empty">No se pudo cargar los servicios. Revisa la consola para mas detalles.</p>';
      }
    }
  });
})();
