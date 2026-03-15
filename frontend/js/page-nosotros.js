function decodeHtmlValue(value) {
  const html = value || '';
  if (!html || !html.includes('&')) return html;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.value;
}

function safeText(value) {
  return (value || '').toString();
}

async function loadNosotrosPage() {
  const page = 'nosotros';
  const data = await fetchPageData(page);
  const story = data.story || {};
  const about = data.about || {};
  const team = data.team || [];
  const teamMeta = data.team_meta || {};
  renderStory(story);
  renderNosotrosMessage(about);
  renderTeam(team, teamMeta);
}

async function fetchPageData(page) {
  try {
    if (window.apiClient?.getPage) {
      return await window.apiClient.getPage(page);
    }
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/page/${page}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // fallback
  }
  return {};
}

function renderStory(story) {
  const container = document.querySelector('.story-text');
  const titleEl = document.querySelector('.story-title');
  const imageWrap = document.querySelector('.story-image');
  const imageEl = imageWrap ? imageWrap.querySelector('img') : null;
  if (!container) return;

  const title = story.title || 'Nuestra historia';
  const imageUrl = story.image_url || story.image || '';
  const paragraphs = story.paragraphs || [];

  if (titleEl) {
    titleEl.innerHTML = decodeHtmlValue(title);
  }

  container.innerHTML = '';
  if (imageWrap) {
    if (imageUrl) {
      if (imageEl) {
        imageEl.src = imageUrl;
        imageEl.alt = safeText(title) || 'Nuestra historia';
      }
      imageWrap.style.display = '';
    } else {
      imageWrap.style.display = 'none';
    }
  }

  if (story.html) {
    const body = document.createElement('div');
    body.innerHTML = decodeHtmlValue(story.html);
    container.appendChild(body);
    return;
  }

  paragraphs.forEach((p) => {
    if (!p) return;
    const el = document.createElement('p');
    el.textContent = p;
    container.appendChild(el);
  });
}

function renderNosotrosMessage(about) {
  const section = document.getElementById('nosotros-message-section');
  const titleEl = document.getElementById('nosotros-message-title');
  const contentEl = document.getElementById('nosotros-message-content');
  const primaryEl = document.getElementById('nosotros-message-primary');
  const secondaryEl = document.getElementById('nosotros-message-secondary');
  if (!section || !titleEl || !contentEl || !primaryEl || !secondaryEl) return;

  const hasTitle = !!safeText(about.title).trim();
  const hasContent = !!safeText(about.content).trim();
  const hasPrimary = !!safeText(about.primary_label).trim() && !!safeText(about.primary_href).trim();
  const hasSecondary = !!safeText(about.secondary_label).trim() && !!safeText(about.secondary_href).trim();

  if (!hasTitle && !hasContent && !hasPrimary && !hasSecondary) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  titleEl.innerHTML = decodeHtmlValue(about.title || '');
  contentEl.innerHTML = decodeHtmlValue(about.content || '');

  primaryEl.textContent = about.primary_label || '';
  primaryEl.href = about.primary_href || '#';
  primaryEl.style.display = hasPrimary ? '' : 'none';

  secondaryEl.textContent = about.secondary_label || '';
  secondaryEl.href = about.secondary_href || '#';
  secondaryEl.style.display = hasSecondary ? '' : 'none';
}

function renderTeam(team, teamMeta) {
  const grid = document.querySelector('.team-grid');
  const header = document.querySelector('.team-header');
  if (header) {
    const titleEl = header.querySelector('h2');
    const subEl = header.querySelector('p');
    if (titleEl) titleEl.textContent = teamMeta.title || 'Conoce a nuestro equipo';
    if (subEl) subEl.textContent = teamMeta.subtitle || 'Especialistas en tributacion y corporativo, listos para acompanar tus decisiones.';
  }
  if (!grid) return;
  const members = team && team.length ? team : [];
  if (!members.length) return;
  grid.innerHTML = '';
  members.forEach((member) => {
    const card = document.createElement('article');
    card.className = 'team-card';
    card.innerHTML = `
      <div class="team-photo">
        <img src="${safeText(member.image_url || member.image)}" alt="${safeText(member.name) || 'Miembro del equipo'}" />
        <div class="team-overlay">
          <a class="team-link team-linkedin" href="${safeText(member.linkedin || '#')}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
            <img src="./assets/icons/linkedin.png" alt="" />
          </a>
        </div>
      </div>
      <h3>${safeText(member.name)}</h3>
      <p>${safeText(member.role)}</p>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body?.dataset?.page;
  if (page === 'nosotros') {
    loadNosotrosPage();
  }
});
