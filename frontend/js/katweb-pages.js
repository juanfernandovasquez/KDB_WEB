/**
 * katweb-pages.js — Lógica específica para todas las páginas KATWeb
 * Maneja: página principal (5 tarjetas), Constitución, Tratados,
 * Legislación, Jurisprudencia, Doctrina, Tribunal Fiscal y sub-páginas.
 */
(function () {
  'use strict';

  /* ─── Utilidades generales ──────────────────────────────── */
  const esc = (s) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const API = () => window.API_BASE || '';

  async function apiFetch(path) {
    try {
      const r = await fetch(API() + path);
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    } catch (_) {
      return null;
    }
  }

  async function fetchKdbwebEntry(slug) {
    return apiFetch('/api/kdbweb/' + encodeURIComponent(slug));
  }

  async function fetchKdbwebList() {
    return apiFetch('/api/kdbweb');
  }

  async function fetchBoletines() {
    return apiFetch('/api/katweb/boletines');
  }

  /* ─── ICON SVG helpers ──────────────────────────────────── */
  const SVG_EXT_LINK = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const SVG_SEARCH = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  const SVG_CHEVRON = `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  /* ─── PARSE meta_json safely ────────────────────────────── */
  function parseMeta(entry) {
    if (!entry || !entry.meta_json) return null;
    try {
      return JSON.parse(entry.meta_json);
    } catch (_) {
      return null;
    }
  }

  /**
   * Asegura que una URL sea absoluta.
   * Si el usuario escribe "www.google.com" sin protocolo, el browser
   * la interpreta como relativa y la pega al dominio del sitio.
   * Esta función añade "https://" cuando no hay protocolo explícito.
   */
  function absUrl(url) {
    if (!url || url === '#') return url || '#';
    // Ya es absoluta o es relativa al sitio ("/pagina") — no tocar
    if (/^https?:\/\//i.test(url)) return url;
    if (/^\/\//i.test(url))        return url;   // protocol-relative
    if (url.startsWith('/'))       return url;   // ruta relativa del sitio
    if (/^mailto:|^tel:/i.test(url)) return url;
    // Falta el protocolo — asumir https
    return 'https://' + url;
  }

  /* ══════════════════════════════════════════════════════════
     PÁGINA PRINCIPAL — kdbweb.html
     Renderiza 5 tarjetas de imagen de las categorías raíz
  ══════════════════════════════════════════════════════════ */
  async function initKatwayMain() {
    const container = document.getElementById('katweb-cards-container');
    if (!container) return;

    const list = await fetchKdbwebList();
    const all   = list || [];
    const roots = all
      .filter((e) => !e.parent_slug)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (!roots.length) {
      container.innerHTML = '<p style="text-align:center;color:#999;">Sin categorías disponibles.</p>';
    } else {
      // Primeras 3 en fila superior, las restantes (2) en fila inferior centrada
      const first3 = roots.slice(0, 3);
      const rest = roots.slice(3);

      let html = '<div class="katweb-cards-grid">';
      first3.forEach((e) => { html += buildCatCard(e); });
      if (rest.length) {
        html += '<div class="katweb-cards-row2">';
        rest.forEach((e) => { html += buildCatCard(e); });
        html += '</div>';
      }
      html += '</div>';
      container.innerHTML = html;
    }

    // Activar buscador con todas las entradas (raíces + hijas)
    initKatwebSearch(all);
  }

  /* ══════════════════════════════════════════════════════════
     BUSCADOR — página principal kdbweb.html
     Filtra en tiempo real sobre title, card_title y summary
     de todas las entradas de la KATWeb.
  ══════════════════════════════════════════════════════════ */
  function initKatwebSearch(allEntries) {
    var input = document.getElementById('kw-search-input');
    var form  = document.querySelector('.katweb-hero-search');
    if (!input || !form) return;

    // Mapa slug → título para el breadcrumb de entradas hijas
    var slugTitle = {};
    allEntries.forEach(function(e) {
      slugTitle[e.slug] = e.card_title || e.title || e.slug;
    });

    // ── Patrón portal: el dropdown vive en <body> con position:fixed ──
    // Esto escapa cualquier overflow:hidden ancestral (incluido .katweb-hero)
    var drop = document.createElement('div');
    drop.className = 'kw-search-results';
    drop.setAttribute('hidden', '');
    drop.setAttribute('role', 'listbox');
    document.body.appendChild(drop);

    // Posiciona el dropdown justo bajo el form, usando coordenadas de viewport
    function positionDrop() {
      var rect = form.getBoundingClientRect();
      drop.style.position = 'fixed';
      drop.style.top      = (rect.bottom + 6) + 'px';
      drop.style.left     = rect.left + 'px';
      drop.style.width    = rect.width + 'px';
      drop.style.zIndex   = '9999';
    }

    // Normaliza texto: minúsculas + quita tildes
    function norm(s) {
      return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Resalta la coincidencia dentro del texto plano
    function highlight(text, q) {
      if (!q) return esc(text);
      var t = norm(text), qn = norm(q);
      var idx = t.indexOf(qn);
      if (idx === -1) return esc(text);
      return esc(text.slice(0, idx))
        + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>'
        + esc(text.slice(idx + q.length));
    }

    var activeIdx = -1;

    function hideDrop() {
      drop.setAttribute('hidden', '');
      drop.innerHTML = '';
      activeIdx = -1;
    }

    function renderResults(q) {
      var qn = norm(q.trim());
      if (!qn) { hideDrop(); return; }

      var results = allEntries.filter(function(e) {
        return norm(e.title).includes(qn)
            || norm(e.card_title || '').includes(qn)
            || norm(e.summary || '').includes(qn);
      }).slice(0, 10);

      positionDrop();

      if (!results.length) {
        drop.innerHTML = '<div class="kw-sr-empty">Sin resultados para <strong>'
          + esc(q.trim()) + '</strong></div>';
        drop.removeAttribute('hidden');
        activeIdx = -1;
        return;
      }

      drop.innerHTML = results.map(function(e, i) {
        var label  = e.card_title || e.title || '';
        var parent = e.parent_slug ? (slugTitle[e.parent_slug] || '') : null;
        var icon   = e.parent_slug ? '📄' : '📂';
        var href   = 'kdbweb-' + esc(e.slug) + '.html';
        return '<a class="kw-sr-item" href="' + href + '" data-idx="' + i + '" role="option">'
          + '<span class="kw-sr-icon">' + icon + '</span>'
          + '<span class="kw-sr-body">'
          + (parent ? '<span class="kw-sr-breadcrumb">' + esc(parent) + '</span>' : '')
          + '<span class="kw-sr-title">' + highlight(label, q.trim()) + '</span>'
          + (e.summary ? '<span class="kw-sr-summary">' + esc(e.summary) + '</span>' : '')
          + '</span>'
          + '</a>';
      }).join('');

      drop.removeAttribute('hidden');
      activeIdx = -1;
    }

    function setActive(items) {
      items.forEach(function(it, i) {
        it.classList.toggle('kw-sr-active', i === activeIdx);
      });
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    // Debounce al escribir
    var timer;
    input.addEventListener('input', function() {
      clearTimeout(timer);
      timer = setTimeout(function() { renderResults(input.value); }, 180);
    });

    // Navegación con teclado
    input.addEventListener('keydown', function(e) {
      var items = Array.from(drop.querySelectorAll('.kw-sr-item'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        setActive(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, -1);
        setActive(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var target = activeIdx >= 0 ? items[activeIdx] : items[0];
        if (target) target.click();
      } else if (e.key === 'Escape') {
        hideDrop();
      }
    });

    // Submit del form (botón lupa)
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      var items = drop.querySelectorAll('.kw-sr-item');
      var target = activeIdx >= 0 ? items[activeIdx] : items[0];
      if (target) { target.click(); return; }
      renderResults(q);
      setTimeout(function() {
        var first = drop.querySelector('.kw-sr-item');
        if (first) first.click();
      }, 0);
    });

    // Cerrar al hacer clic fuera (del form Y del dropdown)
    document.addEventListener('click', function(e) {
      if (!form.contains(e.target) && !drop.contains(e.target)) {
        hideDrop();
      }
    });

    // Abrir de nuevo si el usuario vuelve a hacer foco con texto ya escrito
    input.addEventListener('focus', function() {
      if (input.value.trim()) renderResults(input.value);
    });

    // Re-posicionar si el usuario hace scroll o resize (el form puede moverse)
    window.addEventListener('scroll', function() {
      if (!drop.hasAttribute('hidden')) positionDrop();
    }, { passive: true });
    window.addEventListener('resize', function() {
      if (!drop.hasAttribute('hidden')) positionDrop();
    }, { passive: true });
  }

  function buildCatCard(entry) {
    const slug = esc(entry.slug || '');
    const cardTitle = esc(entry.card_title || entry.title || '');
    const summary = esc(entry.summary || '');
    const imgUrl = esc(entry.hero_image_url || 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=600&q=80');
    const href = `kdbweb-${slug}.html`;

    return `
      <a href="${href}" class="katweb-cat-card">
        <img src="${imgUrl}" alt="${cardTitle}" loading="lazy" />
        <div class="katweb-cat-card-body">
          <p class="katweb-cat-card-title">${cardTitle}</p>
          ${summary ? `<p class="katweb-cat-card-desc">${summary}</p>` : ''}
        </div>
      </a>`;
  }

  /* ══════════════════════════════════════════════════════════
     CONSTITUCIÓN — aplica datos del API al HTML estático
  ══════════════════════════════════════════════════════════ */
  async function initConstitucion() {
    const entry = await fetchKdbwebEntry('constitucion');
    if (!entry) return;

    // Banner
    setIfFound('kw-banner-title', entry.hero_title || 'Constitución Política del Perú', 'innerHTML');
    setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    // Dos columnas
    const meta = parseMeta(entry);
    if (meta) {
      if (meta.left_title) {
        const el = document.getElementById('kw-left-title');
        if (el) el.innerHTML = meta.left_title;
      }
      if (meta.right_content) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = meta.right_content;
      }
      if (meta.access_label) {
        const el = document.getElementById('kw-access-label');
        if (el) el.textContent = meta.access_label;
      }
      if (meta.access_btn_label) {
        const el = document.getElementById('kw-access-btn');
        if (el) el.textContent = meta.access_btn_label;
      }
      if (meta.access_url) {
        const el = document.getElementById('kw-access-btn');
        if (el) el.href = absUrl(meta.access_url);
      }
    }

    // Fallback: usar content_html como right_content si no hay meta
    if (!meta && entry.content_html) {
      const el = document.getElementById('kw-right-content');
      if (el) el.innerHTML = entry.content_html;
    }

    // Hero primary href → botón de acceso
    if (entry.hero_primary_href) {
      const btn = document.getElementById('kw-access-btn');
      if (btn) btn.href = absUrl(entry.hero_primary_href);
    }
    if (entry.hero_primary_label) {
      const btn = document.getElementById('kw-access-btn');
      if (btn) btn.textContent = entry.hero_primary_label;
    }

    document.title = (entry.title || 'Constitución') + ' | KATWeb — Katarzyna Legal & Tributario';
  }

  /* ══════════════════════════════════════════════════════════
     TRATADOS INTERNACIONALES — lista de convenios
  ══════════════════════════════════════════════════════════ */
  /* Datos provisionales — se usan cuando la DB aún no tiene meta_json */
  var _TRATADOS_FALLBACK = {
    section_title: 'Convenios para evitar la doble Imposición en vigor:',
    entries: [
      { title: 'Alianza del Pacífico — Convención de Homologación', date: 'Aplicable desde el 1 de enero de 2024', icon_emoji: '🤝', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con Chile', date: 'Aplicable desde el 1 de enero de 2004', icon_emoji: '🇨🇱', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con Canadá', date: 'Aplicable desde el 1 de enero de 2024', icon_emoji: '🇨🇦', button_url: '#', button_label: 'Ver convenio en español', sub_entries: [{ title: '', button_url: '#', button_label: 'Ver convenio en inglés' }] },
      { title: 'Convenio con la Comunidad Andina', date: 'Aplicable desde el 1 de enero de 2005', icon_emoji: '🌐', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con Brasil', date: 'Aplicable desde el 1 de enero de 2010', icon_emoji: '🇧🇷', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con los Estados Unidos de Norteamérica', date: 'Aplicable desde el 1 de enero de 2015', icon_emoji: '🇺🇸', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con España', date: 'Aplicable desde el 1 de enero de 2008', icon_emoji: '🇪🇸', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con México', date: 'Aplicable desde el 1 de enero de 2015', icon_emoji: '🇲🇽', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con Portugal', date: 'Aplicable desde el 1 de enero de 2015', icon_emoji: '🇵🇹', button_url: '#', button_label: 'Ver convenio' },
      { title: 'Convenio con Corea del Sur', date: 'Aplicable desde el 1 de enero de 2015', icon_emoji: '🇰🇷', button_url: '#', button_label: 'Ver convenio' }
    ]
  };

  async function initTratados() {
    const entry = await fetchKdbwebEntry('tratados-internacionales');

    // Banner
    setIfFound('kw-banner-title', (entry && entry.hero_title) || 'Tratados Internacionales', 'innerHTML');
    if (entry) setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    // Prefer DB meta_json; fall back to hardcoded provisional data
    const meta = (entry && parseMeta(entry)) || _TRATADOS_FALLBACK;

    if (meta.left_title) {
      const el = document.getElementById('kw-left-title');
      if (el) el.innerHTML = meta.left_title;
    }
    if (meta.right_content) {
      const el = document.getElementById('kw-right-content');
      if (el) el.innerHTML = meta.right_content;
    }
    if (meta.section_title) {
      const h = document.getElementById('kw-treaties-header');
      if (h) h.textContent = meta.section_title;
    }
    renderTreaties(meta.entries || []);

    document.title = ((entry && entry.title) || 'Tratados Internacionales') + ' | KATWeb';
  }

  function renderTreaties(entries) {
    const list = document.getElementById('kw-treaties-list');
    if (!list) return;
    if (!entries.length) {
      list.innerHTML = '<p style="padding:2rem;text-align:center;color:#999;">Sin convenios cargados.</p>';
      return;
    }

    let html = '';
    entries.forEach((entry) => {
      html += '<div class="kw-treaty-entry">';

      // Ícono — columna izquierda, se centra verticalmente sobre main + subs
      html += '<div class="kw-treaty-icon-col">';
      if (entry.icon_url) {
        html += `<img class="kw-treaty-icon" src="${esc(entry.icon_url)}" alt="${esc(entry.title)}" loading="lazy" />`;
      } else if (entry.icon_emoji) {
        html += `<span class="kw-treaty-icon-placeholder">${esc(entry.icon_emoji)}</span>`;
      } else {
        html += `<span class="kw-treaty-icon-placeholder">🌐</span>`;
      }
      html += '</div>'; // kw-treaty-icon-col

      // Columna derecha: fila principal + sub-entradas apiladas
      html += '<div class="kw-treaty-rows">';

      // Fila principal: info + botón
      html += '<div class="kw-treaty-main">';
      html += '<div class="kw-treaty-info">';
      html += `<p class="kw-treaty-title">${esc(entry.title || '')}</p>`;
      if (entry.date) {
        html += `<p class="kw-treaty-date">${esc(entry.date)}</p>`;
      }
      html += '</div>';
      if (entry.button_url) {
        html += `<a href="${esc(ensureAbsoluteUrl(entry.button_url))}" class="kw-treaty-btn" target="_blank" rel="noopener">${esc(entry.button_label || 'Ver convenio')} ${SVG_EXT_LINK}</a>`;
      } else {
        html += '<span></span>';
      }
      html += '</div>'; // kw-treaty-main

      // Sub-entradas opcionales
      if (entry.sub_entries && entry.sub_entries.length) {
        entry.sub_entries.forEach((sub) => {
          html += '<div class="kw-treaty-sub">';
          html += `<p class="kw-treaty-sub-title">${esc(sub.title || '')}</p>`;
          if (sub.button_url) {
            html += `<a href="${esc(ensureAbsoluteUrl(sub.button_url))}" class="kw-treaty-btn" target="_blank" rel="noopener">${esc(sub.button_label || 'Ver cláusula')} ${SVG_EXT_LINK}</a>`;
          } else {
            html += '<span></span>';
          }
          html += '</div>'; // kw-treaty-sub
        });
      }

      html += '</div>'; // kw-treaty-rows
      html += '</div>'; // kw-treaty-entry
    });

    list.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════
     LEGISLACIÓN TRIBUTARIA Y ADUANERA — tabs + categorías
  ══════════════════════════════════════════════════════════ */
  async function initLegislacion() {
    const entry = await fetchKdbwebEntry('legislacion-tributaria-aduanera');
    if (!entry) return;

    // Banner
    setIfFound('kw-banner-title', entry.hero_title || 'Legislación Tributaria y Aduanera', 'innerHTML');
    setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    // Dos columnas
    const meta = parseMeta(entry);
    if (meta) {
      if (meta.left_title) {
        const el = document.getElementById('kw-left-title');
        if (el) el.innerHTML = meta.left_title;
      }
      if (meta.right_content) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = meta.right_content;
      }
      // Renderizar tabs (soporta formato nuevo {tabs:{tributaria:{categories:[]}}} y formato viejo {tributaria:[...]})
      if (meta.tabs) {
        renderLegislacionTab('tributaria', (meta.tabs.tributaria || {}).categories || []);
        renderLegislacionTab('aduanera', (meta.tabs.aduanera || {}).categories || []);
      } else if (meta.tributaria || meta.aduanera) {
        renderLegislacionTab('tributaria', meta.tributaria || []);
        renderLegislacionTab('aduanera', meta.aduanera || []);
      }
    } else if (entry.content_html) {
      const el = document.getElementById('kw-right-content');
      if (el) el.innerHTML = entry.content_html;
      // Placeholder
      showLegislacionPlaceholder('tributaria');
      showLegislacionPlaceholder('aduanera');
    } else {
      showLegislacionPlaceholder('tributaria');
      showLegislacionPlaceholder('aduanera');
    }

    // Conectar tabs
    initLegislacionTabs();

    document.title = (entry.title || 'Legislación Tributaria y Aduanera') + ' | KATWeb';
  }

  function showLegislacionPlaceholder(tab) {
    const el = document.getElementById(`kw-leg-${tab}-list`);
    if (el) el.innerHTML = `<p style="padding:2rem;text-align:center;color:#999;">Sin contenido cargado para ${tab}. Configura desde el panel de administración.</p>`;
  }

  // Asegura que una URL tenga protocolo (evita que se trate como ruta relativa)
  function ensureAbsoluteUrl(url) {
    if (!url) return '';
    const s = url.trim();
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://' + s;
  }

  // Normaliza una categoría al formato {title, groups:[{norms:[{title,button_url,button_label}]}]}
  // soportando también el formato plano del admin {category_title, norms:[{title,url}]}
  function normalizeLegCat(cat) {
    const title = cat.title || cat.category_title || '';
    let groups = cat.groups;
    if (!groups) {
      // formato plano del admin: norms directo en el objeto
      const flatNorms = (cat.norms || []).map((n) => ({
        title:        n.title       || '',
        button_url:   ensureAbsoluteUrl(n.button_url || n.url || ''),
        button_label: n.button_label || n.label || 'Ver norma',
      }));
      groups = [{ norms: flatNorms }];
    } else {
      // formato nuevo: asegura URLs absolutas en cada norma de cada grupo
      groups = groups.map((g) => ({
        ...g,
        norms: (g.norms || []).map((n) => ({
          ...n,
          button_url: ensureAbsoluteUrl(n.button_url || n.url || ''),
        })),
      }));
    }
    return { ...cat, title, groups, icon_emoji: cat.icon_emoji || '', icon_url: cat.icon_url || '' };
  }

  function renderLegislacionTab(tab, categories) {
    const el = document.getElementById(`kw-leg-${tab}-list`);
    if (!el) return;
    if (!categories.length) {
      showLegislacionPlaceholder(tab);
      return;
    }

    let html = '';
    categories.forEach((rawCat, catIdx) => {
      const cat = normalizeLegCat(rawCat);
      const normCount = countNorms(cat);
      html += `<div class="kw-leg-category" id="kw-cat-${tab}-${catIdx}">`;

      // Header de categoría (clickable para expandir)
      html += `<div class="kw-leg-cat-header" data-action="leg-toggle" data-target="kw-cat-${tab}-${catIdx}">`;
      if (cat.icon_url) {
        html += `<img class="kw-leg-cat-icon" src="${esc(cat.icon_url)}" alt="${esc(cat.title)}" loading="lazy" />`;
      } else if (cat.icon_emoji) {
        html += `<span class="kw-leg-cat-icon" style="font-size:1.5rem;display:flex;align-items:center;justify-content:center;">${esc(cat.icon_emoji)}</span>`;
      } else {
        html += `<span class="kw-leg-cat-icon" style="font-size:1.5rem;display:flex;align-items:center;justify-content:center;">📋</span>`;
      }
      html += '<div>';
      html += `<p class="kw-leg-cat-title">${esc(cat.title || '')}</p>`;
      if (cat.subtitle) {
        html += `<p class="kw-leg-cat-subtitle">${esc(cat.subtitle)}</p>`;
      }
      html += '</div>';
      html += `<span class="kw-norms-badge">${normCount} ${normCount === 1 ? 'norma' : 'normas'}</span>`;
      html += '</div>'; // kw-leg-cat-header

      // Cuerpo expandible: grupos + normas
      html += '<div class="kw-leg-norms">';
      (cat.groups || []).forEach((group) => {
        if (group.title) {
          html += `<p class="kw-norm-group-title">${esc(group.title)}</p>`;
        }
        (group.norms || []).forEach((norm) => {
          const btnUrl = norm.button_url || norm.url || '';
          html += '<div class="kw-norm-row">';
          html += `<span class="kw-norm-title">${esc(norm.title || '')}</span>`;
          if (btnUrl) {
            html += `<a href="${esc(btnUrl)}" class="kw-norm-btn" target="_blank" rel="noopener">${esc(norm.button_label || 'Ver norma')} ${SVG_EXT_LINK}</a>`;
          }
          html += '</div>';
        });
      });
      html += '</div>'; // kw-leg-norms

      html += '</div>'; // kw-leg-category
    });

    el.innerHTML = html;

    // Attach toggle events
    el.querySelectorAll('[data-action="leg-toggle"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const cat = document.getElementById(targetId);
        if (cat) cat.classList.toggle('is-open');
      });
    });
  }

  function countNorms(cat) {
    if (cat.groups) {
      let count = 0;
      cat.groups.forEach((g) => { count += (g.norms || []).length; });
      return count;
    }
    // formato plano del admin
    return (cat.norms || []).length;
  }

  function initLegislacionTabs() {
    const buttons = document.querySelectorAll('.kw-tab-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        buttons.forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.kw-tab-panel').forEach((panel) => {
          panel.classList.remove('is-active');
        });
        const panel = document.getElementById(`kw-tab-${tab}`);
        if (panel) panel.classList.add('is-active');
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     JURISPRUDENCIA — actualiza tarjetas de 3 sub-instituciones
     desde el API (por si el admin cambió títulos/imágenes)
  ══════════════════════════════════════════════════════════ */
  async function initJurisprudencia() {
    const [entry, list] = await Promise.all([
      fetchKdbwebEntry('jurisprudencia'),
      fetchKdbwebList(),
    ]);

    if (!entry) return;

    // Banner split
    setIfFound('kw-banner-title', entry.hero_title || 'Jurisprudencia', 'innerHTML');
    setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    // Texto explicativo (dos columnas)
    const meta = parseMeta(entry);
    if (meta) {
      if (meta.left_title) {
        const el = document.getElementById('kw-left-title');
        if (el) el.innerHTML = meta.left_title;
      }
      if (meta.right_content) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = meta.right_content;
      }
    }

    // Las 3 tarjetas de instituciones se leen de las entradas hijas
    const children = (list || [])
      .filter((e) => e.parent_slug === 'jurisprudencia')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (children.length) {
      const grid = document.getElementById('kw-juris-cards');
      if (grid) {
        const CARD_HREFS = {
          'tribunal-fiscal':                'kdbweb-tribunal-fiscal.html',
          'casaciones-de-la-corte-suprema': 'kdbweb-casaciones-de-la-corte-suprema.html',
          'sentencias-del-tc':              'kdbweb-sentencias-del-tc.html',
        };
        grid.innerHTML = '';
        children.forEach((child) => {
          const slug  = child.slug || '';
          const title = child.card_title || child.title || '';
          const desc  = child.summary || '';
          const img   = child.hero_image_url || 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=80';
          const href  = CARD_HREFS[slug] || `kdbweb-${esc(slug)}.html`;
          grid.innerHTML += `
            <a href="${href}" class="katweb-cat-card">
              <img src="${esc(img)}" alt="${esc(title)}" loading="lazy" />
              <div class="katweb-cat-card-body">
                <p class="katweb-cat-card-title">${esc(title)}</p>
                ${desc ? `<p class="katweb-cat-card-desc">${esc(desc)}</p>` : ''}
              </div>
            </a>`;
        });
      }
    }

    document.title = 'Jurisprudencia | KATWeb';
  }

  /* ══════════════════════════════════════════════════════════
     DOCTRINA — 4 tarjetas + botón de biblioteca
  ══════════════════════════════════════════════════════════ */
  async function initDoctrina() {
    const entry = await fetchKdbwebEntry('doctrina');
    if (!entry) return;

    // Banner (split: kw-banner-title + imagen)
    setIfFound('kw-banner-title', entry.hero_title || 'Doctrina', 'innerHTML');
    setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    const meta = parseMeta(entry);
    if (meta) {
      if (meta.left_title) {
        const el = document.getElementById('kw-left-title');
        if (el) el.innerHTML = meta.left_title;
      }
      if (meta.right_content) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = meta.right_content;
      }
      // Tarjetas de categorías: si hay meta, actualizar los IDs estáticos (sin re-render)
      if (meta.categories && meta.categories.length) {
        meta.categories.forEach((cat, i) => {
          const titleEl = document.getElementById(`kw-doc-card-title-${i}`);
          const descEl  = document.getElementById(`kw-doc-card-desc-${i}`);
          if (titleEl && cat.title)       titleEl.textContent = cat.title;
          if (descEl  && cat.description) descEl.textContent  = cat.description;
        });
      }
      // Botón CTA
      if (meta.cta_label) {
        const el = document.getElementById('kw-doctrina-cta-label');
        if (el) el.textContent = meta.cta_label;
      }
      if (meta.cta_btn_label) {
        const btn = document.getElementById('kw-doctrina-cta-btn');
        if (btn) btn.textContent = meta.cta_btn_label;
      }
      if (meta.cta_url) {
        const btn = document.getElementById('kw-doctrina-cta-btn');
        if (btn) btn.href = absUrl(meta.cta_url);
      }
    } else if (entry.content_html) {
      const el = document.getElementById('kw-right-content');
      if (el) el.innerHTML = entry.content_html;
    }

    // CTA href desde hero_primary_href
    if (entry.hero_primary_href) {
      const btn = document.getElementById('kw-doctrina-cta-btn');
      if (btn) btn.href = absUrl(entry.hero_primary_href);
    }
    if (entry.hero_primary_label) {
      const btn = document.getElementById('kw-doctrina-cta-btn');
      if (btn) btn.textContent = entry.hero_primary_label;
    }

    document.title = 'Doctrina | KATWeb';
  }

  function renderDoctrinaCards(categories) {
    const grid = document.getElementById('kw-doctrina-cards');
    if (!grid) return;
    grid.innerHTML = '';
    categories.forEach((cat) => {
      let iconHtml = '';
      if (cat.icon_url) {
        iconHtml = `<img class="kw-doctrina-card-icon" src="${esc(cat.icon_url)}" alt="${esc(cat.title)}" loading="lazy" />`;
      } else {
        iconHtml = `<div class="kw-doctrina-card-icon-placeholder">${esc(cat.icon_emoji || '📄')}</div>`;
      }
      grid.innerHTML += `
        <div class="kw-doctrina-card">
          ${iconHtml}
          <p class="kw-doctrina-card-title">${esc(cat.title || '')}</p>
          <p class="kw-doctrina-card-desc">${esc(cat.description || '')}</p>
        </div>`;
    });
  }

  /* ══════════════════════════════════════════════════════════
     TRIBUNAL FISCAL — herramientas + boletines por año
  ══════════════════════════════════════════════════════════ */
  async function initTribunalFiscal() {
    const [entry, boletines] = await Promise.all([
      fetchKdbwebEntry('tribunal-fiscal'),
      fetchBoletines(),
    ]);

    if (entry) {
      // Banner: kw-banner-title es siempre "Jurisprudencia" (estático en HTML);
      // kw-banner-subtitle muestra el nombre de esta sub-página desde la API.
      setIfFound('kw-banner-subtitle', entry.hero_title || 'Tribunal Fiscal', 'innerHTML');
      setIfFound('kw-banner-image', entry.hero_image_url, 'src');

      const meta = parseMeta(entry);
      if (meta) {
        if (meta.left_title) {
          const el = document.getElementById('kw-left-title');
          if (el) el.innerHTML = meta.left_title;
        }
        if (meta.right_content) {
          const el = document.getElementById('kw-right-content');
          if (el) el.innerHTML = meta.right_content;
        }
        // Subtítulos y descripciones de sección
        if (meta.section1_title) {
          const el = document.getElementById('kw-section1-title');
          if (el) el.textContent = meta.section1_title;
        }
        if (meta.section1_desc) {
          const el = document.getElementById('kw-section1-desc');
          if (el) el.textContent = meta.section1_desc;
        }
        if (meta.section2_title) {
          const el = document.getElementById('kw-section2-title');
          if (el) el.textContent = meta.section2_title;
        }
        if (meta.section2_desc) {
          const el = document.getElementById('kw-section2-desc');
          if (el) el.innerHTML = meta.section2_desc;
        }
        // Herramientas: rellena icon, card_title, card_desc y button de cada tarjeta
        (meta.tools || []).forEach(function(tool, i) {
          const n = i + 1;
          const icon  = document.getElementById('kw-tool-icon-'       + n);
          const title = document.getElementById('kw-tool-card-title-' + n);
          const desc  = document.getElementById('kw-tool-card-desc-'  + n);
          const btn   = document.getElementById('kw-tool-btn-'        + n);
          if (icon  && tool.icon)         icon.textContent  = tool.icon;
          if (title && tool.card_title)   title.textContent = tool.card_title;
          if (desc  && tool.card_desc)    desc.textContent  = tool.card_desc;
          if (btn) {
            btn.href = absUrl(tool.url);
            // button_label is the new field; fall back to old "label" for backward-compat
            const label = tool.button_label || tool.label;
            if (label) btn.textContent = label;
          }
        });
      } else if (entry.content_html) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = entry.content_html;
      }
    }

    // Renderizar boletines por año
    renderBoletines(boletines || []);

    document.title = 'Tribunal Fiscal | KATWeb';
  }

  function renderBoletines(boletines) {
    const container = document.getElementById('kw-boletines-list');
    if (!container) return;

    if (!boletines.length) {
      container.innerHTML = '<p style="padding:1rem;text-align:center;color:#999;">Sin boletines cargados. Agrega boletines desde el panel de administración.</p>';
      return;
    }

    // Agrupar por año
    const byYear = {};
    boletines.forEach((b) => {
      const y = b.year || 'Sin año';
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(b);
    });

    const years = Object.keys(byYear).sort((a, b) => b - a);
    let html = '';
    years.forEach((year, yIdx) => {
      const items = byYear[year];
      const isOpen = yIdx === 0; // El año más reciente abierto por defecto
      html += `<div class="kw-year-block${isOpen ? ' is-open' : ''}" id="kw-year-${year}">`;
      html += `<div class="kw-year-header" data-action="year-toggle" data-year="${year}">`;
      html += `<span class="kw-year-header-left"><span>${year}</span><span class="kw-year-badge">${items.length} ${items.length === 1 ? 'Boletín disponible' : 'Boletines disponibles'}</span></span>`;
      html += `<span class="kw-year-toggle">${SVG_CHEVRON}</span>`;
      html += '</div>';
      html += '<div class="kw-year-body">';
      items.forEach((b) => {
        html += '<div class="kw-boletin-row">';
        html += `<span class="kw-boletin-name">${esc(b.month_label || '')}</span>`;
        if (b.pdf_url) {
          html += `<a href="${esc(b.pdf_url)}" class="kw-treaty-btn" target="_blank" rel="noopener">Descargar PDF ${SVG_EXT_LINK}</a>`;
        }
        html += '</div>';
      });
      html += '</div>'; // kw-year-body
      html += '</div>'; // kw-year-block
    });

    container.innerHTML = html;

    // Acordeón
    container.querySelectorAll('[data-action="year-toggle"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const year = btn.dataset.year;
        const block = document.getElementById(`kw-year-${year}`);
        if (block) block.classList.toggle('is-open');
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     CASACIONES DE LA CORTE SUPREMA
  ══════════════════════════════════════════════════════════ */
  async function initCasaciones() {
    const entry = await fetchKdbwebEntry('casaciones-de-la-corte-suprema');
    if (!entry) return;

    setIfFound('kw-banner-subtitle', entry.hero_title || 'Casaciones de la Corte Suprema', 'innerHTML');
    setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    const meta = parseMeta(entry);
    if (meta) {
      if (meta.left_title) {
        const el = document.getElementById('kw-left-title');
        if (el) el.innerHTML = meta.left_title;
      }
      if (meta.right_content) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = meta.right_content;
      }
      if (meta.access_url) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.href = absUrl(meta.access_url);
      }
      if (meta.access_btn_label) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.textContent = meta.access_btn_label;
      }
      if (meta.access_label) {
        const el = document.getElementById('kw-access-label');
        if (el) el.textContent = meta.access_label;
      }
      if (meta.suggestion_title) {
        const el = document.getElementById('kw-suggestion-title-text');
        if (el) el.textContent = meta.suggestion_title;
      }
      if (meta.suggestion_desc) {
        const el = document.getElementById('kw-suggestion-desc');
        if (el) el.textContent = meta.suggestion_desc;
      }
      if (meta.suggestion_items && meta.suggestion_items.length) {
        const box = document.getElementById('kw-suggestion-items');
        if (box) {
          box.innerHTML = meta.suggestion_items
            .map((s) => `<div class="kw-suggestion-item">${esc(s)}</div>`)
            .join('');
        }
      }
    } else {
      if (entry.content_html) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = entry.content_html;
      }
      if (entry.hero_primary_href) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.href = absUrl(entry.hero_primary_href);
      }
      if (entry.hero_primary_label) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.textContent = entry.hero_primary_label;
      }
    }

    document.title = 'Casaciones de la Corte Suprema | KATWeb';
  }

  /* ══════════════════════════════════════════════════════════
     SENTENCIAS DEL TC
  ══════════════════════════════════════════════════════════ */
  async function initSentenciasTC() {
    const entry = await fetchKdbwebEntry('sentencias-del-tc');
    if (!entry) return;

    setIfFound('kw-banner-subtitle', entry.hero_title || 'Sentencias del TC', 'innerHTML');
    setIfFound('kw-banner-image', entry.hero_image_url, 'src');

    const meta = parseMeta(entry);
    if (meta) {
      if (meta.left_title) {
        const el = document.getElementById('kw-left-title');
        if (el) el.innerHTML = meta.left_title;
      }
      if (meta.right_content) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = meta.right_content;
      }
      // Caja del buscador
      if (meta.box_title) {
        const el = document.getElementById('kw-box-title');
        if (el) el.textContent = meta.box_title;
      }
      if (meta.box_desc) {
        const el = document.getElementById('kw-box-desc');
        if (el) el.textContent = meta.box_desc;
      }
      if (meta.access_label) {
        const el = document.getElementById('kw-access-label');
        if (el) el.textContent = meta.access_label;
      }
      if (meta.access_btn_label) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.textContent = meta.access_btn_label;
      }
      if (meta.access_url) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.href = absUrl(meta.access_url);
      }
    } else {
      if (entry.content_html) {
        const el = document.getElementById('kw-right-content');
        if (el) el.innerHTML = entry.content_html;
      }
      if (entry.hero_primary_href) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.href = absUrl(entry.hero_primary_href);
      }
      if (entry.hero_primary_label) {
        const btn = document.getElementById('kw-access-btn');
        if (btn) btn.textContent = entry.hero_primary_label;
      }
    }

    document.title = 'Sentencias del TC | KATWeb';
  }

  /* ─── Utilidad: setear valor en elemento por ID ──────── */
  function setIfFound(id, value, attr) {
    if (!value) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (attr === 'src') {
      el.src = value;
    } else if (attr === 'innerHTML') {
      el.innerHTML = value;
    } else {
      el.textContent = value;
    }
  }

  /* ══════════════════════════════════════════════════════════
     DISPATCHER — ejecuta la función correcta según el tipo
  ══════════════════════════════════════════════════════════ */
  async function init() {
    const page = document.body?.dataset?.page;
    const katwayType = document.body?.dataset?.katwayType;

    if (page === 'kdbweb') {
      await initKatwayMain();
      return;
    }

    if (page === 'kdbweb-detail') {
      // data-kdbweb (not data-katweb) is the attribute used in all inner-page HTML files
      const type = document.body?.dataset?.kdbweb;
      const kwType = document.body?.dataset?.katwayType || type;

      switch (type) {
        case 'constitucion':      await initConstitucion(); break;
        case 'tratados-internacionales': await initTratados(); break;
        case 'legislacion-tributaria-aduanera': await initLegislacion(); break;
        case 'jurisprudencia':    await initJurisprudencia(); break;
        case 'doctrina':          await initDoctrina(); break;
        case 'tribunal-fiscal':   await initTribunalFiscal(); break;
        case 'casaciones-de-la-corte-suprema': await initCasaciones(); break;
        case 'sentencias-del-tc': await initSentenciasTC(); break;
        default:
          // Para entradas genéricas: rellenar banner desde API
          if (type) {
            const entry = await fetchKdbwebEntry(type);
            if (entry) {
              setIfFound('kw-banner-title', entry.hero_title || entry.title, 'innerHTML');
              setIfFound('kw-banner-image', entry.hero_image_url, 'src');
            }
          }
          break;
      }
    }
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
