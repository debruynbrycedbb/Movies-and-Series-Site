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
    msg.className = 'login-msg ' + (kind || 'err');
    msg.textContent = text;
  }

  function busy(form, on) {
    form.querySelectorAll('input, button').forEach(el => (el.disabled = on));
    const b = form.querySelector('button[type=submit]');
    if (on) { b.dataset.label = b.textContent; b.textContent = 'One moment…'; }
    else if (b.dataset.label) b.textContent = b.dataset.label;
  }

  /* tabs */
  document.querySelector('.login-tabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('.login-tabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#inForm').hidden = b.dataset.tab !== 'in';
    $('#joinForm').hidden = b.dataset.tab !== 'join';
    msg.hidden = true;
    (b.dataset.tab === 'in' ? $('#inUser') : $('#jCode')).focus();
  });

  /* already signed in? straight through */
  (async () => {
    try {
      if (await DB.hasSession() && await DB.me()) location.replace(next);
    } catch (e) { /* fine - stay here */ }
  })();

  $('#inForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    busy(form, true);
    try {
      await DB.ensureSession();
      const res = await DB.login($('#inUser').value, $('#inPin').value);
      if (res === 'ok') { location.replace(next); return; }
      show(MESSAGES[res] || 'Something went wrong (' + res + ').');
    } catch (err) {
      show(err.message || String(err));
    }
    busy(form, false);
  });

  $('#joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const user = $('#jUser').value.trim().toLowerCase();

    if (!/^[a-z0-9_-]{2,20}$/.test(user)) { show(MESSAGES.bad_username); return; }
    if ($('#jPin').value.length < 4)       { show(MESSAGES.short_pin); return; }
    if ($('#jPin').value !== $('#jPin2').value) { show("The two PINs don't match."); return; }

    busy(form, true);
    try {
      await DB.ensureSession();
      const res = await DB.register(user, $('#jPin').value, $('#jCode').value);
      if (res === 'ok') {
        show('Welcome, ' + user + '! Opening your vault…', 'ok');
        setTimeout(() => location.replace(next), 600);
        return;
      }
      show(MESSAGES[res] || 'Something went wrong (' + res + ').');
    } catch (err) {
      show(err.message || String(err));
    }
    busy(form, false);
  });
})();
