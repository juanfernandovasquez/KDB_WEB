// Cliente ligero para consumir la API del backend (frontend desacoplado)
const API_BASE = window.API_BASE || '';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  return res.json();
}

async function getCompany() {
  return apiGet('/api/company');
}

async function getPage(page) {
  return apiGet(`/api/page/${page}`);
}

async function subscribe(email, acceptedTerms = false) {
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, accepted_terms: !!acceptedTerms }),
  });
  if (!res.ok) {
    let err = "Error al suscribir";
    try {
      const data = await res.json();
      err = data.error || err;
    } catch (_) {}
    throw new Error(err);
  }
  return res.json();
}

window.apiClient = { getCompany, getPage, subscribe };
