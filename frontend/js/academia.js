/* Academia page — course catalog + dynamic page content */
(function () {
  const grid = document.getElementById('courses-grid');
  const loading = document.getElementById('courses-loading');
  const empty = document.getElementById('courses-empty');
  const filterBtns = document.querySelectorAll('#academia-filters .filter-btn');

  let allCourses = [];

  async function loadPageContent() {
    let data = {};
    try {
      const res = await fetch(`${window.API_BASE}/api/page/academia`);
      if (res.ok) data = await res.json();
    } catch (_) {}

    const about = data.about || {};
    const story = data.story || {};
    const services = data.services || [];
    const servicesMeta = data.services_meta || {};

    // Hero kicker
    const kicEl = document.querySelector('.academia-hero-kicker');
    if (kicEl && about.primary_label) kicEl.textContent = about.primary_label;

    // Hero h1
    const h1El = document.querySelector('.academia-hero h1');
    if (h1El && about.title) h1El.textContent = about.title;

    // Hero description
    const descEl = document.querySelector('.academia-hero-desc');
    if (descEl && about.content) descEl.textContent = about.content;

    // Stats
    let stats = [];
    try { stats = JSON.parse(story.content_html || '[]'); } catch (_) {}
    if (stats.length === 4) {
      document.querySelectorAll('.academia-stat').forEach(function (el, i) {
        const numEl = el.querySelector('.stat-num');
        const lblEl = el.querySelector('.stat-label');
        if (numEl && stats[i].num)   numEl.textContent = stats[i].num;
        if (lblEl && stats[i].label) lblEl.textContent = stats[i].label;
      });
    }

    // Benefits section title
    const benefTitleEl = document.querySelector('.academia-benefits h2');
    if (benefTitleEl && servicesMeta.title) benefTitleEl.textContent = servicesMeta.title;

    // Benefit cards
    if (services.length) {
      document.querySelectorAll('.benefit-card').forEach(function (card, i) {
        if (!services[i]) return;
        const h3 = card.querySelector('h3');
        const p  = card.querySelector('p');
        if (h3 && services[i].title)       h3.textContent = services[i].title;
        if (p  && services[i].description) p.textContent  = services[i].description;
      });
    }

    // CTA title
    const ctaTitleEl = document.querySelector('.academia-cta h2');
    if (ctaTitleEl && story.title) ctaTitleEl.textContent = story.title;

    // CTA description
    const ctaDescEl = document.querySelector('.academia-cta p');
    if (ctaDescEl && story.paragraphs) ctaDescEl.textContent = story.paragraphs;

    // CTA button
    if (about.secondary_label) {
      const btn = document.querySelector('.btn-cta-gold');
      if (btn) {
        btn.textContent = about.secondary_label;
        if (about.secondary_href) btn.href = about.secondary_href;
      }
    }
  }

  loadPageContent();

  function categoryLabel(cat) {
    const map = {
      tributario: 'Tributario',
      laboral: 'Laboral',
      corporativo: 'Corporativo',
      sunat: 'SUNAT',
    };
    return map[cat] || cat || 'General';
  }

  function renderCourses(courses) {
    // Remove existing cards (keep loading + empty nodes)
    grid.querySelectorAll('.course-card').forEach((c) => c.remove());

    if (!courses.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    courses.forEach((course) => {
      const card = document.createElement('article');
      card.className = 'course-card';

      const img = course.image_url
        ? `<img src="${escHtml(course.image_url)}" alt="${escHtml(course.title)}" loading="lazy" />`
        : `<div style="background:var(--brand-blue);height:100%;"></div>`;

      const originalPrice = course.original_price
        ? `<span class="price-original">S/ ${Number(course.original_price).toFixed(0)}</span>`
        : '';

      const duration = course.duration
        ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escHtml(course.duration)}</span>`
        : '';

      const level = course.level
        ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${escHtml(course.level)}</span>`
        : '';

      card.innerHTML = `
        <div class="course-card-thumb">
          ${img}
          <span class="course-card-category">${escHtml(categoryLabel(course.category))}</span>
        </div>
        <div class="course-card-body">
          <h3 class="course-card-title">${escHtml(course.title)}</h3>
          <div class="course-card-meta">${duration}${level}</div>
          <p class="course-card-desc">${escHtml((course.subtitle || course.description || '').slice(0, 120))}${(course.subtitle || course.description || '').length > 120 ? '…' : ''}</p>
          <div class="course-card-footer">
            <div class="course-card-price">
              <span class="price-currency">PEN</span>
              <span class="price-amount">S/ ${Number(course.price).toFixed(0)}</span>
              ${originalPrice}
            </div>
            <div class="course-card-actions">
              <a href="curso.html?slug=${encodeURIComponent(course.slug)}" class="btn-card-detail">Ver más</a>
              <a href="pagar.html?slug=${encodeURIComponent(course.slug)}" class="btn-card-buy">Comprar</a>
            </div>
          </div>
        </div>`;

      grid.appendChild(card);
    });
  }

  function applyFilter(cat) {
    const filtered = cat ? allCourses.filter((c) => c.category === cat) : allCourses;
    renderCourses(filtered);
  }

  async function loadCourses() {
    try {
      const resp = await fetch(`${window.API_BASE}/api/courses`);
      if (!resp.ok) throw new Error('api error');
      allCourses = await resp.json();
      loading.classList.add('hidden');
      renderCourses(allCourses);
    } catch {
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent = 'No se pudieron cargar los cursos. Intenta de nuevo.';
    }
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilter(btn.dataset.cat);
    });
  });

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  loadCourses();
})();
