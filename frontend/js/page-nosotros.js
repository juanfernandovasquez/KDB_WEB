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

function normalizeRichText(value) {
  const html = decodeHtmlValue(value).trim();
  if (!html) return '';
  return /<[^>]+>/.test(html) ? html : `<p>${html}</p>`;
}

function stripHtml(value) {
  const html = decodeHtmlValue(value);
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
}

function buildExcerpt(value, maxLength = 110) {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const firstSentence = text.match(/.+?[.!?](\s|$)/);
  const source = firstSentence ? firstSentence[0].trim() : text;
  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength).trimEnd()}...`;
}

let currentTeamMembers = [];

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

  const hasContent = !!safeText(about.content).trim();

  if (!hasContent) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  titleEl.innerHTML = '';
  titleEl.style.display = 'none';
  contentEl.innerHTML = normalizeRichText(about.content || '');
  primaryEl.style.display = 'none';
  secondaryEl.style.display = 'none';
}

function renderTeam(team, teamMeta) {
  const grid = document.querySelector('.team-grid');
  const header = document.querySelector('.team-header');
  if (header) {
    const titleEl = header.querySelector('h2');
    const subEl = header.querySelector('p');
    if (titleEl) titleEl.innerHTML = teamMeta.title || 'Conoce a <strong>nuestro equipo</strong>';
    if (subEl) subEl.textContent = teamMeta.subtitle || 'Especialistas en tributacion y corporativo, listos para acompanar tus decisiones.';
  }
  if (!grid) return;
  const members = team && team.length ? team : [];
  if (!members.length) return;
  currentTeamMembers = members;
  grid.innerHTML = '';
  members.forEach((member, idx) => {
    const linkedin = safeText(member.linkedin || '#');
    const description = safeText(member.more_url);
    const hoverDescription = buildExcerpt(description);
    const hasLinkedin = linkedin && linkedin !== '#';
    const card = document.createElement('article');
    card.className = 'team-card';
    card.dataset.memberIndex = String(idx);
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="team-photo">
        <img src="${safeText(member.image_url || member.image)}" alt="${safeText(member.name) || 'Miembro del equipo'}" />
        <div class="team-overlay team-overlay-default">
          <div class="team-meta">
            <h3>${safeText(member.name)}</h3>
            <p>${safeText(member.role)}</p>
          </div>
        </div>
        <div class="team-overlay team-overlay-hover">
          <div class="team-hover-copy">
            <h3>${safeText(member.name)}</h3>
            <p class="team-hover-role">${safeText(member.role)}</p>
            <div class="team-hover-divider"></div>
            <p class="team-hover-description">${hoverDescription}</p>
          </div>
          <a class="team-link team-linkedin${hasLinkedin ? '' : ' is-hidden'}" href="${linkedin || '#'}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
            <img src="./assets/icons/linkedin.png" alt="" />
          </a>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openTeamModal(member) {
  const modal = document.getElementById('team-modal');
  if (!modal || !member) return;
  const image = document.getElementById('team-modal-image');
  const name = document.getElementById('team-modal-name');
  const role = document.getElementById('team-modal-role');
  const description = document.getElementById('team-modal-description');
  const linkedin = document.getElementById('team-modal-linkedin');

  if (image) {
    image.src = safeText(member.image_url || member.image);
    image.alt = safeText(member.name) || 'Miembro del equipo';
  }
  if (name) name.textContent = safeText(member.name);
  if (role) role.textContent = safeText(member.role);
  if (description) description.innerHTML = normalizeRichText(member.more_url);
  if (linkedin) {
    const href = safeText(member.linkedin || '#');
    linkedin.href = href || '#';
    linkedin.style.display = href && href !== '#' ? '' : 'none';
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('team-modal-open');
}

function closeTeamModal() {
  const modal = document.getElementById('team-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('team-modal-open');
}

function bindTeamModal() {
  const grid = document.querySelector('.team-grid');
  const closeBtn = document.getElementById('team-modal-close');
  const backdrop = document.getElementById('team-modal-backdrop');
  if (grid && !grid.dataset.modalBound) {
    grid.dataset.modalBound = '1';
    grid.addEventListener('click', (event) => {
      const card = event.target.closest('.team-card');
      if (!card) return;
      const idx = Number(card.dataset.memberIndex);
      openTeamModal(currentTeamMembers[idx]);
    });
    grid.addEventListener('keydown', (event) => {
      const card = event.target.closest('.team-card');
      if (!card) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const idx = Number(card.dataset.memberIndex);
      openTeamModal(currentTeamMembers[idx]);
    });
  }
  if (closeBtn && !closeBtn.dataset.modalBound) {
    closeBtn.dataset.modalBound = '1';
    closeBtn.addEventListener('click', closeTeamModal);
  }
  if (backdrop && !backdrop.dataset.modalBound) {
    backdrop.dataset.modalBound = '1';
    backdrop.addEventListener('click', closeTeamModal);
  }
  if (!document.body.dataset.teamModalBound) {
    document.body.dataset.teamModalBound = '1';
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeTeamModal();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body?.dataset?.page;
  if (page === 'nosotros') {
    bindTeamModal();
    loadNosotrosPage();
  }
});
