/* Academia page — course catalog + dynamic page content */
(function () {
  const grid = document.getElementById('courses-grid');
  const loading = document.getElementById('courses-loading');
  const empty = document.getElementById('courses-empty');
  const filterBtns = document.querySelectorAll('#academia-filters .filter-btn');

  let allCourses = [];

  // SVG paths keyed by icon identifier (stored in services[].icon)
  var BENEFIT_ICONS = {
    docentes: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    reloj:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    escudo:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    monitor:  '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    archivo:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    chat:     '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    estrella: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    personas: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    check:    '<polyline points="20 6 9 17 4 12"/>',
    rayo:     '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  };

  function benefitSvg(iconKey) {
    var path = BENEFIT_ICONS[iconKey] || BENEFIT_ICONS.estrella;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + path + '</svg>';
  }

  async function loadPageContent() {
    var data = {};
    try {
      var res = await fetch(window.API_BASE + '/api/page/academia');
      if (res.ok) data = await res.json();
    } catch (_) {}

    var about = data.about || {};
    var story = data.story || {};
    var services = data.services || [];
    var servicesMeta = data.services_meta || {};

    // Hero kicker
    var kicEl = document.querySelector('.academia-hero-kicker');
    if (kicEl && about.primary_label) kicEl.textContent = about.primary_label;

    // Hero h1
    var h1El = document.querySelector('.academia-hero h1');
    if (h1El && about.title) h1El.textContent = about.title;

    // Hero description
    var descEl = document.querySelector('.academia-hero-desc');
    if (descEl && about.content) descEl.textContent = about.content;

    // Hero background image
    if (about.image_url) {
      var bgEl = document.querySelector('.academia-hero-bg');
      if (bgEl) bgEl.style.backgroundImage = 'url(' + about.image_url + ')';
    }

    // Stats — rendered dynamically
    var statsContainer = document.getElementById('academia-stats');
    if (statsContainer) {
      var stats = [];
      try { stats = JSON.parse(story.html || '[]'); } catch (_) {}
      statsContainer.innerHTML = stats.map(function (s, i) {
        var div = '<div class="academia-stat"><span class="stat-num">' + escHtml(s.num) + '</span><span class="stat-label">' + escHtml(s.label) + '</span></div>';
        return (i > 0 ? '<div class="academia-stat-div"></div>' : '') + div;
      }).join('');
    }

    // Benefits section title
    var benefTitleEl = document.querySelector('.academia-benefits h2');
    if (benefTitleEl && servicesMeta.title) benefTitleEl.textContent = servicesMeta.title;

    // Benefits — rendered dynamically
    var benefitsGrid = document.getElementById('benefits-grid');
    if (benefitsGrid && services.length) {
      benefitsGrid.innerHTML = services.map(function (s) {
        return '<div class="benefit-card">' +
          '<div class="benefit-icon">' + benefitSvg(s.icon) + '</div>' +
          '<h3>' + escHtml(s.title) + '</h3>' +
          '<p>' + escHtml(s.description) + '</p>' +
          '</div>';
      }).join('');
    }

    // CTA title
    var ctaTitleEl = document.querySelector('.academia-cta h2');
    if (ctaTitleEl && story.title) ctaTitleEl.textContent = story.title;

    // CTA description
    var ctaDescEl = document.querySelector('.academia-cta p');
    if (ctaDescEl && story.paragraphs) ctaDescEl.textContent = story.paragraphs;

    // CTA button
    if (about.secondary_label) {
      var btn = document.querySelector('.btn-cta-gold');
      if (btn) {
        btn.textContent = about.secondary_label;
        if (about.secondary_href) btn.href = about.secondary_href;
      }
    }
  }

  loadPageContent();

  function categoryLabel(cat) {
    var map = {
      tributario: 'Tributario',
      laboral: 'Laboral',
      corporativo: 'Corporativo',
      sunat: 'SUNAT',
    };
    return map[cat] || cat || 'General';
  }

  function renderCourses(courses) {
    grid.querySelectorAll('.course-card').forEach(function (c) { c.remove(); });

    if (!courses.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    courses.forEach(function (course) {
      var card = document.createElement('article');
      card.className = 'course-card';

      var img = course.image_url
        ? '<img src="' + escHtml(course.image_url) + '" alt="' + escHtml(course.title) + '" loading="lazy" />'
        : '<div style="background:var(--brand-blue);height:100%;"></div>';

      var originalPrice = course.original_price
        ? '<span class="price-original">S/ ' + Number(course.original_price).toFixed(0) + '</span>'
        : '';

      var duration = course.duration
        ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + escHtml(course.duration) + '</span>'
        : '';

      var level = course.level
        ? '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' + escHtml(course.level) + '</span>'
        : '';

      var desc = String(course.subtitle || course.description || '');
      card.innerHTML =
        '<div class="course-card-thumb">' + img +
          '<span class="course-card-category">' + escHtml(categoryLabel(course.category)) + '</span>' +
        '</div>' +
        '<div class="course-card-body">' +
          '<h3 class="course-card-title">' + escHtml(course.title) + '</h3>' +
          '<div class="course-card-meta">' + duration + level + '</div>' +
          '<p class="course-card-desc">' + escHtml(desc.slice(0, 120)) + (desc.length > 120 ? '…' : '') + '</p>' +
          '<div class="course-card-footer">' +
            '<div class="course-card-price">' +
              '<span class="price-currency">PEN</span>' +
              '<span class="price-amount">S/ ' + Number(course.price).toFixed(0) + '</span>' +
              originalPrice +
            '</div>' +
            '<div class="course-card-actions">' +
              '<a href="curso.html?slug=' + encodeURIComponent(course.slug) + '" class="btn-card-detail">Ver más</a>' +
              '<a href="pagar.html?slug=' + encodeURIComponent(course.slug) + '" class="btn-card-buy">Comprar</a>' +
            '</div>' +
          '</div>' +
        '</div>';

      grid.appendChild(card);
    });
  }

  function applyFilter(cat) {
    var filtered = cat ? allCourses.filter(function (c) { return c.category === cat; }) : allCourses;
    renderCourses(filtered);
  }

  async function loadCourses() {
    try {
      var resp = await fetch(window.API_BASE + '/api/courses');
      if (!resp.ok) throw new Error('api error');
      allCourses = await resp.json();
      loading.classList.add('hidden');
      renderCourses(allCourses);
    } catch (_) {
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent = 'No se pudieron cargar los cursos. Inténtalo de nuevo.';
    }
  }

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
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
