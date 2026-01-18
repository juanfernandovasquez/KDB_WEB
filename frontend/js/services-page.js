(() => {
  const escapeHtmlLocal = (str) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const fetchFallback = async () => {
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/page/servicios`);
    if (!res.ok) throw new Error('No se pudo cargar servicios');
    return await res.json();
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body?.dataset?.page;
    if (page !== 'servicios') return;

    const grid = document.getElementById('services-grid');
    const titleEl = document.getElementById('services-title-el');
    const subtitleEl = document.getElementById('services-subtitle-el');

    const setText = (el, txt) => {
      if (el && txt != null) el.textContent = txt;
    };

    try {
      const data = window.apiClient?.getPage ? await window.apiClient.getPage('servicios') : await fetchFallback();
      console.debug('[services] data fetched', data);
      const meta = data?.services_meta || {};
      const items = data?.services || [];
      setText(titleEl, meta.title || 'Servicios');
      setText(subtitleEl, meta.subtitle || '');
      try {
        if (Array.isArray(items) && grid) {
          // Validate first item as representative
          const first = items[0] || {};
          const { valid, errors } = await window.validateSchema('service_item', first);
          if (!valid) {
            console.warn('[validate] services validation failed, using fallback content', errors);
            if (grid) grid.innerHTML = '<p class="error">Contenido de servicios inválido. Intenta más tarde.</p>';
            return;
          }
          grid.innerHTML = '';
          items.forEach((svc) => {
            const bullets = Array.isArray(svc.bullets) ? svc.bullets : [];
            const card = document.createElement('article');
            card.className = 'service-card';
            card.setAttribute('tabindex', '0');
            card.innerHTML = `
              <h3>${escapeHtmlLocal(svc.title || '')}</h3>
              <p>${escapeHtmlLocal(svc.description || '')}</p>
              ${bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtmlLocal(b)}</li>`).join('')}</ul>` : ''}
            `;
            if (window.matchMedia('(max-width: 768px)').matches) {
              card.addEventListener('click', () => {
                card.classList.add('is-active');
                setTimeout(() => card.classList.remove('is-active'), 1200);
              });
            }
            grid.appendChild(card);
          });
        }
      } catch (e) {
        console.warn('[validate] error validating services', e);
      }
    } catch (err) {
      console.error('Error cargando servicios', err);
      if (grid) grid.innerHTML = '<p class="error">No se pudo cargar los servicios. Revisa la consola para más detalles.</p>';
    }
  });
})();
