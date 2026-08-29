/* Academia page — course catalog + dynamic page content */
(function () {
  const grid = document.getElementById('courses-grid');
  const loading = document.getElementById('courses-loading');
  const empty = document.getElementById('courses-empty');
  const filtersContainer = document.getElementById('academia-filters');

  let allCourses = [];
  var _catMap = {};

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
    var path = BENEFIT_ICONS[iconKey] || BENEFIT_ICONS[iconKey && iconKey.split('/').pop()] || BENEFIT_ICONS.estrella;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' + path + '</svg>';
  }

  function statNumHtml(num) {
    var s = String(num || '');
    var m = s.match(/^(\d[\d,\.]*)([+%].*)$/);
    if (m) return m[1] + '<span class="stat-suffix">' + m[2] + '</span>';
    return s;
  }

  function parseAcJson(htmlStr) {
    try {
      var parsed = JSON.parse(htmlStr || '{}');
      if (Array.isArray(parsed)) return { stats: parsed };
      return parsed || {};
    } catch (_) { return {}; }
  }

  function benefitIconHtml(iconKey) {
    if (!iconKey) return benefitSvg('estrella');
    if (iconKey.startsWith('http') || iconKey.startsWith('/')) {
      return '<img src="' + escHtml(iconKey) + '" alt="" style="width:100%;height:100%;object-fit:contain;" />';
    }
    return benefitSvg(iconKey);
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

    var ac = parseAcJson(story.html);

    // ── Hero ──
    var kicEl = document.querySelector('.academia-hero-kicker');
    if (kicEl && about.primary_label) kicEl.textContent = about.primary_label;

    var h1El = document.querySelector('.academia-hero h1');
    if (h1El && about.title) h1El.textContent = about.title;

    var descEl = document.querySelector('.academia-hero-desc');
    if (descEl && about.content) descEl.textContent = about.content;

    if (about.image_url) {
      var photoEl = document.querySelector('.academia-hero-photo');
      if (photoEl) photoEl.src = about.image_url;
    }

    // Hero buttons
    var btn1 = ac.hero_btn1 || {};
    var btn2 = ac.hero_btn2 || {};
    var heroBtn1 = document.querySelector('.ac-btn-primary[href="#cursos"]');
    if (heroBtn1 && btn1.label) { heroBtn1.textContent = btn1.label; if (btn1.href) heroBtn1.href = btn1.href; }
    var heroBtn2 = document.querySelector('.ac-btn-secondary-hero');
    if (heroBtn2 && btn2.label) { heroBtn2.textContent = btn2.label; if (btn2.href) heroBtn2.href = btn2.href; }

    // ── Stats ──
    var statsContainer = document.getElementById('academia-stats');
    if (statsContainer) {
      var stats = ac.stats || [];
      statsContainer.innerHTML = stats.filter(function (s) { return s.num || s.label; }).map(function (s, i) {
        var div = '<div class="academia-stat"><span class="stat-num">' + statNumHtml(s.num) + '</span><span class="stat-label">' + escHtml(s.label) + '</span></div>';
        return (i > 0 ? '<div class="academia-stat-div"></div>' : '') + div;
      }).join('');
    }

    // ── Intro section ──
    var intro = ac.intro || {};
    if (intro.section_label) {
      var introLabelEl = document.querySelector('.ac-intro-text .ac-section-label');
      if (introLabelEl) introLabelEl.textContent = intro.section_label;
    }
    if (intro.title) {
      var introH2El = document.querySelector('.ac-intro-text h2');
      if (introH2El) introH2El.textContent = intro.title;
    }
    if (intro.text) {
      var introParaEl = document.querySelector('.ac-intro-text > p');
      if (introParaEl) introParaEl.textContent = intro.text;
    }
    if (intro.image_url) {
      var introImgEl = document.querySelector('.ac-intro-image img');
      if (introImgEl) introImgEl.src = intro.image_url;
    }
    if (intro.bullets && intro.bullets.length) {
      var bulletsList = document.querySelector('.ac-intro-bullets');
      if (bulletsList) {
        bulletsList.innerHTML = intro.bullets.map(function (b) {
          return '<li>' + escHtml(b) + '</li>';
        }).join('');
      }
    }
    if (intro.btn_label) {
      var introBtnEl = document.querySelector('.ac-intro-text .ac-btn-primary');
      if (introBtnEl) { introBtnEl.textContent = intro.btn_label; if (intro.btn_href) introBtnEl.href = intro.btn_href; }
    }

    // ── Benefits ──
    var benefTitleEl = document.querySelector('.academia-benefits h2');
    if (benefTitleEl && servicesMeta.title) benefTitleEl.textContent = servicesMeta.title;

    var benefitsGrid = document.getElementById('benefits-grid');
    if (benefitsGrid && services.length) {
      benefitsGrid.innerHTML = services.map(function (s) {
        return '<div class="benefit-card">' +
          '<div class="ac-benefit-icon">' + benefitIconHtml(s.icon || s.icon_url) + '</div>' +
          '<h3>' + escHtml(s.title) + '</h3>' +
          '<p>' + escHtml(s.description) + '</p>' +
          '</div>';
      }).join('');
    }

    // ── Testimonials ──
    var testimonials = ac.testimonials || [];
    if (testimonials.length) {
      var testimGrid = document.querySelector('.ac-testimonials-grid');
      if (testimGrid) {
        testimGrid.innerHTML = testimonials.map(function (t) {
          var initials = escHtml(t.initials || (t.author || 'A').charAt(0).toUpperCase());
          return '<div class="ac-testimonial-card">' +
            '<p class="ac-testimonial-text">"' + escHtml(t.text) + '"</p>' +
            '<div class="ac-testimonial-author">' +
              '<div class="ac-testimonial-avatar">' + initials + '</div>' +
              '<div>' +
                '<strong>' + escHtml(t.author) + '</strong>' +
                '<span>' + escHtml(t.role) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    }

    // ── CTA ──
    var ctaTitleEl = document.querySelector('.academia-cta h2');
    if (ctaTitleEl && story.title) ctaTitleEl.textContent = story.title;

    var ctaDescEl = document.querySelector('.academia-cta p');
    if (ctaDescEl && story.paragraphs) ctaDescEl.textContent = story.paragraphs;

    var ctaBtn = ac.cta_btn || {};
    if (ctaBtn.label) {
      var ctaBtnEl = document.querySelector('.btn-cta-gold');
      if (ctaBtnEl) { ctaBtnEl.textContent = ctaBtn.label; if (ctaBtn.href) ctaBtnEl.href = ctaBtn.href; }
    }
  }

  loadPageContent();

  function categoryLabel(cat) {
    return _catMap[cat] || cat || 'General';
  }

  async function loadCategories() {
    try {
      var res = await fetch(window.API_BASE + '/api/courses/categories');
      if (!res.ok) return;
      var cats = await res.json();
      _catMap = {};
      cats.forEach(function(c) { _catMap[c.slug] = c.label; });
      // Remove existing category filter buttons (keep "Todos")
      if (filtersContainer) {
        filtersContainer.querySelectorAll('.filter-btn[data-cat]:not([data-cat=""])').forEach(function(b) { b.remove(); });
        cats.forEach(function(c) {
          var btn = document.createElement('button');
          btn.className = 'filter-btn';
          btn.dataset.cat = c.slug;
          btn.textContent = c.label;
          filtersContainer.appendChild(btn);
        });
      }
    } catch (_) {}
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

  if (filtersContainer) {
    filtersContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.filter-btn');
      if (!btn) return;
      filtersContainer.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyFilter(btn.dataset.cat || '');
    });
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function init() {
    await loadCategories();
    loadCourses();
  }
  init();
})();
