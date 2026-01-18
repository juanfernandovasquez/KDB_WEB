document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body?.dataset?.page;
  if (page !== 'publicaciones') return;

  const list = document.getElementById('publications-list');
  const categorySelect = document.getElementById('publications-category');
  const getPageVisibility = async () => {
    if (window.pageVisibility) return window.pageVisibility;
    try {
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/pages`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.pages || null;
    } catch (_) {
      return null;
    }
  };

  const escapeHtml = (str) => (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const CHUNK_SIZE = 6;
  let ALL_PUBLICATIONS = [];
  let CURRENT_CATEGORY = '';
  let CURRENT_LIST = [];
  let loadMoreBtn = null;

  function updateLoadMoreVisibility(row, items) {
    if (!loadMoreBtn) return;
    if (!row || !items) {
      loadMoreBtn.hidden = true;
      return;
    }
    const loaded = Number(row.dataset.loaded || 0);
    loadMoreBtn.hidden = loaded >= items.length;
  }

  function appendChunk(row, items, chunkSize) {
    if (!row) return;
    const loaded = Number(row.dataset.loaded || 0);
    if (loaded >= items.length) return;
    const nextItems = items.slice(loaded, loaded + chunkSize);
    nextItems.forEach((p) => {
      const catName = p.category ? (typeof p.category === 'object' ? p.category.name : p.category) : '';
      const categoryHtml = catName ? `<span class="category-badge">${escapeHtml(catName)}</span>` : '';
      const date = p.published_at ? new Date(`${p.published_at}T00:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const snippet = (() => {
        if (p.content_html) {
          const tmp = document.createElement('div');
          tmp.innerHTML = p.content_html;
          const text = (tmp.textContent || '').trim();
          return text.slice(0, 160) + (text.length > 160 ? ' ...' : '');
        }
        return '';
      })();
      const card = `
        <article class="publication-card" tabindex="0">
          <div class="pub-thumb">
            ${categoryHtml}
            <img src="${escapeHtml(p.hero_image_url || '')}" alt="${escapeHtml(p.title || '')}">
          </div>
          <div class="pub-body">
            <div class="meta"><span class="date">${escapeHtml(date)}</span></div>
            <h3 class="pub-title"><a href="publicacion.html?slug=${encodeURIComponent(p.slug || '')}">${escapeHtml(p.title)}</a></h3>
            ${snippet ? `<p class="pub-snippet">${escapeHtml(snippet)}</p>` : ''}
          </div>
        </article>
      `;
      row.insertAdjacentHTML('beforeend', card);
    });
    row.querySelectorAll('.publication-card').forEach((card) => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      card.addEventListener('click', () => {
        card.classList.add('is-active');
        setTimeout(() => card.classList.remove('is-active'), 1200);
      });
    });
    row.dataset.loaded = String(loaded + nextItems.length);
    updateLoadMoreVisibility(row, items);
  }

  function renderPublicationsList(items) {
    list.innerHTML = '';
    CURRENT_LIST = items.slice();
    if (!items || items.length === 0) {
      list.innerHTML = '<p class="error">No hay publicaciones que mostrar.</p>';
      updateLoadMoreVisibility(null, null);
      return;
    }
    const row = document.createElement('div');
    row.className = 'publication-row vertical';
    row.id = 'pub-row-all';
    row.dataset.loaded = "0";
    list.appendChild(row);
    appendChunk(row, items, CHUNK_SIZE);
  }

  function applyFilters() {
    let filtered = ALL_PUBLICATIONS.slice();
    if (CURRENT_CATEGORY) {
      filtered = filtered.filter((p) => {
        const cid = p.category_id != null ? String(p.category_id) : '';
        const cname = p.category ? (typeof p.category === 'object' ? p.category.name : p.category) : '';
        return cid === CURRENT_CATEGORY || cname === CURRENT_CATEGORY;
      });
    }
    filtered.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
    renderPublicationsList(filtered);
  }

  async function loadAll() {
    try {
      const visibility = await getPageVisibility();
      if (visibility && visibility.publicaciones === false) {
        if (list) list.innerHTML = '';
        return;
      }
      const [catsRes, pubsRes] = await Promise.all([
        fetch(`${window.API_BASE || ''}/api/categories`),
        fetch(`${window.API_BASE || ''}/api/publications`),
      ]);

      if (!catsRes.ok || !pubsRes.ok) throw new Error('Error fetching data');

      const cats = await catsRes.json();
      const pubsData = await pubsRes.json();
      const pubs = Array.isArray(pubsData) ? pubsData : pubsData.publications || [];

      ALL_PUBLICATIONS = pubs;

      categorySelect.innerHTML = '<option value="">Todas</option>' + (Array.isArray(cats) ? cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') : '');

      const chipsWrap = document.getElementById('publications-category-chips');
      if (chipsWrap && Array.isArray(cats)) {
        chipsWrap.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = 'category-chip active';
        allBtn.dataset.id = '';
        allBtn.textContent = 'Todas';
        allBtn.addEventListener('click', () => {
          CURRENT_CATEGORY = '';
          categorySelect.value = '';
          document.querySelectorAll('.category-chip').forEach((b) => b.classList.remove('active'));
          allBtn.classList.add('active');
          applyFilters();
        });
        chipsWrap.appendChild(allBtn);

        cats.forEach((c) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'category-chip';
          btn.dataset.id = c.id;
          btn.textContent = c.name;
          btn.addEventListener('click', () => {
            CURRENT_CATEGORY = String(c.id);
            categorySelect.value = String(c.id);
            document.querySelectorAll('.category-chip').forEach((b) => b.classList.toggle('active', b === btn));
            applyFilters();
          });
          chipsWrap.appendChild(btn);
        });

        chipsWrap.setAttribute('aria-label', 'Categorías');
        chipsWrap.tabIndex = 0;
      }

      applyFilters();
    } catch (err) {
      console.error('Error cargando publicaciones/filtros', err);
      list.innerHTML = '<p class="error">Error al cargar publicaciones o filtros. Revisa la consola.</p>';
    }
  }

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action="scroll-left"], [data-action="scroll-right"]');
    if (!btn) return;
    const targetId = btn.dataset.target;
    const row = document.getElementById(targetId);
    if (!row) return;
    const dir = btn.dataset.action === 'scroll-left' ? -1 : 1;
    if (window.innerWidth <= 640) {
      // En móvil usamos scroll vertical: no hacemos nada con las flechas
      return;
    }
    if (dir > 0) {
      const remaining = row.scrollWidth - (row.scrollLeft + row.clientWidth);
      if (remaining < 120) appendChunk(targetId, CHUNK_SIZE);
    }
    const delta = row.clientWidth * 0.8 * dir;
    row.scrollBy({ left: delta, behavior: 'smooth' });
  });

  loadMoreBtn = document.getElementById('load-more-pubs');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const row = document.getElementById('pub-row-all');
      if (!row) return;
      appendChunk(row, CURRENT_LIST, CHUNK_SIZE);
    });
  }

  loadAll();
});


