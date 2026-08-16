/* ── Pagar / Checkout page ──────────────────────────────────────────────────── */
(function () {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || '';

  let course = null;

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const form         = document.getElementById('pagar-form');
  const btnPay       = document.getElementById('btn-pay');
  const btnPayText   = document.getElementById('btn-pay-text');
  const successBox   = document.getElementById('pagar-success');
  const errorBox     = document.getElementById('pagar-error');
  const errorMsg     = document.getElementById('pagar-error-msg');
  const overlay      = document.getElementById('processing-overlay');
  const summaryLoad  = document.getElementById('summary-loading');
  const summaryBody  = document.getElementById('summary-content');

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function fmt(p) { return `S/ ${Number(p).toFixed(0)}`; }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.classList.remove('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearError() { errorBox.classList.add('hidden'); }

  function setField(id, ok, errId, msg) {
    const el = document.getElementById(id);
    if (!el) return ok;
    el.classList.toggle('invalid', !ok);
    const errEl = document.getElementById(errId);
    if (errEl) errEl.textContent = ok ? '' : msg;
    return ok;
  }

  // ── Comprobante toggle ───────────────────────────────────────────────────────
  const lblBoleta   = document.getElementById('lbl-boleta');
  const lblFactura  = document.getElementById('lbl-factura');
  const bFields     = document.getElementById('comp-boleta-fields');
  const fFields     = document.getElementById('comp-factura-fields');

  document.querySelectorAll('input[name="comprobante_type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isFact = radio.value === 'factura';
      lblBoleta.classList.toggle('selected', !isFact);
      lblFactura.classList.toggle('selected', isFact);
      bFields.classList.toggle('hidden', isFact);
      fFields.classList.toggle('hidden', !isFact);
    });
  });

  // ── Card number formatting ───────────────────────────────────────────────────
  document.getElementById('card_number')?.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 16);
    this.value = v.replace(/(.{4})/g, '$1 ').trim();
  });

  document.getElementById('card_expiry')?.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });

  // ── Load course ─────────────────────────────────────────────────────────────
  async function loadCourse() {
    if (!slug) { window.location.href = 'academia.html'; return; }

    try {
      const resp = await fetch(`${window.API_BASE}/api/courses/${encodeURIComponent(slug)}`);
      if (!resp.ok) throw new Error('not found');
      course = await resp.json();

      const bc = document.getElementById('breadcrumb-course');
      if (bc) { bc.textContent = course.title; bc.href = `curso.html?slug=${encodeURIComponent(slug)}`; }

      document.getElementById('summary-title').textContent   = course.title;
      document.getElementById('summary-price').textContent   = fmt(course.price);
      document.getElementById('summary-subtotal').textContent = fmt(course.price);
      document.getElementById('summary-total').textContent   = fmt(course.price);
      document.title = `Inscripción — ${course.title} | Academia Katarzyna`;

      const imgEl = document.getElementById('summary-img');
      if (course.image_url) {
        imgEl.src = course.image_url;
        imgEl.alt = course.title;
      } else {
        const thumb = document.querySelector('.summary-thumb');
        if (thumb) thumb.style.background = 'var(--brand-blue,#06186d)';
        imgEl.style.display = 'none';
      }

      if (course.original_price && course.original_price > course.price) {
        const orig = document.getElementById('summary-original');
        if (orig) { orig.textContent = fmt(course.original_price); orig.classList.remove('hidden'); }
      }

      btnPayText.textContent = `Pagar ${fmt(course.price)}`;

      if (course.moodle_course_id) {
        const moodleBtn = document.getElementById('btn-go-moodle');
        if (moodleBtn) moodleBtn.href = `https://cursos.katarzyna.pe/course/view.php?id=${course.moodle_course_id}`;
      }

      summaryLoad.classList.add('hidden');
      summaryBody.classList.remove('hidden');
    } catch {
      window.location.href = 'academia.html';
    }
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    let ok = true;
    const name   = document.getElementById('student_name');
    const email  = document.getElementById('student_email');
    const email2 = document.getElementById('student_email2');
    const isFact = document.querySelector('input[name="comprobante_type"]:checked')?.value === 'factura';

    // Clear all errors
    ['err-name','err-email','err-email2','err-taxpayer-boleta','err-ruc','err-razon']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    [name, email, email2].forEach(el => el?.classList.remove('invalid'));

    if (!name?.value.trim()) {
      setField('student_name', false, 'err-name', 'El nombre es requerido.');
      ok = false;
    }

    const emailVal = (email?.value || '').trim().toLowerCase();
    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      setField('student_email', false, 'err-email', 'Ingresa un correo válido.');
      ok = false;
    }

    const email2Val = (email2?.value || '').trim().toLowerCase();
    if (emailVal !== email2Val) {
      setField('student_email2', false, 'err-email2', 'Los correos no coinciden.');
      ok = false;
    }

    if (!isFact) {
      const dni = (document.getElementById('taxpayer_id_boleta')?.value || '').replace(/\D/g, '');
      if (!dni || dni.length !== 8) {
        setField('taxpayer_id_boleta', false, 'err-taxpayer-boleta', 'Ingresa tu DNI (8 dígitos).');
        ok = false;
      }
    } else {
      const ruc = (document.getElementById('taxpayer_ruc')?.value || '').replace(/\D/g, '');
      if (!ruc || ruc.length !== 11) {
        setField('taxpayer_ruc', false, 'err-ruc', 'Ingresa un RUC válido (11 dígitos).');
        ok = false;
      }
      const razon = (document.getElementById('taxpayer_razon')?.value || '').trim();
      if (!razon) {
        setField('taxpayer_razon', false, 'err-razon', 'La razón social es requerida.');
        ok = false;
      }
    }

    return ok;
  }

  // ── Form submit ──────────────────────────────────────────────────────────────
  if (!form) {
    console.error('[pagar] #pagar-form not found in DOM');
  } else {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearError();
      if (!validate()) return;
      if (!course) { showError('Error cargando el curso. Recarga la página.'); return; }

      const isFact = document.querySelector('input[name="comprobante_type"]:checked')?.value === 'factura';
      const taxpayer_id   = isFact
        ? (document.getElementById('taxpayer_ruc')?.value || '').replace(/\D/g, '')
        : (document.getElementById('taxpayer_id_boleta')?.value || '').replace(/\D/g, '');
      const taxpayer_name = isFact
        ? (document.getElementById('taxpayer_razon')?.value || '').trim()
        : (document.getElementById('student_name')?.value || '').trim();

      // Show processing overlay
      overlay?.classList.remove('hidden');
      btnPay.disabled = true;

      // Simulate 2-second processing delay for realistic UX
      await new Promise(r => setTimeout(r, 2000));

      try {
        const resp = await fetch(`${window.API_BASE}/api/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_slug:      course.slug,
            student_name:     document.getElementById('student_name').value.trim(),
            student_email:    document.getElementById('student_email').value.trim().toLowerCase(),
            comprobante_type: isFact ? 'factura' : 'boleta',
            taxpayer_id,
            taxpayer_name,
          }),
        });

        overlay?.classList.add('hidden');

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          showError(data.error || `Error ${resp.status} al procesar la solicitud.`);
          btnPay.disabled = false;
          return;
        }

        // ── Success ──
        document.getElementById('success-order-ref').textContent  = data.order_ref || `#${data.order_id}`;
        document.getElementById('success-course-name').textContent = data.course_title || course.title;
        document.getElementById('success-email-addr').textContent  =
          document.getElementById('student_email').value.trim().toLowerCase();

        if (data.moodle_course_id) {
          const btn = document.getElementById('btn-go-moodle');
          if (btn) btn.href = `https://cursos.katarzyna.pe/course/view.php?id=${data.moodle_course_id}`;
        }

        form.classList.add('hidden');
        successBox.classList.remove('hidden');
        successBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Mark steps done
        document.querySelectorAll('.pagar-step').forEach(s => {
          s.classList.add('done');
          s.classList.remove('active');
        });

      } catch (err) {
        overlay?.classList.add('hidden');
        showError('Hubo un problema de conexión. Intenta nuevamente.');
        btnPay.disabled = false;
      }
    });
  }

  loadCourse();
})();
