// Configuracion estatica para pruebas locales (Live Server)
// Este archivo centraliza heroes, empresa y equipo.
window.heroConfigByPage = {
  home: {
    intervalMs: 8000,
    slides: [
      {
        image_url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80',
        title: 'Estrategia tributaria que protege tu negocio',
        description: 'Planificacion fiscal, cumplimiento y defensa con enfoque preventivo y accionable.',
        primary_href: '#',
        primary_label: 'Conoce la firma',
        secondary_href: '#',
        secondary_label: 'Agenda una llamada'
      },
      {
        image_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80',
        title: 'Asesoria cercana y tecnica',
        description: 'Traducimos la normativa en decisiones claras para directorios, CFOs y equipos legales.',
        primary_href: '#',
        primary_label: 'Ver servicios',
        secondary_href: '#',
        secondary_label: 'Habla con un socio'
      }
    ]
  },
  nosotros: {
    intervalMs: 8000,
    slides: [
      {
        image_url: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80',
        title: 'Equipo senior en derecho tributario',
        description: 'Mas de 15 anhos guiando a empresas en planeamiento y controversias fiscales.',
        primary_href: '#historia',
        primary_label: 'Nuestra historia',
        secondary_href: '#equipo',
        secondary_label: 'Conoce al equipo'
      },
      {
        image_url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
        title: 'Rigor tecnico y enfoque practico',
        description: 'Investigacion permanente y metodologias claras para decisiones rapidas.',
        primary_href: '#equipo',
        primary_label: 'Ver socios',
        secondary_href: '#contacto',
        secondary_label: 'Contactar'
      }
    ]
  },
  servicios: {
    intervalMs: 8000,
    slides: [
      {
        image_url: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80',
        title: 'Servicios para finanzas y compliance',
        description: 'Planeamiento fiscal, reorganizaciones, due diligence y defensa en SUNAT.',
        primary_href: '#',
        primary_label: 'Explora servicios',
        secondary_href: '#contacto',
        secondary_label: 'Agenda una llamada'
      },
      {
        image_url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
        title: 'Acompanamiento integral',
        description: 'Desde la estrategia hasta la implementacion y litigio, con un solo equipo.',
        primary_href: '#',
        primary_label: 'Ver casos',
        secondary_href: '#contacto',
        secondary_label: 'Habla con un socio'
      }
    ]
  },
  productos: {
    intervalMs: 7500,
    slides: [
      {
        image_url: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1600&q=80',
        title: 'Formacion tributaria aplicada',
        description: 'Programas cortos para equipos de finanzas, legal y operaciones.',
        primary_href: '#oferta-productos',
        primary_label: 'Explora la oferta',
        secondary_href: '#contacto-productos',
        secondary_label: 'Solicita temario'
      },
      {
        image_url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80',
        title: 'Casos reales y checklists',
        description: 'Metodologia accionable para equipos que necesitan implementar rapido.',
        primary_href: '#grilla-productos',
        primary_label: 'Ver programas',
        secondary_href: '#contacto-productos',
        secondary_label: 'Habla con un especialista'
      }
    ]
  },
  kdbweb: {
    intervalMs: 8000,
    slides: [
      {
        image_url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80',
        title: 'KDBWEB',
        description: 'Recursos legales y tributarios organizados por categoria.',
        primary_href: 'kdbweb.html',
        primary_label: 'Explorar recursos',
        secondary_href: '#kdbweb-cards',
        secondary_label: 'Ver categorias'
      }
    ]
  }
};

const STATIC_COMPANY = {
  name: 'KDB Legal & Tributario',
  tagline: 'Estrategia legal y tributaria a tu medida',
  phone: '+51 999 888 666',
  email: 'contacto@kdblegal.pe',
  address: 'Av. Los Abogados 122, Lima, Peru',
  linkedin: '#',
  facebook: '#',
  instagram: '#'
};

const STATIC_PAGE_DATA = {
  nosotros: {
    team: [
      {
        name: 'Maria Gonzalez',
        role: 'Socia - Tributacion corporativa',
        image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=640&q=80',
        linkedin: '#',
        more: '#'
      },
      {
        name: 'Carlos Herrera',
        role: 'Socio - Litigios y controversias',
        image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=640&q=80',
        linkedin: '#',
        more: '#'
      },
      {
        name: 'Lucia Ramos',
        role: 'Asociada Senior - Planeamiento fiscal',
        image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=640&q=80',
        linkedin: '#',
        more: '#'
      }
    ]
  }
};

const escapeHtml = (str) =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function fetchCompanyInfo() {
  try {
    if (window.apiClient?.getCompany) {
      return await window.apiClient.getCompany();
    }
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/company`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('No se pudo obtener company info, usando fallback.', err);
  }
  return STATIC_COMPANY;
}

async function fetchHomeContent() {
  try {
    if (window.apiClient?.getPage) {
      return await window.apiClient.getPage('home');
    }
    const base = window.API_BASE || '';
    const res = await fetch(`${base}/api/page/home`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('No se pudo obtener contenido de home, usando fallback.', err);
  }
  return {};
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.textContent = value;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el && value) el.setAttribute(attr, value);
}

function applyHomeIntro(about) {
  if (!about) return;
  setText('intro-title', about.title);
  const introContent = document.getElementById('intro-content');
  if (introContent) {
    if (about.content) {
      introContent.innerHTML = about.content;
    } else {
      const lines = Array.isArray(about.content_lines) && about.content_lines.length
        ? about.content_lines
        : (about.content || '').split(/\r?\n/).filter((l) => l.trim() !== '');
      introContent.innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
    }
  }
  setAttr('intro-image', 'src', about.image_url);
  setAttr('intro-image', 'alt', about.title || 'Imagen de la empresa');
  const primaryBtn = document.getElementById('intro-primary-btn');
  const secondaryBtn = document.getElementById('intro-secondary-btn');
  const actions = document.querySelector('.intro-actions');
  const primaryLabel = (about.primary_label || '').trim();
  const secondaryLabel = (about.secondary_label || '').trim();
  const primaryHref = (about.primary_href || '').trim();
  const secondaryHref = (about.secondary_href || '').trim();
  if (primaryBtn) {
    if (primaryLabel) {
      primaryBtn.textContent = primaryLabel;
      primaryBtn.setAttribute('href', primaryHref || '#');
      primaryBtn.style.display = '';
    } else {
      primaryBtn.style.display = 'none';
    }
  }
  if (secondaryBtn) {
    if (secondaryLabel) {
      secondaryBtn.textContent = secondaryLabel;
      secondaryBtn.setAttribute('href', secondaryHref || '#');
      secondaryBtn.style.display = '';
    } else {
      secondaryBtn.style.display = 'none';
    }
  }
  if (actions) {
    const showActions =
      (primaryBtn && primaryBtn.style.display !== 'none') ||
      (secondaryBtn && secondaryBtn.style.display !== 'none');
    actions.style.display = showActions ? '' : 'none';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body?.dataset?.page;
  if (page !== 'home') return;
  const [, homeData] = await Promise.all([fetchCompanyInfo(), fetchHomeContent()]);
  if (homeData?.about) {
    applyHomeIntro(homeData.about);
  }
});
