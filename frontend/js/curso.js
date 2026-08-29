/* Curso detail page — loads course by ?slug= param */
(function () {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || '';

  const main = document.getElementById('curso-main');
  const notFound = document.getElementById('curso-not-found');

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function categoryLabel(cat) {
    const map = { tributario: 'Tributario', laboral: 'Laboral', corporativo: 'Corporativo', sunat: 'SUNAT' };
    return map[cat] || cat || 'General';
  }

  function calcDiscount(price, original) {
    if (!original || original <= price) return null;
    return Math.round((1 - price / original) * 100);
  }

  function renderHero(course) {
    document.title = `${course.title} | Katarzyna Academia`;
    document.getElementById('breadcrumb-title').textContent = course.title;
    document.getElementById('curso-title').textContent = course.title;
    document.getElementById('curso-subtitle').textContent = course.subtitle || '';

    // Background
    if (course.image_url) {
      document.getElementById('curso-hero-bg').style.backgroundImage = `url('${escHtml(course.image_url)}')`;
    }

    // Badges
    const badges = document.getElementById('curso-badges');
    badges.innerHTML = `<span class="badge-gold">Destacado</span>`;
    if (course.category) {
      badges.innerHTML += `<span class="badge-category">${escHtml(categoryLabel(course.category))}</span>`;
    }

    // Meta
    const meta = document.getElementById('curso-meta');
    const items = [];
    if (course.modules_count) items.push({ icon: 'calendar', label: 'Módulos', value: `${course.modules_count} módulos` });
    if (course.duration) items.push({ icon: 'clock', label: 'Duración', value: course.duration });
    if (course.level) items.push({ icon: 'user', label: 'Nivel', value: course.level });
    items.push({ icon: 'shield', label: 'Certificado', value: 'Incluido' });

    const icons = {
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
      shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    };

    meta.innerHTML = items.map((it) => `
      <div class="meta-item">
        ${icons[it.icon]}
        <div><span class="meta-label">${escHtml(it.label)}</span><span class="meta-value">${escHtml(it.value)}</span></div>
      </div>`).join('');
  }

  function renderPurchaseCard(course) {
    // Thumb
    const thumb = document.getElementById('purchase-card-thumb');
    if (course.image_url) {
      thumb.src = course.image_url;
      thumb.alt = course.title;
    } else {
      document.getElementById('purchase-card-img').style.background = 'var(--brand-blue,#06186d)';
      thumb.style.display = 'none';
    }

    // Price
    document.getElementById('purchase-price').textContent = `S/ ${Number(course.price).toFixed(0)}`;
    const origEl = document.getElementById('purchase-original');
    const discEl = document.getElementById('purchase-discount');
    if (course.original_price && course.original_price > course.price) {
      origEl.textContent = `S/ ${Number(course.original_price).toFixed(0)}`;
      const pct = calcDiscount(course.price, course.original_price);
      if (pct) {
        discEl.textContent = `-${pct}%`;
        discEl.classList.remove('hidden');
      }
    }

    // Buy button
    document.getElementById('btn-comprar').href = `pagar.html?slug=${encodeURIComponent(course.slug)}`;

    // Includes — use custom list from API if available, fallback to defaults
    const includesList = document.getElementById('purchase-includes-list');
    const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
    const apiIncludes = Array.isArray(course.includes_list) ? course.includes_list : [];
    const defaultIncludes = [
      course.duration ? `${course.duration} de video bajo demanda` : 'Video bajo demanda',
      'Documentos descargables',
      'Ejercicios y casos prácticos',
      'Acceso desde cualquier dispositivo',
      'Soporte de consultas por 30 días',
    ];
    const includesItems = apiIncludes.length ? apiIncludes : defaultIncludes;

    includesList.innerHTML = includesItems.map((text) =>
      `<div class="include-item">${checkSvg}<span>${escHtml(String(text))}</span></div>`
    ).join('');
  }

  function renderAboutTab(course) {
    document.getElementById('about-description').textContent =
      course.description || course.subtitle || 'Información del curso próximamente.';

    // What you'll learn
    const learnSection = document.getElementById('learn-section');
    const learnList = document.getElementById('learn-list');
    const learns = Array.isArray(course.what_you_learn) ? course.what_you_learn.filter(Boolean) : [];
    if (learns.length) {
      learnList.innerHTML = learns.map((item) => `<li>${escHtml(String(item))}</li>`).join('');
      learnSection.style.display = '';
    }

    // Audience
    const audienceSection = document.getElementById('audience-section');
    const audienceTags = document.getElementById('audience-tags');
    const audience = Array.isArray(course.audience) ? course.audience.filter(Boolean) : [];
    if (audience.length) {
      audienceTags.innerHTML = audience.map((item) => `<span class="audience-tag">${escHtml(String(item))}</span>`).join('');
      audienceSection.style.display = '';
    }
  }

  function renderModulesTab(course) {
    const accordion = document.getElementById('module-accordion');
    const modules = course.modules || [];

    if (!modules.length) {
      accordion.innerHTML = '<p style="color:#5b6474;font-size:.9rem;">El programa del curso estará disponible próximamente.</p>';
      return;
    }

    const typeIcons = {
      video: '<svg class="lesson-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21"/></svg>',
      pdf: '<svg class="lesson-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      quiz: '<svg class="lesson-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    };

    accordion.innerHTML = modules.map((mod, idx) => {
      const lessons = (mod.lessons || []).map((l) => {
        if (l.type === 'bullet') {
          return `<li class="lesson-item lesson-bullet"><span class="lesson-bullet-dot"></span>${escHtml(l.title)}</li>`;
        }
        const icon = typeIcons[l.type] || typeIcons.video;
        return `<li class="lesson-item">${icon}${escHtml(l.title)}<span class="lesson-duration">${escHtml(l.duration || '')}</span></li>`;
      }).join('');

      const subtitle = [
        mod.lessons_count ? `${mod.lessons_count} lecciones` : '',
        mod.duration || '',
      ].filter(Boolean).join(' · ');

      return `
        <div class="module-item${idx === 0 ? ' open' : ''}">
          <button class="module-header" type="button">
            <div class="module-number">${String(idx + 1).padStart(2, '0')}</div>
            <div class="module-header-text">
              <div class="module-title">${escHtml(mod.title)}</div>
              ${subtitle ? `<div class="module-subtitle">${escHtml(subtitle)}</div>` : ''}
            </div>
            <svg class="module-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="module-body">
            <ul class="lesson-list">${lessons || '<li class="lesson-item" style="color:#5b6474;">Contenido por confirmar</li>'}</ul>
          </div>
        </div>`;
    }).join('');

    // Accordion toggle
    accordion.querySelectorAll('.module-header').forEach((btn) => {
      btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
    });
  }

  async function loadRelated(currentSlug) {
    try {
      const resp = await fetch(`${window.API_BASE}/api/courses`);
      if (!resp.ok) return;
      const courses = await resp.json();
      const related = courses.filter((c) => c.slug !== currentSlug).slice(0, 3);
      if (!related.length) return;
      const list = document.getElementById('related-list');
      list.innerHTML = related.map((c) => `
        <a class="related-card" href="curso.html?slug=${encodeURIComponent(c.slug)}">
          <div class="related-thumb">
            ${c.image_url ? `<img src="${escHtml(c.image_url)}" alt="" loading="lazy" />` : ''}
          </div>
          <div class="related-info">
            <h5>${escHtml(c.title)}</h5>
            <span class="related-price">S/ ${Number(c.price).toFixed(0)}</span>
          </div>
        </a>`).join('');
      document.getElementById('sidebar-related').style.display = '';
    } catch { /* ignore */ }
  }

  async function loadCourse() {
    if (!slug) {
      main.classList.remove('curso-loading-state');
      main.classList.add('hidden');
      notFound.classList.remove('hidden');
      return;
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/courses/${encodeURIComponent(slug)}`);
      if (!resp.ok) throw new Error('not found');
      const course = await resp.json();

      renderHero(course);
      renderPurchaseCard(course);
      renderAboutTab(course);
      renderModulesTab(course);
      main.classList.remove('curso-loading-state');
      loadRelated(slug);
    } catch {
      main.classList.remove('curso-loading-state');
      main.classList.add('hidden');
      notFound.classList.remove('hidden');
    }
  }

  // Tab switching
  document.querySelectorAll('.curso-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.curso-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  loadCourse();
})();
