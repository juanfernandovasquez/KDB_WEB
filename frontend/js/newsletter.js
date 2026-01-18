let newsletterBound = false;

function bindNewsletter() {
  if (newsletterBound) return;
  const form = document.getElementById('newsletter-form');
  const input = document.getElementById('newsletter-email');
  const termsInput = document.getElementById('newsletter-terms');
  const alertBox = document.getElementById('newsletter-alert');
  const alertText = document.getElementById('newsletter-alert-text');
  const alertClose = document.getElementById('newsletter-alert-close');

  if (!form || !input || !termsInput || !alertBox || !alertText || !alertClose) return;
  newsletterBound = true;

  const showAlert = (msg, isError = false) => {
    if (!msg) return hideAlert();
    alertBox.classList.toggle('error', isError);
    alertBox.classList.remove('hidden');
    alertText.textContent = msg;
  };

  const hideAlert = () => {
    alertBox.classList.add('hidden');
    alertBox.classList.remove('error');
    alertText.textContent = '';
  };

  alertClose.addEventListener('click', hideAlert);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const email = (input.value || '').trim();
    if (!email) return showAlert('Ingresa un email valido', true);
    if (!termsInput.checked) return showAlert('Debes aceptar los terminos y condiciones', true);
    const base = window.API_BASE || '';
    const url = `${base}/subscribe`;
    console.log('[newsletter] submit', email, '->', url);
    try {
      if (window.apiClient?.subscribe) {
        await window.apiClient.subscribe(email, true);
      } else {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, accepted_terms: true }),
        });
        console.log('[newsletter] response status', res.status);
        if (!res.ok) {
          let err = 'Error al suscribir';
          try {
            const data = await res.json();
            err = data.error || err;
          } catch (_) {}
          throw new Error(err);
        }
      }
      showAlert('Gracias por suscribirte!', false);
      form.reset();
    } catch (err) {
      console.error('[newsletter] error', err);
      showAlert(err.message || 'Error al suscribir', true);
    }
  });
}

document.addEventListener('DOMContentLoaded', bindNewsletter);
window.addEventListener('footer:loaded', bindNewsletter);


