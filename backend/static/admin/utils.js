export const q = (id) => document.getElementById(id);

export const setText = (id, val) => {
  const el = q(id);
  if (el) el.textContent = val || "";
};

export const getVal = (id) => (q(id)?.value || "").trim();
export const setVal = (id, val) => {
  const el = q(id);
  if (el) el.value = val || "";
};

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const statusMsg = (id, msg) => setText(id, msg);

export const debounce = (fn, wait = 250) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

export const safeHtml = (str) => {
  const s = str == null ? "" : String(str);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};
