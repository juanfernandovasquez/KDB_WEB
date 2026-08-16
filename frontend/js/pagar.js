/* ── Pagar / Checkout page ──────────────────────────────────────────────────── */
(function () {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || '';

  let course = null;
  let voucherUrl = null;

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

  // ── Payment tabs ─────────────────────────────────────────────────────────────
  const transferPanel = document.getElementById('pay-panel-transfer');
  const cardPanel     = document.getElementById('pay-panel-card');

  document.querySelectorAll('.pay-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pay-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const isCard = tab.dataset.tab === 'card';
      transferPanel.classList.toggle('hidden', isCard);
      cardPanel.classList.toggle('hidden', !isCard);
    });
  });

  // ── Payment method picker (Yape / Plin / Transferencia) ───────────────────
  const instrYape = document.getElementById('instr-yape');
  const instrPlin = document.getElementById('instr-plin');
  const instrBank = document.getElementById('instr-bank');

  document.querySelectorAll('input[name="pay_method"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.pay-method-opt').forEach(el => el.classList.remove('selected'));
      radio.closest('.pay-method-opt')?.classList.add('selected');

      instrYape?.classList.add('hidden');
      instrPlin?.classList.add('hidden');
      instrBank?.classList.add('hidden');

      if (radio.value === 'yape')         instrYape?.classList.remove('hidden');
      else if (radio.value === 'plin')    instrPlin?.classList.remove('hidden');
      else if (radio.value === 'transferencia') instrBank?.classList.remove('hidden');
    });
  });

  // ── Voucher upload ───────────────────────────────────────────────────────────
  const voucherFile     = document.getElementById('voucher-file');
  const voucherDropzone = document.getElementById('voucher-dropzone');
  const voucherEmpty    = document.getElementById('voucher-empty');
  const voucherPreview  = document.getElementById('voucher-preview');
  const voucherUploading = document.getElementById('voucher-uploading');
  const voucherThumb    = document.getElementById('voucher-thumb');
  const voucherUrlInput = document.getElementById('voucher-url');
  const voucherBrowse   = document.getElementById('voucher-browse');
  const voucherRemove   = document.getElementById('voucher-remove');

  if (voucherBrowse) voucherBrowse.addEventListener('click', () => voucherFile?.click());

  if (voucherDropzone) {
    voucherDropzone.addEventListener('dragover', e => { e.preventDefault(); voucherDropzone.classList.add('dragover'); });
    voucherDropzone.addEventListener('dragleave', () => voucherDropzone.classList.remove('dragover'));
    voucherDropzone.addEventListener('drop', e => {
      e.preventDefault();
      voucherDropzone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleVoucherFile(file);
    });
  }

  if (voucherFile) {
    voucherFile.addEventListener('change', () => {
      const file = voucherFile.files?.[0];
      if (file) handleVoucherFile(file);
    });
  }

  if (voucherRemove) {
    voucherRemove.addEventListener('click', () => {
      voucherUrl = null;
      voucherUrlInput.value = '';
      voucherFile.value = '';
      voucherPreview?.classList.add('hidden');
      voucherEmpty?.classList.remove('hidden');
    });
  }

  async function handleVoucherFile(file) {
    const MAX_MB = 5;
    const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
    const errEl = document.getElementById('err-voucher');

    if (!allowed.includes(file.type)) {
      if (errEl) errEl.textContent = 'Formato no permitido. Usa JPG, PNG, WebP o PDF.';
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      if (errEl) errEl.textContent = `El archivo supera ${MAX_MB} MB.`;
      return;
    }
    if (errEl) errEl.textContent = '';

    voucherEmpty?.classList.add('hidden');
    voucherPreview?.classList.add('hidden');
    voucherUploading?.classList.remove('hidden');

    try {
      const presignRes = await fetch(`${window.API_BASE}/api/checkout/voucher-presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_type: file.type }),
      });

      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || 'Error al obtener URL de subida.');
      }

      const { upload_url, public_url } = await presignRes.json();

      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Error al subir el archivo.');

      voucherUrl = public_url;
      voucherUrlInput.value = public_url;

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { if (voucherThumb) voucherThumb.src = e.target.result; };
        reader.readAsDataURL(file);
      } else {
        if (voucherThumb) {
          voucherThumb.src = '';
          voucherThumb.alt = '';
          voucherThumb.style.display = 'none';
        }
      }

      voucherUploading?.classList.add('hidden');
      voucherPreview?.classList.remove('hidden');
      if (file.type === 'application/pdf') {
        const nameEl = voucherPreview?.querySelector('#voucher-filename');
        if (nameEl) nameEl.textContent = file.name;
      }

    } catch (err) {
      voucherUploading?.classList.add('hidden');
      voucherEmpty?.classList.remove('hidden');
      if (errEl) errEl.textContent = err.message || 'Error al subir el archivo. Intenta de nuevo.';
    }
  }

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

      btnPayText.textContent = `Confirmar inscripción · ${fmt(course.price)}`;

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

  // ── Get active payment method ────────────────────────────────────────────────
  function getPaymentMethod() {
    const activeTab = document.querySelector('.pay-tab.active');
    if (activeTab?.dataset?.tab === 'card') return { method: 'tarjeta', detail: null };

    const checked = document.querySelector('input[name="pay_method"]:checked');
    return { method: checked?.value || 'yape', detail: null };
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

      const { method: payment_method } = getPaymentMethod();

      overlay?.classList.remove('hidden');
      btnPay.disabled = true;

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
            payment_method,
            voucher_url:      voucherUrl || undefined,
          }),
        });

        overlay?.classList.add('hidden');

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          showError(data.error || `Error ${resp.status} al procesar la solicitud.`);
          btnPay.disabled = false;
          return;
        }

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
