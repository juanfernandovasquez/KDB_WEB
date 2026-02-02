async function loadNosotrosPage() {
  const page = 'nosotros';
  const data = await fetchPageData(page);
  const story = data.story || {};
  const team = data.team || [];
  const teamMeta = data.team_meta || {};
  renderStory(story);
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
  if (!container) return;
  const imageWrap = document.querySelector('.story-image');
  const imageEl = imageWrap ? imageWrap.querySelector('img') : null;
  const title = story.title || 'Nuestra historia';
  const imageUrl = story.image_url || story.image || '';
  const paragraphs = story.paragraphs || [];
  container.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  container.appendChild(h2);
  if (imageWrap) {
    if (imageUrl) {
      if (imageEl) {
        imageEl.src = imageUrl;
        imageEl.alt = title || 'Nuestra historia';
      }
      imageWrap.style.display = '';
    } else {
      imageWrap.style.display = 'none';
    }
  }
  if (story.html) {
    const body = document.createElement('div');
    body.innerHTML = story.html;
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

function renderTeam(team, teamMeta) {
  const grid = document.querySelector('.team-grid');
  const header = document.querySelector('.team-header');
  if (header) {
    const titleEl = header.querySelector('h2');
    const subEl = header.querySelector('p');
    if (titleEl) titleEl.textContent = teamMeta.title || 'Conoce a nuestro equipo';
    if (subEl) subEl.textContent = teamMeta.subtitle || 'Especialistas en tributación y corporativo, listos para acompañar tus decisiones.';
  }
  if (!grid) return;
  const members = team && team.length ? team : [];
  if (!members.length) return;
  grid.innerHTML = '';
  const safe = (val) => (val || '').toString();
  members.forEach((member) => {
    const card = document.createElement('article');
    card.className = 'team-card';
    card.innerHTML = `
      <div class="team-photo">
        <img src="${safe(member.image_url || member.image)}" alt="${safe(member.name) || 'Miembro del equipo'}" />
        <div class="team-overlay">
          <a class="team-link team-linkedin" href="${safe(member.linkedin || '#')}" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
            <img src="./assets/icons/linkedin.png" alt="" />
          </a>
        </div>
      </div>
      <h3>${safe(member.name)}</h3>
      <p>${safe(member.role)}</p>
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

