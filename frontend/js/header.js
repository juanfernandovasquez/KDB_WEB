async function loadHeader() {
  const target = document.getElementById('site-header');
  if (!target) return;
  const pages = await fetchPageVisibility();
  const resp = await fetch('./partials/header.html');
  const html = await resp.text();
  target.outerHTML = html;
  initHeaderEvents();
  if (pages) {
    window.pageVisibility = pages;
    applyPageVisibility(pages);
  } else {
    await applyPageVisibility();
  }
  await applyHeaderLogo();
  initCookieBanner();
  await updateKdbwebMenu();
  initSearch();
}

function initHeaderEvents() {
  const menuBtn = document.getElementById('menu-btn');
  const sidePanel = document.getElementById('side-panel');
  const closeBtn = document.getElementById('close-btn');

  const closeMenu = () => {
    sidePanel?.classList.remove('show');
    closeBtn?.classList.remove('show');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    sidePanel?.classList.add('show');
    closeBtn?.classList.add('show');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
  };

  menuBtn?.addEventListener('click', () => {
    if (sidePanel?.classList.contains('show')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  closeBtn?.addEventListener('click', () => {
    closeMenu();
  });

  sidePanel?.addEventListener('click', (ev) => {
    const toggleBtn = ev.target.closest('[data-side-toggle]');
    if (toggleBtn) {
      ev.preventDefault();
      const targetId = toggleBtn.getAttribute('data-side-toggle');
      const submenu = targetId ? document.getElementById(`side-${targetId}`) : null;
      if (submenu?.classList.contains('show')) {
        const href = toggleBtn.getAttribute('data-parent-href');
        if (href) window.location.href = href;
      } else {
        submenu?.classList.add('show');
      }
      return;
    }
    if (ev.target.closest('a')) {
      closeMenu();
    }
  });
}

async function updateKdbwebMenu() {
  const dropdown = document.querySelector('.nav-dropdown-menu');
  const sideMenu = document.getElementById('side-kdbweb');
  if (!dropdown || !sideMenu) return;
  if (window.pageVisibility && window.pageVisibility.kdbweb === false) return;
  try {
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/kdbweb`);
    if (!res.ok) return;
    const entries = await res.json();
    if (!Array.isArray(entries) || entries.length === 0) return;
    const topEntries = entries
      .filter((entry) => !entry.parent_slug)
      .sort((a, b) => {
        const aPos = typeof a.position === 'number' ? a.position : 0;
        const bPos = typeof b.position === 'number' ? b.position : 0;
        return aPos - bPos;
      });
    if (!topEntries.length) return;
    dropdown.innerHTML = '';
    sideMenu.innerHTML = '';
    topEntries.forEach((entry) => {
      const slug = entry.slug || '';
      const title = entry.title || slug;
      if (!slug) return;
      const href = `kdbweb-${slug}.html`;
      const link = document.createElement('a');
      link.href = href;
      link.textContent = title;
      dropdown.appendChild(link);
      const sideLink = document.createElement('a');
      sideLink.href = href;
      sideLink.textContent = title;
      sideMenu.appendChild(sideLink);
    });
  } catch (_) {
    // keep static menu if API fails
  }
}

async function fetchCompanyData() {
  try {
    if (window.apiClient?.getCompany) {
      return await window.apiClient.getCompany();
    }
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/company`);
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {
    // ignore
  }
  return window.companyInfo || {};
}

async function applyHeaderLogo() {
  const info = await fetchCompanyData();
  const logoUrl = (info && info.logo_url) || '';
  if (logoUrl) {
    document.querySelectorAll('[data-logo-role]').forEach((img) => {
      if (img && img.tagName === 'IMG') {
        img.src = logoUrl;
        img.style.display = '';
      }
    });
  } else {
    document.querySelectorAll('[data-logo-role]').forEach((img) => {
      if (img && img.tagName === 'IMG') {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
    });
  }
  const faviconUrl = (info && info.favicon_url) || '';
  if (faviconUrl) {
    setFavicon(faviconUrl);
  }
}

function setFavicon(url) {
  if (!url) return;
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;
  let link = head.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    head.appendChild(link);
  }
  link.href = url;
}

async function fetchPageVisibility() {
  try {
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/pages`);
    if (!res.ok) return;
    const data = await res.json();
    return data.pages || {};
  } catch (_) {
    // ignore visibility failures
  }
}

function applyPageVisibility(pagesOverride) {
  const pages = pagesOverride || window.pageVisibility || {};
  document.querySelectorAll('[data-page-key]').forEach((el) => {
    const key = el.dataset.pageKey;
    if (!key) return;
    if (pages[key] === false) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });
}

const COOKIE_CONSENT_NAME = 'kdb_cookie_consent';
const COOKIE_CONSENT_VALUE = 'accepted';
const COOKIE_CONSENT_DAYS = 180;
const COOKIE_BANNER_DELAY_MS = 15000;

function getCookie(name) {
  const pairs = (document.cookie || '').split(';').map((c) => c.trim());
  for (const pair of pairs) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const key = idx >= 0 ? pair.slice(0, idx) : pair;
    if (decodeURIComponent(key) === name) {
      return decodeURIComponent(pair.slice(idx + 1));
    }
  }
  return '';
}

function setCookie(name, value, days) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `expires=${date.toUTCString()}`;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax${secure}`;
}

function initCookieBanner() {
  if (!document.body) return;
  if (getCookie(COOKIE_CONSENT_NAME) === COOKIE_CONSENT_VALUE) return;
  if (document.getElementById('cookie-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.className = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Aviso de cookies');
  banner.innerHTML = `
    <div class="cookie-banner-content">
      <div class="cookie-text">
        <strong>Cookies</strong>
        <p>Usamos cookies para mejorar tu experiencia. Al continuar aceptas nuestra <a href="cookies.html">Politica de cookies</a> y <a href="privacidad.html">Politica de privacidad</a>.</p>
      </div>
      <div class="cookie-actions">
        <button type="button" class="cookie-accept" data-action="cookie-accept">Aceptar</button>
        <button type="button" class="cookie-close" data-action="cookie-close" aria-label="Cerrar">X</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  document.body.classList.add('cookie-banner-visible');
  const revealBanner = () => {
    const height = banner.offsetHeight || 0;
    document.documentElement.style.setProperty('--cookie-banner-height', `${height}px`);
    banner.classList.add('is-visible');
  };
  const scheduleReveal = () => {
    window.setTimeout(revealBanner, COOKIE_BANNER_DELAY_MS);
  };

  if (document.readyState === 'complete') {
    scheduleReveal();
  } else {
    window.addEventListener('load', scheduleReveal, { once: true });
  }

  const hideBanner = (persist) => {
    if (persist) {
      setCookie(COOKIE_CONSENT_NAME, COOKIE_CONSENT_VALUE, COOKIE_CONSENT_DAYS);
    }
    banner.classList.remove('is-visible');
    banner.classList.add('is-hidden');
    document.body.classList.remove('cookie-banner-visible');
    document.documentElement.style.setProperty('--cookie-banner-height', '0px');
    window.setTimeout(() => banner.remove(), 240);
  };

  const acceptBtn = banner.querySelector('[data-action="cookie-accept"]');
  const closeBtn = banner.querySelector('[data-action="cookie-close"]');
  acceptBtn?.addEventListener('click', () => hideBanner(true));
  closeBtn?.addEventListener('click', () => hideBanner(true));
}

let searchCache = null;
let searchLoading = null;

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').trim();
}

function truncate(text, limit = 140) {
  const s = (text || '').trim();
  if (s.length <= limit) return s;
  return s.slice(0, limit) + '...';
}

async function loadSearchData() {
  if (searchCache) return searchCache;
  if (searchLoading) return searchLoading;
  searchLoading = (async () => {
    const base = window.API_BASE || '';
    const [pubRes, kdbRes] = await Promise.all([
      fetch(`${base}/api/publications`),
      fetch(`${base}/api/kdbweb`),
    ]);
    const pubs = pubRes.ok ? await pubRes.json() : [];
    const kdbList = kdbRes.ok ? await kdbRes.json() : [];
    const pubDetails = await Promise.all(
      (pubs || []).map(async (entry) => {
        const slug = entry.slug;
        if (!slug) return entry;
        try {
          const res = await fetch(`${base}/api/publications/slug/${encodeURIComponent(slug)}`);
          if (!res.ok) return entry;
          return await res.json();
        } catch (_) {
          return entry;
        }
      }),
    );
    const kdbDetails = await Promise.all(
      (kdbList || []).map(async (entry) => {
        try {
          const res = await fetch(`${base}/api/kdbweb/${encodeURIComponent(entry.slug)}`);
          if (!res.ok) return entry;
          return await res.json();
        } catch (_) {
          return entry;
        }
      }),
    );
    const items = [];
    (pubDetails || []).forEach((p) => {
      const title = p.title || '';
      const content = stripHtml(p.content_html || p.excerpt || '');
      items.push({
        type: 'Publicacion',
        title,
        text: content,
        url: `publicacion.html?slug=${encodeURIComponent(p.slug || '')}`,
      });
    });
    (kdbDetails || []).forEach((k) => {
      const title = k.title || '';
      const content = stripHtml(k.summary || k.content_html || '');
      items.push({
        type: 'KDBWEB',
        title,
        text: content,
        url: `kdbweb-${encodeURIComponent(k.slug || '')}.html`,
      });
    });
    searchCache = items;
    return items;
  })();
  return searchLoading;
}

function initSearch() {
  const panel = document.getElementById('search-panel');
  const openBtn = document.querySelector('.search-btn');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!panel || !openBtn || !input || !results) return;

  const setOpen = (open) => {
    panel.classList.toggle('show', open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      input.focus();
      input.select();
      if (!input.value.trim()) {
        results.innerHTML = '<p class="search-empty">Escribe para buscar.</p>';
      }
    } else {
      input.value = '';
      results.innerHTML = '';
    }
  };

  openBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setOpen(!panel.classList.contains('show'));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') setOpen(false);
  });
  document.addEventListener('click', (ev) => {
    if (!panel.classList.contains('show')) return;
    if (panel.contains(ev.target) || openBtn.contains(ev.target)) return;
    setOpen(false);
  });

  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const term = input.value.trim().toLowerCase();
      if (!term) {
        results.innerHTML = '<p class="search-empty">Escribe para buscar.</p>';
        requestAnimationFrame(() => {
          results.querySelector('.search-empty')?.classList.add('is-visible');
        });
        return;
      }
      const items = await loadSearchData();
      const matches = items.filter((item) => {
        const haystack = `${item.title} ${item.text}`.toLowerCase();
        return haystack.includes(term);
      });
      if (!matches.length) {
        results.innerHTML = '<p class="search-empty">Sin resultados.</p>';
        requestAnimationFrame(() => {
          results.querySelector('.search-empty')?.classList.add('is-visible');
        });
        return;
      }
      results.innerHTML = '';
      matches.slice(0, 20).forEach((item) => {
        const el = document.createElement('a');
        el.className = 'search-item';
        el.href = item.url;
        el.innerHTML = `
          <span class="search-type">${item.type}</span>
          <h5>${item.title}</h5>
          <p>${truncate(item.text)}</p>
        `;
        results.appendChild(el);
      });
      requestAnimationFrame(() => {
        results.querySelectorAll('.search-item').forEach((el) => {
          el.classList.add('is-visible');
        });
      });
    }, 180);
  });
}

document.addEventListener('DOMContentLoaded', loadHeader);
