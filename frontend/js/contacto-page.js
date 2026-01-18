document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('contact-status');
  const submitBtn = form?.querySelector('button[type="submit"]');

  const setStatus = (message, type) => {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('success', type === 'success');
    status.classList.toggle('error', type === 'error');
  };

  const setInfo = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '';
  };

  const loadCompanyInfo = async () => {
    try {
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/company`);
      if (!res.ok) return;
      const info = await res.json();
      setInfo('contact-address', info.address);
      setInfo('contact-phone-text', info.phone);
      setInfo('contact-email-text', info.email);
    } catch (_) {
      // ignore
    }
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    if (!form || !submitBtn) return;
    const payload = {
      name: document.getElementById('contact-name')?.value.trim(),
      email: document.getElementById('contact-email')?.value.trim(),
      phone: document.getElementById('contact-phone')?.value.trim(),
      subject: document.getElementById('contact-subject')?.value.trim(),
      message: document.getElementById('contact-message')?.value.trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      setStatus('Completa los campos obligatorios.', 'error');
      return;
    }

    submitBtn.disabled = true;
    setStatus('Enviando mensaje...', '');
    try {
      const base = window.API_BASE || '';
      const res = await fetch(`${base}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || 'No se pudo enviar el mensaje.', 'error');
        return;
      }
      form.reset();
      setStatus('Mensaje enviado. Te responderemos pronto.', 'success');
    } catch (_) {
      setStatus('No se pudo enviar el mensaje.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  };

  form?.addEventListener('submit', onSubmit);
  loadCompanyInfo();
});
