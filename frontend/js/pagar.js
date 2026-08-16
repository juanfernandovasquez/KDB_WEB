/* Pagar / Checkout page */
(function () {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || '';

  let course = null;

  const form = document.getElementById('pagar-form');
  const btnPay = document.getElementById('btn-pay');
  const btnPayText = document.getElementById('btn-pay-text');
  const successBox = document.getElementById('pagar-success');
  const errorBox = document.getElementById('pagar-error');
  const errorMsg = document.getElementById('pagar-error-msg');

  // Summary elements
  const summaryLoading = document.getElementById('summary-loading');
  const summaryContent = document.getElementById('summary-content');

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(p) {
    return `S/ ${Number(p).toFixed(0)}`;
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorBox.classList.add('hidden');
  }

  async function loadCourse() {
    if (!slug) {
      window.location.href = 'academia.html';
      return;
    }

    try {
      const resp = await fetch(`${window.API_BASE}/api/courses/${encodeURIComponent(slug)}`);
      if (!resp.ok) throw new Error('not found');
      course = await resp.json();

      // Update breadcrumb
      const bc = document.getElementById('breadcrumb-course');
      bc.textContent = course.title;
      bc.href = `curso.html?slug=${encodeURIComponent(course.slug)}`;

      // Update summary
      document.getElementById('summary-title').textContent = course.title;
      document.getElementById('summary-price').textContent = formatPrice(course.price);
      document.getElementById('summary-subtotal').textContent = formatPrice(course.price);
      document.getElementById('summary-total').textContent = formatPrice(course.price);

      const imgEl = document.getElementById('summary-img');
      if (course.image_url) {
        imgEl.src = course.image_url;
        imgEl.alt = course.title;
      } else {
        document.querySelector('.summary-thumb').style.background = 'var(--brand-blue,#06186d)';
        imgEl.style.display = 'none';
      }

      if (course.original_price && course.original_price > course.price) {
        const origEl = document.getElementById('summary-original');
        origEl.textContent = formatPrice(course.original_price);
        origEl.classList.remove('hidden');
      }

      // Update buy button label
      btnPayText.textContent = `Pagar ${formatPrice(course.price)}`;

      summaryLoading.classList.add('hidden');
      summaryContent.classList.remove('hidden');
    } catch {
      window.location.href = 'academia.html';
    }
  }

  // Card number formatting
  const cardInput = document.getElementById('card_number');
  cardInput?.addEventListener('input', () => {
    let v = cardInput.value.replace(/\D/g, '').slice(0, 16);
    cardInput.value = v.replace(/(.{4})/g, '$1 ').trim();
  });

  // Expiry formatting
  const expiryInput = document.getElementById('card_expiry');
  expiryInput?.addEventListener('input', () => {
    let v = expiryInput.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    expiryInput.value = v;
  });

  function validate() {
    let ok = true;

    const name = document.getElementById('student_name');
    const email = document.getElementById('student_email');
    const email2 = document.getElementById('student_email2');

    document.getElementById('err-name').textContent = '';
    document.getElementById('err-email').textContent = '';
    document.getElementById('err-email2').textContent = '';
    name.classList.remove('invalid');
    email.classList.remove('invalid');
    email2.classList.remove('invalid');

    if (!name.value.trim()) {
      document.getElementById('err-name').textContent = 'El nombre es requerido.';
      name.classList.add('invalid');
      ok = false;
    }

    const emailVal = email.value.trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal || !emailRe.test(emailVal)) {
      document.getElementById('err-email').textContent = 'Ingresa un email válido.';
      email.classList.add('invalid');
      ok = false;
    }

    if (email.value.trim().toLowerCase() !== email2.value.trim().toLowerCase()) {
      document.getElementById('err-email2').textContent = 'Los correos no coinciden.';
      email2.classList.add('invalid');
      ok = false;
    }

    return ok;
  }

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    hideError();

    if (!validate()) return;
    if (!course) return;

    btnPay.disabled = true;
    btnPayText.textContent = 'Procesando…';

    try {
      const resp = await fetch(`${window.API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_slug: course.slug,
          student_name: document.getElementById('student_name').value.trim(),
          student_email: document.getElementById('student_email').value.trim().toLowerCase(),
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        showError(data.error || 'Error al procesar la solicitud.');
        btnPay.disabled = false;
        btnPayText.textContent = `Pagar ${formatPrice(course.price)}`;
        return;
      }

      // Show success
      document.getElementById('success-course-name').textContent = data.course_title || course.title;
      document.getElementById('success-email-addr').textContent =
        document.getElementById('student_email').value.trim().toLowerCase();

      form.classList.add('hidden');
      successBox.classList.remove('hidden');

      // Mark steps done
      document.querySelectorAll('.pagar-step').forEach((s) => {
        s.classList.add('done');
        s.classList.remove('active');
      });

    } catch {
      showError('Hubo un problema de conexión. Intenta de nuevo.');
      btnPay.disabled = false;
      btnPayText.textContent = `Pagar ${formatPrice(course ? course.price : 0)}`;
    }
  });

  loadCourse();
})();
