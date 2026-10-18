// =====================================================================
//  PROFILE PICTURE
//  Pick a ready-made avatar or upload your own photo. Shown in Settings,
//  on the home header, and on every Splits card so friends are easy to spot.
//  Loaded after app.js. Uses: api, jsonOpts, openModal, esc, displayName, showToast
// =====================================================================
(function () {
  // key -> [emoji, background]. The server only accepts these keys.
  const AVATAR_PRESETS = {
    fox: ['🦊', '#F97316'], panda: ['🐼', '#64748B'], cat: ['🐱', '#EAB308'], dog: ['🐶', '#A16207'],
    lion: ['🦁', '#D97706'], owl: ['🦉', '#7C3AED'], frog: ['🐸', '#16A34A'], koala: ['🐨', '#6B7280'],
    unicorn: ['🦄', '#EC4899'], tiger: ['🐯', '#EA580C'], penguin: ['🐧', '#0EA5E9'], octopus: ['🐙', '#DB2777'],
    rocket: ['🚀', '#4F46E5'], robot: ['🤖', '#0891B2'], alien: ['👽', '#65A30D'], ghost: ['👻', '#94A3B8']
  };
  const FALLBACK_COLORS = ['#2E9E6B', '#3B82F6', '#E0822B', '#8B5CF6', '#E0507A', '#14A3A3', '#B8860B', '#E05252'];

  function injectStyles() {
    if (document.getElementById('pf-styles')) return;
    const s = document.createElement('style');
    s.id = 'pf-styles';
    s.textContent = `
      .av { width:34px; height:34px; border-radius:50%; display:inline-grid; place-items:center; flex-shrink:0;
            color:#fff; font-weight:800; font-size:16px; line-height:1; overflow:hidden; vertical-align:middle; }
      .av img { width:100%; height:100%; object-fit:cover; display:block; }
      .av.sm { width:22px; height:22px; font-size:12px; }
      .av.md { width:42px; height:42px; font-size:20px; }
      .av.lg { width:96px; height:96px; font-size:48px; }

      .hello-row { display:flex; align-items:center; gap:12px; min-width:0; }
      .hdr-av { border:0; background:none; padding:0; cursor:pointer; display:grid; flex-shrink:0; border-radius:50%; }
      .hdr-av:empty { display:none; }
      .hdr-av .av { width:46px; height:46px; font-size:22px; box-shadow:0 0 0 2px var(--card-bg), 0 0 0 4px var(--bar-on); }

      .pf-top { display:flex; flex-direction:column; align-items:center; gap:8px; margin-bottom:16px; }
      .pf-top small { color:var(--muted); font-size:12px; }
      .pf-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; }
      .pf-opt { aspect-ratio:1; border-radius:50%; border:3px solid transparent; padding:0; background:none; cursor:pointer; }
      .pf-opt .av { width:100%; height:100%; font-size:28px; }
      .pf-opt.active { border-color:var(--bar-on); }
      .pf-opt:active { transform:scale(.94); }
      .pf-busy { opacity:.55; pointer-events:none; }
    `;
    document.head.appendChild(s);
  }

  // Draw one person's picture. m = { id, name, avatar }  avatar = null | 'preset:fox' | 'photo:<version>'
  function avatarHtml(m, size) {
    const cls = 'av' + (size ? ' ' + size : '');
    const a = (m && m.avatar) || '';
    if (a.indexOf('photo:') === 0) {
      return '<span class="' + cls + '"><img alt="" loading="lazy" src="/api/avatars/' + encodeURIComponent(m.id) +
        '?v=' + encodeURIComponent(a.slice(6)) + '"></span>';
    }
    if (a.indexOf('preset:') === 0 && AVATAR_PRESETS[a.slice(7)]) {
      const p = AVATAR_PRESETS[a.slice(7)];
      return '<span class="' + cls + '" style="background:' + p[1] + '">' + p[0] + '</span>';
    }
    const initial = String((m && m.name) || '').trim().charAt(0).toUpperCase();
    const color = FALLBACK_COLORS[(Number(m && m.id) || 0) % FALLBACK_COLORS.length];
    return '<span class="' + cls + '" style="background:' + color + '">' + (initial ? esc(initial) : '🙂') + '</span>';
  }
  window.avatarHtml = avatarHtml;

  const me = () => ({ id: window.myUserId, name: (typeof displayName === 'string' ? displayName : ''), avatar: window.myAvatarDesc || null });

  // Update every place that shows MY picture
  function refreshMyAvatarUI() {
    injectStyles();
    const hdr = document.getElementById('hdr-avatar');
    if (hdr) hdr.innerHTML = window.myUserId ? avatarHtml(me(), 'md') : '';
    const ico = document.getElementById('avatar-ico');
    if (ico) ico.innerHTML = window.myUserId ? avatarHtml(me()) : '🖼️';
    const st = document.getElementById('avatar-state');
    if (st) {
      const a = window.myAvatarDesc || '';
      st.textContent = a.indexOf('photo:') === 0 ? 'Your photo'
        : a.indexOf('preset:') === 0 ? 'Avatar: ' + a.slice(7) : 'Choose an avatar or upload a photo';
    }
  }
  window.refreshMyAvatarUI = refreshMyAvatarUI;

  // Turn any picture into a small square JPEG (256 x 256) in the browser before uploading
  async function fileToAvatar(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Could not read that picture. Try a JPG or PNG.'));
        i.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('Could not read that picture.');
      const size = 256, c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const s = Math.min(img.naturalWidth, img.naturalHeight);              // centre square crop
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, size, size);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      return c.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(url); }
  }

  function openProfilePicker() {
    injectStyles();
    const { body, close } = openModal('Profile picture');
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;

    function render() {
      const a = window.myAvatarDesc || '';
      body.innerHTML =
        '<div class="pf-top"><div id="pf-preview">' + avatarHtml(me(), 'lg') + '</div>' +
          '<small>Friends in your split groups see this picture.</small></div>' +
        '<div class="ui-sec" style="margin-top:0">PICK AN AVATAR</div>' +
        '<div class="pf-grid">' +
          Object.keys(AVATAR_PRESETS).map(k =>
            '<button class="pf-opt' + (a === 'preset:' + k ? ' active' : '') + '" data-k="' + k + '" aria-label="' + k + '">' +
              avatarHtml({ avatar: 'preset:' + k }) + '</button>').join('') +
        '</div>' +
        '<div class="ui-error" id="pf-err"></div>' +
        '<div class="ui-actions" style="justify-content:space-between">' +
          '<span>' +
            '<button class="ui-btn" id="pf-upload">📷 Upload photo</button> ' +
            (a ? '<button class="ui-btn danger" id="pf-remove">Remove</button>' : '') +
          '</span>' +
          '<button class="ui-btn primary" id="pf-done">Done</button>' +
        '</div>';
      body.appendChild(file);
      body.querySelector('#pf-upload').onclick = () => file.click();
      body.querySelector('#pf-done').onclick = close;
      const rm = body.querySelector('#pf-remove');
      if (rm) rm.onclick = () => save({ remove: true });
      body.querySelectorAll('.pf-opt').forEach(b => { b.onclick = () => save({ preset: b.dataset.k }); });
    }

    async function save(payload) {
      body.classList.add('pf-busy');
      const err = (msg) => { const el = body.querySelector('#pf-err'); if (el) el.textContent = msg; };
      try {
        const r = await api('/api/profile/avatar', jsonOpts('PUT', payload));
        if (!r.ok) { err(r.data.error || 'Could not save'); return; }
        window.myAvatarDesc = r.data.avatar || null;
        refreshMyAvatarUI();
        render();
      } finally { body.classList.remove('pf-busy'); }
    }

    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      try {
        await save({ image: await fileToAvatar(f) });
      } catch (e) {
        const el = body.querySelector('#pf-err');
        if (el) el.textContent = e.message || 'Could not use that picture';
      }
    });

    render();
  }
  window.openProfilePicker = openProfilePicker;

  injectStyles();
  refreshMyAvatarUI();   // app.js may already know who I am
})();