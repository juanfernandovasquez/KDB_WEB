let heroIndex = 0;
let heroTimer;

async function loadHero() {
  const target = document.getElementById('site-hero');
  if (!target) return;
  const resp = await fetch('./partials/hero.html');
  const html = await resp.text();
  target.outerHTML = html;
  const page = document.body?.dataset?.page || 'home';
  const pageData = await fetchPageData(page);
  // Validar hero slides runtime
  try {
    const validate = typeof window.validateSchema === 'function' ? window.validateSchema : null;
    if (validate && pageData && Array.isArray(pageData.hero)) {
      const { valid, errors } = await validate('hero_slide', pageData.hero[0] || {});
      if (!valid) {
        console.warn('[validate] hero_slide validation failed, continuing with backend data', errors);
      }
    }
  } catch (e) {
    console.warn('[validate] error validating hero', e);
  }
  initHero(pageData);
}

async function fetchPageData(page) {
  try {
    if (window.apiClient?.getPage) {
      return await window.apiClient.getPage(page);
    }
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/page/${page}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // fallback to static
  }
  return {};
}

function initHero(pageData) {
  const page = document.body?.dataset?.page || 'home';
  const configBackend = pageData?.hero?.length ? { slides: pageData.hero, intervalMs: 8000 } : null;
  const config =
    configBackend ||
    (window.heroConfigByPage && window.heroConfigByPage[page]) ||
    window.heroConfig ||
    { slides: [] };
  const slidesData = (config.slides || []).map((s) => ({
    image_url: s.image_url || '',
    title: s.title || '',
    description: s.description || '',
    primary_label: s.primary_label || '',
    primary_href: s.primary_href || '',
    secondary_label: s.secondary_label || '',
    secondary_href: s.secondary_href || '',
  }));

  // fallback si no hay slides
  if (!slidesData.length) {
    slidesData.push(
      {
        image_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80',
        title: 'Estrategia legal a tu medida',
        description: 'Asesoramos en tributación y corporativo con enfoque preventivo y soluciones claras para tu negocio.',
        primary_label: '',
        primary_href: '',
        secondary_label: '',
        secondary_href: '',
      }
    );
  }

  const track = document.querySelector('.hero-track');
  const dotsContainer = document.querySelector('.hero-dots');
  const titleEl = document.querySelector('.hero-title');
  const textEl = document.querySelector('.hero-text');
  const contentEl = document.querySelector('.hero-content');
  const primaryBtn = document.getElementById('hero-primary-btn');
  const secondaryBtn = document.getElementById('hero-secondary-btn');
  if (!track || !dotsContainer || slidesData.length === 0) return;

  // reset previous dots/slides
  track.innerHTML = '';
  dotsContainer.innerHTML = '';

  // construir slides y dots dinámicamente
  slidesData.forEach((slide, idx) => {
    const slideEl = document.createElement('div');
    slideEl.className = 'hero-slide';
    const img = document.createElement('img');
    img.src = slide.image_url || '';
    img.alt = slide.title || '';
    slideEl.appendChild(img);
    track.appendChild(slideEl);
    if (slidesData.length > 1) {
      const dot = document.createElement('button');
      dot.className = 'dot' + (idx === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Ir a la diapositiva ${idx + 1}`);
      dotsContainer.appendChild(dot);
    }
  });

  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const dots = Array.from(document.querySelectorAll('.hero-dots .dot'));
  const total = slides.length;
  dotsContainer.style.display = total > 1 ? '' : 'none';

  // Ajustar el ancho del track según cantidad de slides
  track.style.setProperty('--hero-track-width', `${total * 100}%`);

  const updateContent = (index) => {
    const data = slidesData[index % slidesData.length];
    if (!data) return;
    const toggleBtn = (btn, label, href) => {
      if (!btn) return;
      const hasContent = !!(label || href);
      btn.style.display = hasContent ? 'inline-flex' : 'none';
      if (hasContent) {
        btn.href = href || '#';
        btn.textContent = label || btn.textContent;
      }
    };
    if (contentEl) {
      contentEl.classList.remove('animate');
      // Forzar reflow y animar entrada desde abajo
      void contentEl.offsetWidth;
      contentEl.classList.add('animate');
    }
    if (titleEl) titleEl.textContent = data.title || '';
    if (textEl) textEl.textContent = data.description || '';
    toggleBtn(primaryBtn, data.primary_label, data.primary_href);
    toggleBtn(secondaryBtn, data.secondary_label, data.secondary_href);
  };

  const goTo = (index) => {
    heroIndex = (index + total) % total;
    const offset = -(heroIndex * 100);
    track.style.transform = `translateX(${offset}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === heroIndex));
    updateContent(heroIndex);
  };

  const next = () => goTo(heroIndex + 1);

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      goTo(i);
      restartTimer();
    });
  });

  const startTimer = () => {
    if (total <= 1) return;
    const interval = Number(config.intervalMs) || 8000;
    heroTimer = setInterval(next, interval);
  };

  const restartTimer = () => {
    clearInterval(heroTimer);
    startTimer();
  };

  updateContent(0);
  startTimer();

  // Drag/swipe navigation
  let isDragging = false;
  let startX = 0;
  let deltaX = 0;
  const onDragStart = (clientX) => {
    if (total <= 1) return;
    isDragging = true;
    startX = clientX;
    deltaX = 0;
    clearInterval(heroTimer);
  };
  const onDragMove = (clientX) => {
    if (!isDragging) return;
    deltaX = clientX - startX;
  };
  const onDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    const threshold = 40;
    if (deltaX > threshold) {
      goTo(heroIndex - 1);
    } else if (deltaX < -threshold) {
      goTo(heroIndex + 1);
    }
    restartTimer();
  };

  track.addEventListener('mousedown', (ev) => {
    onDragStart(ev.clientX);
  });
  track.addEventListener('mousemove', (ev) => {
    onDragMove(ev.clientX);
  });
  track.addEventListener('mouseup', onDragEnd);
  track.addEventListener('mouseleave', onDragEnd);
  track.addEventListener('touchstart', (ev) => {
    if (!ev.touches || !ev.touches.length) return;
    onDragStart(ev.touches[0].clientX);
  }, { passive: true });
  track.addEventListener('touchmove', (ev) => {
    if (!ev.touches || !ev.touches.length) return;
    onDragMove(ev.touches[0].clientX);
  }, { passive: true });
  track.addEventListener('touchend', onDragEnd);
}

document.addEventListener('DOMContentLoaded', loadHero);



