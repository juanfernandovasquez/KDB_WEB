async function loadFooter() {
  const target = document.getElementById('site-footer');
  if (!target) return;
  const resp = await fetch('./partials/footer.html');
  const html = await resp.text();
  target.outerHTML = html;
  await populateFooter();
  await applyFooterVisibility();
  window.dispatchEvent(new CustomEvent('footer:loaded'));
}

async function populateFooter() {
  const info = await fetchCompanyData();
  const footer = document.querySelector('footer');
  if (!footer) return;
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el && value) el.textContent = value;
  };
  const setLink = (id, href) => {
    const el = document.getElementById(id);
    if (el && href) el.href = href;
  };

  setText('footer-tagline', info.tagline);
  setText('footer-address', info.address);
  setText('footer-phone', info.phone);
  setText('footer-email', info.email);

  setLink('footer-linkedin', info.linkedin);
  setLink('footer-facebook', info.facebook);
  setLink('footer-instagram', info.instagram);
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
  } catch (e) {
    // fallback
  }
  return window.companyInfo || {};
}

async function applyFooterVisibility() {
  const footer = document.querySelector('footer');
  if (!footer) return;
  try {
    const pages = window.pageVisibility || await fetchPageVisibility();
    if (!pages) return;
    footer.querySelectorAll('[data-page-key]').forEach((el) => {
      const key = el.dataset.pageKey;
      if (!key) return;
      if (pages[key] === false) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    });
  } catch (_) {
    // ignore visibility failures
  }
}

async function fetchPageVisibility() {
  try {
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/pages`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.pages || null;
  } catch (_) {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', loadFooter);
