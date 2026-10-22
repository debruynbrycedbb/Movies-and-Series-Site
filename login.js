/* ============================================================
   SIGN IN / JOIN
   ============================================================ */

(() => {
  const $ = s => document.querySelector(s);
  const msg = $('#msg');

  // where to go afterwards - only ever a page on this site
  const nextRaw = new URLSearchParams(location.search).get('next') || 'index.html';
  const next = /^[a-z0-9_-]+\.html(\?[^#]*)?$/i.test(nextRaw) ? nextRaw : 'index.html';

  const MESSAGES = {
    wrong:        "That name and PIN don't match.",
    locked:       'Too many wrong PINs. That name is locked for 15 minutes.',
    bad_code:     "That family code isn't right.",
    taken:        'Someone already has that name. Try another.',
    bad_username: 'Usernames are 2–20 characters: letters, numbers, - or _.',
    short_pin:    'Your PIN needs at least 4 characters.',
    no_session:   'Your browser session expired. Reload the page and try again.'
  };

  function show(text, kind) {
    msg.hidden = false;
    msg.className = 'auth-msg ' + (kind || 'err');
    msg.textContent = text;
  }

  function busy(form, on) {
    form.querySelectorAll('input, button').forEach(el => (el.disabled = on));
    const b = form.querySelector('button[type=submit]');
    if (on) {
      b.dataset.html = b.innerHTML;
      b.innerHTML = '<span class="spin"></span><span>One moment…</span>';
    } else if (b.dataset.html) {
      b.innerHTML = b.dataset.html;
    }
  }

  /* ---------- tabs ---------- */

  const HEADS = {
    in:   ['Welcome back', 'Sign in with your username and PIN.'],
    join: ['Join the vault', 'Members only — you\'ll need the family code from Bryce.']
  };

  function setTab(tab, focus) {
    const tabs = $('.auth-tabs');
    tabs.dataset.on = tab;
    tabs.querySelectorAll('button').forEach(x => {
      const on = x.dataset.tab === tab;
      x.classList.toggle('on', on);
      x.setAttribute('aria-selected', on);
    });
    $('#inForm').hidden = tab !== 'in';
    $('#joinForm').hidden = tab !== 'join';
    $('#authTitle').textContent = HEADS[tab][0];
    $('#authSub').textContent = HEADS[tab][1];
    document.title = (tab === 'in' ? 'Sign in' : 'Join') + " — Bryce's CineVault";
    msg.hidden = true;
    if (focus) (tab === 'in' ? $('#inUser') : $('#jCode')).focus();
  }

  $('.auth-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) setTab(b.dataset.tab, true);
  });
  // login.html#join opens straight on the Join tab - handy to send people
  setTab(location.hash === '#join' ? 'join' : 'in', false);

  /* ---------- show / hide PIN ---------- */

  document.querySelectorAll('.reveal').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.for);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('shown', show);
      btn.setAttribute('aria-label', (show ? 'Hide ' : 'Show ') + (btn.dataset.for === 'jCode' ? 'code' : 'PIN'));
      input.focus();
    });
  });

  /* ---------- live checks while joining ---------- */

  const userOk = u => /^[a-z0-9_-]{2,20}$/.test(u);

  $('#jUser').addEventListener('input', e => {
    // usernames are lower case - show that as they type
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toLowerCase().replace(/\s/g, '');
    try { e.target.setSelectionRange(pos, pos); } catch (err) { /* noop */ }
    const v = e.target.value;
    const bad = v.length > 0 && !/^[a-z0-9_-]*$/.test(v);
    e.target.classList.toggle('invalid', bad);
    $('#userHint').classList.toggle('bad', bad);
    $('#userHint').textContent = bad
      ? 'Only letters, numbers, - and _ are allowed.'
      : '2–20 characters: letters, numbers, - or _. Other members will see it.';
  });

  function pinMatch() {
    const a = $('#jPin').value, b = $('#jPin2').value;
    const el = $('#pinMatch');
    el.className = 'match' + (!b ? '' : (a === b && a.length >= 4 ? ' ok' : (b.length >= a.length ? ' no' : '')));
  }
  $('#jPin').addEventListener('input', pinMatch);
  $('#jPin2').addEventListener('input', pinMatch);

  // clear the red outline as soon as someone starts fixing a field
  document.querySelectorAll('.control input').forEach(i => i.addEventListener('input', () => {
    if (i.id !== 'jUser') i.classList.remove('invalid');
  }));

  function invalid(id, text) {
    const el = $(id);
    el.classList.add('invalid');
    el.focus();
    show(text);
  }

  /* already signed in? straight through */
  (async () => {
    try {
      if (await DB.hasSession() && await DB.me()) location.replace(next);
    } catch (e) { /* fine - stay here */ }
  })();

  $('#inForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!$('#inUser').value.trim()) { invalid('#inUser', 'Enter your username.'); return; }
    if (!$('#inPin').value)         { invalid('#inPin', 'Enter your PIN.'); return; }
    busy(form, true);
    try {
      await DB.ensureSession();
      const res = await DB.login($('#inUser').value.trim(), $('#inPin').value);
      if (res === 'ok') { location.replace(next); return; }
      busy(form, false);
      if (res === 'wrong') { $('#inPin').value = ''; invalid('#inPin', MESSAGES.wrong); return; }
      show(MESSAGES[res] || 'Something went wrong (' + res + ').');
      return;
    } catch (err) {
      show(err.message || String(err));
    }
    busy(form, false);
  });

  $('#joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const user = $('#jUser').value.trim().toLowerCase();

    if (!$('#jCode').value)                     { invalid('#jCode', 'Enter the family code.'); return; }
    if (!userOk(user))                          { invalid('#jUser', MESSAGES.bad_username); return; }
    if ($('#jPin').value.length < 4)            { invalid('#jPin', MESSAGES.short_pin); return; }
    if ($('#jPin').value !== $('#jPin2').value) { invalid('#jPin2', "The two PINs don't match."); return; }

    busy(form, true);
    try {
      await DB.ensureSession();
      const res = await DB.register(user, $('#jPin').value, $('#jCode').value);
      if (res === 'ok') {
        show('Welcome, ' + user + '! Opening your vault…', 'ok');
        setTimeout(() => location.replace(next), 600);
        return;
      }
      busy(form, false);
      if (res === 'bad_code') { invalid('#jCode', MESSAGES.bad_code); return; }
      if (res === 'taken')    { invalid('#jUser', MESSAGES.taken); return; }
      show(MESSAGES[res] || 'Something went wrong (' + res + ').');
      return;
    } catch (err) {
      show(err.message || String(err));
    }
    busy(form, false);
  });
})();
