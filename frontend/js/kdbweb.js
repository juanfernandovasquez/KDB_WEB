async function initKdbweb() {
  const page = document.body?.dataset?.page;
  if (page !== 'kdbweb' && page !== 'kdbweb-detail') return;

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

  const fallback = [
    {
      slug: 'doctrina',
      parent_slug: null,
      position: 0,
      title: 'Doctrina',
      summary: 'Analisis y comentarios doctrinales sobre temas tributarios y aduaneros.',
      hero_image_url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Contenido doctrinal curado por el equipo de KDB Legal &amp; Tributario.</p>',
    },
    {
      slug: 'jurisprudencia',
      parent_slug: null,
      position: 1,
      title: 'Jurisprudencia',
      summary: 'Sentencias, resoluciones y criterios relevantes para la practica tributaria.',
      hero_image_url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Seleccion de jurisprudencia clave para decisiones informadas.</p>',
    },
    {
      slug: 'legislacion-tributaria-aduanera',
      parent_slug: null,
      position: 2,
      title: 'Legislacion tributaria y aduanera',
      summary: 'Normas, decretos y actualizaciones en materia tributaria y aduanera.',
      hero_image_url: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Compendio de normas y cambios relevantes para cumplimiento y estrategia.</p>',
    },
    {
      slug: 'tratados-internacionales',
      parent_slug: null,
      position: 3,
      title: 'Tratados internacionales',
      summary: 'Convenios y tratados aplicables a operaciones internacionales.',
      hero_image_url: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Guia sobre tratados y su impacto en transacciones transfronterizas.</p>',
    },
    {
      slug: 'constitucion',
      parent_slug: null,
      position: 4,
      title: 'Constitucion',
      summary: 'Principios constitucionales y su aplicacion en materia tributaria.',
      hero_image_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Marco constitucional que sostiene el sistema tributario.</p>',
    },
    {
      slug: 'tribunal-fiscal',
      parent_slug: 'jurisprudencia',
      position: 5,
      title: 'Tribunal Fiscal',
      summary: 'Resoluciones y criterios del Tribunal Fiscal para casos tributarios.',
      hero_image_url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Repositorio de resoluciones clave emitidas por el Tribunal Fiscal.</p>',
    },
    {
      slug: 'casaciones-de-la-corte-suprema',
      parent_slug: 'jurisprudencia',
      position: 6,
      title: 'Casaciones de la corte suprema',
      summary: 'Criterios y precedentes de la Corte Suprema en materia tributaria.',
      hero_image_url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Compilacion de casaciones relevantes para la practica tributaria.</p>',
    },
    {
      slug: 'sentencias-del-tc',
      parent_slug: 'jurisprudencia',
      position: 7,
      title: 'Sentencias del TC',
      summary: 'Pronunciamientos del Tribunal Constitucional con impacto tributario.',
      hero_image_url: 'https://images.unsplash.com/photo-1521790367000-9662a79b43c5?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Sentencias del Tribunal Constitucional organizadas por materia.</p>',
    },
    {
      slug: 'resoluciones',
      parent_slug: 'tribunal-fiscal',
      position: 8,
      title: 'Resoluciones',
      summary: 'Resoluciones del Tribunal Fiscal clasificadas por tema.',
      hero_image_url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Explora resoluciones relevantes para tus procesos tributarios.</p>',
    },
    {
      slug: 'boletinas',
      parent_slug: 'tribunal-fiscal',
      position: 9,
      title: 'Boletinas',
      summary: 'Boletinas y reportes informativos del Tribunal Fiscal.',
      hero_image_url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80',
      content_html: '<p>Boletinas y comunicados con actualizaciones del Tribunal Fiscal.</p>',
    },
  ];

  const escapeHtml = (str) => (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const toFile = (slug) => `kdbweb-${slug}.html`;
  const sortByPosition = (a, b) => {
    const aPos = typeof a.position === 'number' ? a.position : 0;
    const bPos = typeof b.position === 'number' ? b.position : 0;
    return aPos - bPos;
  };

  async function fetchList() {
    try {
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/kdbweb`);
      if (!res.ok) throw new Error('error');
      return await res.json();
    } catch (_) {
      return fallback;
    }
  }

  async function fetchDetail(slug) {
    try {
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/kdbweb/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error('error');
      return await res.json();
    } catch (_) {
      return fallback.find((e) => e.slug === slug) || null;
    }
  }

  const visibility = await getPageVisibility();
  if (visibility && visibility.kdbweb === false) {
    const list = document.getElementById('kdbweb-list');
    if (list) list.innerHTML = '';
    return;
  }

  if (page === 'kdbweb') {
    const list = document.getElementById('kdbweb-list');
    if (!list) return;
    const data = (await fetchList())
      .filter((entry) => !entry.parent_slug)
      .sort(sortByPosition);
    const row = document.createElement('div');
    row.className = 'publication-row vertical';
    data.forEach((entry) => {
      const cardTitle = entry.card_title || entry.title || '';
      const card = `
        <article class="publication-card">
          <div class="pub-thumb">
            <img src="${escapeHtml(entry.hero_image_url || '')}" alt="${escapeHtml(cardTitle)}">
          </div>
          <div class="pub-body">
            <h3 class="pub-title"><a href="${toFile(entry.slug)}">${escapeHtml(cardTitle)}</a></h3>
            <p class="pub-snippet">${escapeHtml(entry.summary || '')}</p>
          </div>
        </article>
      `;
      row.insertAdjacentHTML('beforeend', card);
    });
    list.innerHTML = '';
    list.appendChild(row);
  }

  if (page === 'kdbweb-detail') {
    const slug = document.body?.dataset?.kdbweb;
    if (!slug) return;
    const [data, listData] = await Promise.all([fetchDetail(slug), fetchList()]);
    if (!data) return;
    const imgEl = document.getElementById('kdbweb-hero-image');
    const titleEl = document.getElementById('kdbweb-hero-title');
    const subtitleEl = document.getElementById('kdbweb-hero-subtitle');
    const kickerEl = document.getElementById('kdbweb-hero-kicker');
    const content = document.getElementById('kdbweb-content');
    const contentWrap = document.querySelector('#kdbweb-hero .hero-content');
    if (imgEl && data.hero_image_url) {
      imgEl.src = data.hero_image_url;
      imgEl.alt = data.title || '';
    }
    const heroTitle = data.title || data.hero_title || '';
    const heroSubtitle = data.summary || data.hero_subtitle || '';
    if (titleEl) titleEl.textContent = heroTitle;
    if (subtitleEl) subtitleEl.textContent = heroSubtitle;
    if (kickerEl) kickerEl.textContent = 'KDBWEB';
    if (contentWrap) contentWrap.classList.add('animate');
    if (content) content.innerHTML = data.content_html || '';
    document.title = `${data.title || 'KDBWEB'} | KDB Legal & Tributario`;

    const childrenSection = document.getElementById('kdbweb-children-section');
    const childrenList = document.getElementById('kdbweb-children-list');
    if (childrenSection && childrenList) {
      const children = (listData || [])
        .filter((entry) => entry.parent_slug === slug)
        .sort(sortByPosition);
      if (children.length) {
        const row = document.createElement('div');
        row.className = 'publication-row vertical';
        children.forEach((entry) => {
          const cardTitle = entry.card_title || entry.title || '';
          const card = `
            <article class="publication-card">
              <div class="pub-thumb">
                <img src="${escapeHtml(entry.hero_image_url || '')}" alt="${escapeHtml(cardTitle)}">
              </div>
              <div class="pub-body">
                <h3 class="pub-title"><a href="${toFile(entry.slug)}">${escapeHtml(cardTitle)}</a></h3>
                <p class="pub-snippet">${escapeHtml(entry.summary || '')}</p>
              </div>
            </article>
          `;
          row.insertAdjacentHTML('beforeend', card);
        });
        childrenList.innerHTML = '';
        childrenList.appendChild(row);
        childrenSection.hidden = false;
      } else {
        childrenSection.hidden = true;
      }
    }
  }
}

window.kdbwebInit = initKdbweb;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initKdbweb);
} else {
  initKdbweb();
}
window.addEventListener('load', initKdbweb);
