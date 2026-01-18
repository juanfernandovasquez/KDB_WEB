async function loadLegalPage() {
  const page = document.body?.dataset?.page;
  const legalPages = new Set(['cookies', 'terminos', 'privacidad']);
  if (!legalPages.has(page)) return;

  const fetchPageData = async () => {
    try {
      if (window.apiClient?.getPage) {
        return await window.apiClient.getPage(page);
      }
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/page/${page}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {
      // ignore and keep static content
    }
    return {};
  };

  const data = await fetchPageData();
  const story = data.story || {};
  const titleEl = document.querySelector('.legal-hero h1');
  const subtitleEl = document.querySelector('.legal-hero p');
  const bodyEl = document.getElementById('legal-body');

  if (titleEl && story.title) {
    titleEl.textContent = story.title;
  }

  if (!bodyEl) return;
  const paragraphs = Array.isArray(story.paragraphs) ? story.paragraphs.filter(Boolean) : [];

  if (story.html) {
    bodyEl.innerHTML = story.html;
    return;
  }

  if (paragraphs.length) {
    if (subtitleEl) subtitleEl.textContent = paragraphs[0];
    bodyEl.innerHTML = paragraphs.slice(1).map((p) => `<p>${p}</p>`).join('');
  }
}

document.addEventListener('DOMContentLoaded', loadLegalPage);
