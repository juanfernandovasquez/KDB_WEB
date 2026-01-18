// Configuración global de API
// Prioridad:
// 1) Si window.API_BASE ya está definido, se respeta.
// 2) Si estamos en file:// o el frontend se sirve en puerto distinto a 5000, usar backend local fijo 127.0.0.1:5000.
// 3) En cualquier otra página/puerto (ya en 5000), usar el mismo origin del frontend.
(() => {
  if (window.API_BASE) return;
  const { protocol, origin, port } = window.location;
  if (protocol === 'file:' || (port && port !== '5000')) {
    window.API_BASE = 'http://127.0.0.1:5000';
  } else {
    window.API_BASE = origin || 'http://127.0.0.1:5000';
  }
})();
