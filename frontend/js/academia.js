/* Academia page — course catalog */
(function () {
  const grid = document.getElementById('courses-grid');
  const loading = document.getElementById('courses-loading');
  const empty = document.getElementById('courses-empty');
  const filterBtns = document.querySelectorAll('#academia-filters .filter-btn');

  let allCourses = [];

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
