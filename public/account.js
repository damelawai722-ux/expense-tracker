// =====================================================================
//  ACCOUNT: verify your email (for password recovery) and change your password
//  Loaded after app.js. Uses: api, jsonOpts, openModal, esc, showToast
// =====================================================================
(function () {
  function refreshAccountRows() {
    const el = document.getElementById('email-state');
    if (!el) return;
    el.textContent = window.myEmailVerified && window.myEmail
      ? '✓ Verified: ' + window.myEmail
      : 'Add a verified email to recover your account';
  }
  window.refreshAccountRows = refreshAccountRows;

  // ---------- Email: enter address -> receive 6-digit code -> confirm ----------
  function openEmailSetup() {
    const { body, close } = openModal('Email & recovery');
    let pending = '';

    function stageStart() {
      const verified = window.myEmailVerified && window.myEmail;
      body.innerHTML =
        (verified
          ? '<div style="font-size:14px;margin-bottom:12px">✓ <b>' + esc(window.myEmail) + '</b> is verified.<br>' +
            '<span class="muted small">If you forget your password, we send the code here.</span></div>'
          : '<div style="font-size:14px;margin-bottom:12px">Add an email so you can reset your password if you ever forget it. ' +
            'We’ll send a 6-digit code to confirm it’s yours.</div>') +
        '<label class="ui-field">' + (verified ? 'Change to another email' : 'Your email') +
          '<input id="em-input" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></label>' +
        '<div class="ui-error" id="em-err"></div>' +
        '<div class="ui-actions"><button class="ui-btn" id="em-close">Close</button>' +
          '<button class="ui-btn primary" id="em-send">Send code</button></div>';
      body.querySelector('#em-close').onclick = close;
      const input = body.querySelector('#em-input');
      const send = async () => {
        const btn = body.querySelector('#em-send'), err = body.querySelector('#em-err');
        err.textContent = ''; btn.disabled = true;
        const r = await api('/api/account/email/request', jsonOpts('POST', { email: input.value }));
        btn.disabled = false;
        if (!r.ok) { err.textContent = r.data.error || 'Could not send the code'; return; }
        pending = input.value.trim().toLowerCase();
        stageCode();
      };
      body.querySelector('#em-send').onclick = send;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    }

    function stageCode() {
      body.innerHTML =
        '<div style="font-size:14px;margin-bottom:12px">We sent a 6-digit code to <b>' + esc(pending) + '</b>. ' +
          'It can take a minute. Check spam too.</div>' +
        '<label class="ui-field">6-digit code<input id="em-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" ' +
          'placeholder="123456" style="letter-spacing:6px;font-size:20px;text-align:center"></label>' +
        '<div class="ui-error" id="em-err"></div>' +
        '<div class="ui-actions"><button class="ui-btn" id="em-back">‹ Back</button>' +
          '<button class="ui-btn" id="em-resend">Resend</button>' +
          '<button class="ui-btn primary" id="em-ok">Confirm</button></div>';
      const code = body.querySelector('#em-code');
      setTimeout(() => code.focus(), 100);
      body.querySelector('#em-back').onclick = stageStart;
      body.querySelector('#em-resend').onclick = async () => {
        const r = await api('/api/account/email/request', jsonOpts('POST', { email: pending }));
        body.querySelector('#em-err').textContent = r.ok ? '' : (r.data.error || 'Could not resend');
        if (r.ok) showToast('New code sent');
      };
      const confirm = async () => {
        const err = body.querySelector('#em-err'), btn = body.querySelector('#em-ok');
        err.textContent = ''; btn.disabled = true;
        const r = await api('/api/account/email/verify', jsonOpts('POST', { code: code.value.trim() }));
        btn.disabled = false;
        if (!r.ok) { err.textContent = r.data.error || 'That code did not work'; return; }
        window.myEmail = r.data.email; window.myEmailVerified = true;
        refreshAccountRows();
        close();
        showToast('Email verified');
      };
      body.querySelector('#em-ok').onclick = confirm;
      code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, ''); });
      code.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    }

    stageStart();
  }
  window.openEmailSetup = openEmailSetup;

  // ---------- Change password ----------
  function openChangePassword() {
    const { body, close } = openModal('Change password');
    body.innerHTML =
      '<label class="ui-field">Current password<input id="pw-cur" type="password" autocomplete="current-password"></label>' +
      '<label class="ui-field">New password (6+ characters)<input id="pw-new" type="password" autocomplete="new-password"></label>' +
      '<label class="ui-field">Repeat new password<input id="pw-new2" type="password" autocomplete="new-password"></label>' +
      '<div class="ui-error" id="pw-err"></div>' +
      '<div class="muted small">Other devices will be logged out after you change it.</div>' +
      '<div class="ui-actions"><button class="ui-btn" id="pw-no">Cancel</button><button class="ui-btn primary" id="pw-yes">Change password</button></div>';
    body.querySelector('#pw-no').onclick = close;
    body.querySelector('#pw-yes').onclick = async () => {
      const err = body.querySelector('#pw-err'), btn = body.querySelector('#pw-yes');
      const cur = body.querySelector('#pw-cur').value, nw = body.querySelector('#pw-new').value;
      err.textContent = '';
      if (nw.length < 6) { err.textContent = 'New password must be at least 6 characters'; return; }
      if (nw !== body.querySelector('#pw-new2').value) { err.textContent = 'The two new passwords do not match'; return; }
      btn.disabled = true;
      const r = await api('/api/account/password', jsonOpts('POST', { current: cur, next: nw }));
      btn.disabled = false;
      if (!r.ok) { err.textContent = r.data.error || 'Could not change the password'; return; }
      close();
      showToast('Password changed');
    };
  }
  window.openChangePassword = openChangePassword;

  refreshAccountRows();
})();