/* ============================================================
   LIBRARY PAGE
   ============================================================ */

const state = {
  q: '',
  genre: '',
  decade: '',
  status: 'all',
  sort: 'rating',
  dir: 'desc'
};

/* The page decides what it is a library OF - index.html leaves this
   as films, series.html points it at the series list. Everything below
   is written against ITEMS, so both pages share this one file. */
const ITEMS = PAGE_ITEMS;
const NOUN  = PAGE_NOUN;
const IS_SERIES = NOUN.one === 'series';
const B = window.BOOT;
const READONLY = !!B.readonly;

let visible = [];      // the currently displayed (filtered + sorted) list
let openIndex = -1;    // which title the modal is showing

const $ = sel => document.querySelector(sel);
const grid = $('#grid');

/* ---------- populate the filter dropdowns ---------- */

function buildFilters() {
  const genres = new Set();
  const decades = new Set();
  ITEMS.forEach(m => {
    m.genres.forEach(g => genres.add(g));
    if (m.year) decades.add(decadeOf(m.year));
  });

  const gSel = $('#genre');
  [...genres].sort().forEach(g => {
    const o = document.createElement('option');
    o.value = g; o.textContent = g;
    gSel.appendChild(o);
  });

  const dSel = $('#decade');
  [...decades].sort((a, b) => b - a).forEach(d => {
    const o = document.createElement('option');
    o.value = d; o.textContent = d + 's';
    dSel.appendChild(o);
  });
}

/** Refill the dropdowns after the list changes, keeping what's picked. */
function rebuildFilters() {
  const g = $('#genre').value, d = $('#decade').value;
  $('#genre').length = 1;
  $('#decade').length = 1;
  buildFilters();
  $('#genre').value = [...$('#genre').options].some(o => o.value === g) ? g : '';
  $('#decade').value = [...$('#decade').options].some(o => o.value === d) ? d : '';
  state.genre = $('#genre').value;
  state.decade = $('#decade').value;
}

/* ---------- filter + sort ---------- */

function compute() {
  const q = state.q.trim().toLowerCase();

  let list = ITEMS.filter(m => {
    if (state.genre && !m.genres.includes(state.genre)) return false;
    if (state.decade && decadeOf(m.year) !== +state.decade) return false;

    const rating = Store.getRating(m.id);
    if (state.status === 'rated' && rating === null) return false;
    if (state.status === 'unrated' && rating !== null) return false;

    if (q) {
      const hay = (m.title + ' ' + m.director + ' ' + m.genres.join(' ') + ' ' + m.year).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sign = state.dir === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    let d = 0;
    switch (state.sort) {
      case 'title':
        // ignore a leading article so "The Matrix" files under M
        d = stripArticle(a.title).localeCompare(stripArticle(b.title));
        return d * sign;
      case 'year':
        d = a.year - b.year; break;
      case 'runtime':
        d = a.runtime - b.runtime; break;
      case 'added':
        d = a.order - b.order; break;
      case 'recent':
        d = Store.getRatedAt(a.id) - Store.getRatedAt(b.id); break;
      case 'lastwatch': {
        // films with no logged date sink to the bottom either way
        const la = Store.lastWatch(a.id);
        const lb = Store.lastWatch(b.id);
        if (!la && !lb) return a.order - b.order;
        if (!la) return 1;
        if (!lb) return -1;
        d = la < lb ? -1 : (la > lb ? 1 : 0);
        break;
      }
      case 'watchcount': {
        const ca = Store.watchCount(a.id);
        const cb = Store.watchCount(b.id);
        if (!ca && !cb) return a.order - b.order;
        if (!ca) return 1;
        if (!cb) return -1;
        d = ca - cb;
        break;
      }
      case 'rating':
      default: {
        const ra = Store.getRating(a.id);
        const rb = Store.getRating(b.id);
        // unrated films always sink to the bottom, whichever direction
        if (ra === null && rb === null) return a.order - b.order;
        if (ra === null) return 1;
        if (rb === null) return -1;
        d = ra - rb;
        break;
      }
    }
    if (d === 0) return stripArticle(a.title).localeCompare(stripArticle(b.title));
    return d * sign;
  });

  return list;
}

function stripArticle(t) {
  return t.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}

/* ---------- render ---------- */

function render() {
  visible = compute();

  $('#count').textContent = visible.length === ITEMS.length
    ? `${ITEMS.length} ${NOUN.many}`
    : `${visible.length} of ${ITEMS.length} ${NOUN.many}`;

  const dirty = state.q || state.genre || state.decade || state.status !== 'all';
  $('#resetBtn').hidden = !dirty;

  if (!ITEMS.length) {
    grid.innerHTML = READONLY ? `
      <div class="empty">
        <h3>${escapeHtml(B.viewing.username)} hasn't added any ${NOUN.many} yet</h3>
        <p>Check back once they've started their list.</p>
      </div>` : `
      <div class="empty">
        <h3>No ${NOUN.many} on your list yet</h3>
        <p>Press <b>+ Add</b> to search for one${B.me.username === 'bryce' || B.members.length === 1
          ? ', or <a href="import.html" style="color:var(--accent)">bring in your original list</a>' : ''}.</p>
      </div>`;
    return;
  }

  if (!visible.length) {
    grid.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
        </svg>
        <h3>No ${NOUN.many} match</h3>
        <p>Try a different search or clear the filters.</p>
      </div>`;
    return;
  }

  grid.innerHTML = visible.map(cardHtml).join('');
}

function cardHtml(m, i) {
  const r = Store.getRating(m.id);
  const chip = r === null
    ? (READONLY ? '' : `<span class="chip unrated">Rate</span>`)
    : `<span class="chip" style="color:${ratingColor(r)}">${fmtRating(r)}</span>`;

  const rt = fmtRuntime(m.runtime);
  const bits = [];
  if (m.year) bits.push(String(m.year));
  if (rt) bits.push(rt);

  // a small ×N marker for anything watched more than once
  const wc = Store.watchCount(m.id);
  if (wc > 1) {
    bits.push(`<span class="rewatch" title="Watched ${wc} times">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>
      ${wc}</span>`);
  }

  return `
    <button class="card" data-id="${m.id}" data-i="${i}">
      <div class="poster">
        ${posterInner(m)}
        <div class="poster-shade"></div>
        <div class="poster-cta">${READONLY ? 'Details' : (r === null ? 'Rate it' : 'Edit rating')}</div>
        ${chip}
      </div>
      <div class="meta">
        <h3>${escapeHtml(m.title)}</h3>
        <div class="meta-line">${bits.join(' <span class="dot">·</span> ')}</div>
        <div class="meta-genre">${escapeHtml(m.genres.slice(0, 2).join(', '))}</div>
      </div>
    </button>`;
}

/* Repaint one card in place - avoids re-rendering the whole grid
   (and losing scroll position) after a single rating change. */
function refreshCard(id) {
  const el = grid.querySelector(`.card[data-id="${id}"]`);
  if (!el) return;
  const i = visible.findIndex(m => m.id === id);
  if (i === -1) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHtml(visible[i], i);
  el.replaceWith(tmp.firstElementChild);
}

/* ---------- modal ---------- */

const overlay = $('#overlay');

function openModal(index) {
  if (index < 0 || index >= visible.length) return;
  openIndex = index;
  const m = visible[index];
  const r = Store.getRating(m.id);

  $('#mTitle').textContent = m.title;

  const parts = [];
  if (m.year) parts.push(String(m.year));
  if (m.director) parts.push(m.director);
  const rt = fmtRuntime(m.runtime);
  if (rt) parts.push(rt);
  $('#mSub').innerHTML = parts.map(escapeHtml).join('<span class="dot">·</span>');

  $('#mTags').innerHTML = m.genres.map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('');
  $('#mKindNote').textContent = IS_SERIES && m.episodes
    ? `${m.seasons ? m.seasons + (m.seasons === 1 ? ' season, ' : ' seasons, ') : ''}` +
      `${m.episodes} episodes${m.epMins ? ` × ~${m.epMins} min` : ''}`
    : '';
  $('#mPoster').innerHTML = posterInner(m);
  $('#mPosterUrl').value = Store.getOverride(m.id);
  $('#mFilename').textContent = `${CONFIG.imageFolder}/${m.slug}.jpg`;
  $('#mRateLabel').textContent = READONLY ? `${B.viewing.username}'s rating` : 'My rating';

  setValue(r === null ? null : r, false);
  renderWatches(m);
  renderProgress(m);
  renderOthers(m);
  $('#mAddMine').hidden = !READONLY;
  $('#mAddMine').disabled = false;
  $('#mAddMine').textContent = '+ Add to my list';

  $('#mPrev').disabled = index === 0;
  $('#mNext').disabled = index === visible.length - 1;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  $('#mSlider').focus();
}

function closeModal() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  openIndex = -1;
}

/** Update the big number, slider, input and accent colour together. */
function setValue(v, markDirty) {
  const valEl = $('#mValue');
  const slider = $('#mSlider');
  const num = $('#mNum');

  if (v === null) {
    valEl.className = 'rate-value none';
    valEl.innerHTML = '--<small>/10</small>';
    slider.value = 0;
    num.value = '';
    paint(null);
  } else {
    valEl.className = 'rate-value';
    valEl.style.color = ratingColor(v);
    valEl.innerHTML = `${fmtRating(v)}<small>/10</small>`;
    slider.value = v;
    num.value = fmtRating(v);
    paint(v);
  }
  if (markDirty) $('#mSaved').classList.remove('show');
}

/* ---------- what everyone else gave it ---------- */

let othersReq = 0;
async function renderOthers(m) {
  const box = $('#mOthers');
  box.hidden = true;
  const req = ++othersReq;
  let rows;
  try { rows = await DB.titleRatings(m.id); } catch (e) { return; }
  if (req !== othersReq) return;                     // moved on to another title

  const name = Object.fromEntries(B.members.map(x => [x.id, x.username]));
  const others = rows.filter(r => r.user_id !== B.viewing.id)
    .map(r => ({ who: name[r.user_id] || '?', me: r.user_id === B.me.id,
                 r: r.rating === null ? null : Number(r.rating) }))
    .sort((a, b) => (b.me - a.me) || ((b.r ?? -1) - (a.r ?? -1)));
  if (!others.length) return;

  if (READONLY && !others.some(o => o.me)) $('#mAddMine').hidden = false;
  if (READONLY && others.some(o => o.me)) {
    $('#mAddMine').hidden = false;
    $('#mAddMine').disabled = true;
    $('#mAddMine').textContent = 'On your list';
  }

  box.innerHTML = '<span class="others-label">Also on</span>' + others.map(o => `
    <span class="other">${escapeHtml(o.me ? 'you' : o.who)}
      <b style="color:${ratingColor(o.r)}">${o.r === null ? 'unrated' : fmtRating(o.r)}</b></span>`).join('');
  box.hidden = false;
}

/* ---------- series: how far you've got ---------- */

function renderProgress(m) {
  const box = $('#mProgress');
  box.hidden = !IS_SERIES || READONLY;
  if (box.hidden) return;
  $('#mSeasons').value = m.seasons || '';
  $('#mEpisodes').value = m.episodes || '';
  $('#mProgHint').textContent = m.totalEpisodes
    ? `The whole series is ${m.totalSeasons} season${m.totalSeasons === 1 ? '' : 's'}, ${m.totalEpisodes} episodes. Watch time on the Stats page uses your episode count.`
    : 'Watch time on the Stats page uses your episode count.';
}

async function saveProgress() {
  if (openIndex === -1 || READONLY) return;
  const m = visible[openIndex];
  const seasons = Math.max(0, parseInt($('#mSeasons').value, 10) || 0);
  const episodes = Math.max(0, parseInt($('#mEpisodes').value, 10) || 0);
  try {
    await DB.updateProgress(B.me.id, m.id, seasons, episodes);
  } catch (e) { toast("Couldn't save that — try again"); return; }
  m.seasons = seasons; m.episodes = episodes; m.runtime = episodes * (m.epMins || 0);
  $('#mKindNote').textContent = `${seasons} season${seasons === 1 ? '' : 's'}, ${episodes} episodes` +
    (m.epMins ? ` × ~${m.epMins} min` : '');
  refreshCard(m.id);
  toast('Saved');
}

/* ---------- watch history ---------- */

function renderWatches(m) {
  const dates = Store.getWatches(m.id);
  const list = $('#mWatchList');
  const summary = $('#mWatchSummary');

  // the date box defaults to today, and can't be set in the future
  const today = todayISO();
  $('#mWatchDate').max = today;
  $('#mWatchDate').value = today;

  if (!dates.length) {
    summary.className = 'watch-summary none';
    summary.textContent = 'Never logged';
    list.innerHTML = READONLY
      ? `<li class="watch-empty" style="border:0">No viewing dates logged.</li>`
      : `<li class="watch-empty" style="border:0">
        Log the days you've seen this. Add as many as you like — every rewatch
        gets its own entry.
      </li>`;
    return;
  }

  summary.className = 'watch-summary';
  summary.innerHTML = dates.length === 1
    ? `Seen <b>once</b> · ${escapeHtml(relDate(dates[0]))}`
    : `Seen <b>${dates.length}</b> times · last ${escapeHtml(relDate(dates[0]))}`;

  // newest first, numbered from the most recent viewing downwards
  list.innerHTML = dates.map((d, i) => `
    <li class="${i === 0 ? 'latest' : ''}">
      <span class="wn">${dates.length - i}</span>
      <span class="wd">${escapeHtml(fmtDate(d))}</span>
      <span class="wr">${escapeHtml(relDate(d))}</span>
      <button class="wx" data-date="${d}" title="Remove this date" aria-label="Remove ${escapeHtml(fmtDate(d))}">&times;</button>
    </li>`).join('');
}

function addWatch(date) {
  if (openIndex === -1) return;
  const m = visible[openIndex];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Pick a date first'); return; }
  if (date > todayISO()) { toast("That date hasn't happened yet"); return; }

  if (!Store.addWatch(m.id, date)) {
    toast('That date is already logged');
    return;
  }
  renderWatches(m);
  refreshCard(m.id);
  toast(`Logged ${fmtDate(date)}`);
}

/** Keep the accent colour and the slider's filled track in step. */
function paint(v) {
  const c = v === null ? 'var(--accent)' : ratingColor(v);
  document.documentElement.style.setProperty('--rate-color', c);
  $('#mSlider').style.setProperty('--fill', (v === null ? 0 : v * 10) + '%');
}

function currentValue() {
  const raw = parseFloat($('#mNum').value);
  if (!isNaN(raw)) return Math.max(0, Math.min(10, raw));
  return parseFloat($('#mSlider').value);
}

function saveRating() {
  if (openIndex === -1) return;
  const m = visible[openIndex];
  const v = Store.setRating(m.id, currentValue());
  setValue(v, false);
  $('#mSaved').classList.add('show');
  refreshCard(m.id);
  renderHeaderStats();
  updateTagline();
}

/* ---------- data panel ---------- */

const dataOverlay = $('#dataOverlay');

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- tagline ---------- */

function updateTagline() {
  const total = ITEMS.length;
  const rated = ITEMS.filter(m => Store.getRating(m.id) !== null).length;
  const el = $('#tagline');
  if (READONLY) {
    const who = B.viewing.username;
    el.textContent = !total ? `${who} hasn't added any ${NOUN.many} yet.`
      : `${total} ${NOUN.many} on ${who}'s list, ${rated} rated. Click any poster for details.`;
    return;
  }
  if (!total) {
    el.textContent = `Nothing here yet — press + Add to put your first ${NOUN.one} on the list.`;
  } else if (!rated) {
    el.textContent = `${total} ${NOUN.many} watched. Click any poster to rate it out of 10.`;
  } else if (rated < total) {
    el.textContent = `${rated} of ${total} rated — ${total - rated} still to go. Click any poster to rate it.`;
  } else {
    el.textContent = `All ${total} ${NOUN.many} rated. Nicely done.`;
  }
}

/* ============================================================
   WIRING
   ============================================================ */

function init() {
  buildFilters();
  renderHeaderStats();
  updateTagline();
  render();

  // quick-pick buttons 5 → 10
  $('#mQuick').innerHTML = [5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10]
    .map(n => `<button data-v="${n}">${n}</button>`).join('');

  /* --- controls --- */
  $('#q').addEventListener('input', e => {
    state.q = e.target.value;
    $('#searchWrap').classList.toggle('has-value', !!state.q);
    render();
  });
  $('#qClear').addEventListener('click', () => {
    state.q = '';
    $('#q').value = '';
    $('#searchWrap').classList.remove('has-value');
    render();
    $('#q').focus();
  });

  $('#genre').addEventListener('change', e => { state.genre = e.target.value; render(); });
  $('#decade').addEventListener('change', e => { state.decade = e.target.value; render(); });
  $('#sort').addEventListener('change', e => {
    state.sort = e.target.value;
    // sensible default direction per sort mode
    state.dir = (state.sort === 'title') ? 'asc' : 'desc';
    syncDirBtn();
    render();
  });

  $('#dirBtn').addEventListener('click', () => {
    state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    syncDirBtn();
    render();
  });

  $('#statusSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    [...e.currentTarget.children].forEach(c => c.classList.remove('on'));
    b.classList.add('on');
    state.status = b.dataset.status;
    render();
  });

  $('#resetBtn').addEventListener('click', () => {
    state.q = ''; state.genre = ''; state.decade = ''; state.status = 'all';
    $('#q').value = '';
    $('#searchWrap').classList.remove('has-value');
    $('#genre').value = ''; $('#decade').value = '';
    [...$('#statusSeg').children].forEach((c, i) => c.classList.toggle('on', i === 0));
    render();
  });

  /* --- grid --- */
  grid.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) openModal(+card.dataset.i);
  });

  /* --- modal --- */
  $('#mClose').addEventListener('click', closeModal);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeModal(); });

  $('#mSlider').addEventListener('input', e => setValue(parseFloat(e.target.value), true));
  $('#mNum').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= 0 && v <= 10) {
      $('#mSlider').value = v;
      $('#mValue').className = 'rate-value';
      $('#mValue').style.color = ratingColor(v);
      $('#mValue').innerHTML = `${fmtRating(v)}<small>/10</small>`;
      paint(v);
      $('#mSaved').classList.remove('show');
    }
  });
  $('#mNum').addEventListener('keydown', e => { if (e.key === 'Enter') saveRating(); });

  $('#mQuick').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    setValue(parseFloat(b.dataset.v), true);
    saveRating();
  });

  $('#mSave').addEventListener('click', saveRating);

  $('#mClear').addEventListener('click', () => {
    if (openIndex === -1) return;
    const m = visible[openIndex];
    Store.clearRating(m.id);
    setValue(null, true);
    refreshCard(m.id);
    renderHeaderStats();
    updateTagline();
    toast('Rating cleared');
  });

  /* --- watch history --- */
  $('#mWatchAdd').addEventListener('click', () => addWatch($('#mWatchDate').value));
  $('#mWatchToday').addEventListener('click', () => addWatch(todayISO()));
  $('#mWatchDate').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addWatch($('#mWatchDate').value); }
  });
  $('#mWatchList').addEventListener('click', e => {
    const btn = e.target.closest('.wx');
    if (!btn || openIndex === -1) return;
    const m = visible[openIndex];
    Store.removeWatch(m.id, btn.dataset.date);
    renderWatches(m);
    refreshCard(m.id);
    toast('Date removed');
  });

  $('#mPrev').addEventListener('click', () => openModal(openIndex - 1));
  $('#mNext').addEventListener('click', () => openModal(openIndex + 1));

  $('#mCopyName').addEventListener('click', async () => {
    const name = $('#mFilename').textContent;
    try {
      await navigator.clipboard.writeText(name);
      toast('Copied ' + name);
    } catch (e) {
      // clipboard API needs https or localhost - fall back to selecting it
      const r = document.createRange();
      r.selectNodeContents($('#mFilename'));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      toast('Selected — press Ctrl/Cmd+C');
    }
  });

  $('#mPosterSave').addEventListener('click', () => {
    if (openIndex === -1) return;
    const m = visible[openIndex];
    const url = $('#mPosterUrl').value.trim();
    Store.setOverride(m.id, url);
    $('#mPoster').innerHTML = posterInner(m);
    refreshCard(m.id);
    toast(url ? 'Poster updated' : 'Custom poster removed');
  });

  /* --- keyboard --- */
  document.addEventListener('keydown', e => {
    if ($('#delOverlay').classList.contains('open')) {
      if (e.key === 'Escape') $('#delCancel').click();
      return;
    }
    if (addOverlay.classList.contains('open')) {
      if (e.key === 'Escape') closeAdd();
      return;
    }
    if (dataOverlay.classList.contains('open') && e.key === 'Escape') {
      dataOverlay.classList.remove('open');
      document.body.style.overflow = '';
      return;
    }
    if (!overlay.classList.contains('open')) {
      // "/" focuses search from anywhere
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        $('#q').focus();
      }
      return;
    }
    if (e.key === 'Escape') closeModal();
    // arrows belong to whatever field has focus (slider, number box, date box)
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (e.key === 'ArrowRight' && !typing) openModal(openIndex + 1);
    if (e.key === 'ArrowLeft'  && !typing) openModal(openIndex - 1);
  });

  /* --- data panel --- */
  $('#dataBtn').addEventListener('click', () => {
    dataOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
  const closeData = () => {
    dataOverlay.classList.remove('open');
    document.body.style.overflow = '';
  };
  $('#dClose').addEventListener('click', closeData);
  dataOverlay.addEventListener('mousedown', e => { if (e.target === dataOverlay) closeData(); });

  $('#dWho').innerHTML = `Signed in as <b>${escapeHtml(B.me.username)}</b>. `
    + `${B.members.length} member${B.members.length === 1 ? '' : 's'} in the vault.`;

  $('#expBtn').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const who = B.viewing.username;
    download(`cinevault-${who}-${IS_SERIES ? 'series' : 'movies'}-${stamp}.json`,
             JSON.stringify(Store.exportData(ITEMS), null, 2));
    toast('Copy downloaded');
  });

  $('#pinSave').addEventListener('click', async () => {
    const oldPin = $('#pinOld').value, newPin = $('#pinNew').value;
    if (newPin.length < 4) { toast('A PIN needs at least 4 characters'); return; }
    try {
      const res = await DB.changePin(oldPin, newPin);
      if (res === 'ok') {
        $('#pinOld').value = ''; $('#pinNew').value = '';
        toast('PIN changed');
      } else toast(res === 'wrong' ? "That isn't your current PIN" : 'Could not change it (' + res + ')');
    } catch (e) { toast(e.message || 'Could not change it'); }
  });

  /* --- delete account --- */
  const delOverlay = $('#delOverlay');
  const delReady = () => {
    $('#delGo').disabled = !($('#delUser').value.trim().toLowerCase() === B.me.username && $('#delPin').value.length >= 4);
  };
  const closeDel = () => {
    delOverlay.classList.remove('open');
    $('#delUser').value = ''; $('#delPin').value = '';
    $('#delMsg').hidden = true;
    delReady();
  };
  $('#delName').textContent = B.me.username;
  $('#delBtn').addEventListener('click', () => {
    dataOverlay.classList.remove('open');
    delOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#delUser').focus(), 50);
  });
  $('#delUser').addEventListener('input', delReady);
  $('#delPin').addEventListener('input', delReady);
  [$('#delClose'), $('#delCancel')].forEach(b => b.addEventListener('click', () => {
    closeDel();
    document.body.style.overflow = '';
  }));
  delOverlay.addEventListener('mousedown', e => { if (e.target === delOverlay) { closeDel(); document.body.style.overflow = ''; } });
  $('#delPin').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('#delGo').disabled) $('#delGo').click(); });
  $('#delGo').addEventListener('click', async () => {
    const go = $('#delGo');
    go.disabled = true;
    go.textContent = 'Deleting…';
    const say = t => { $('#delMsg').textContent = t; $('#delMsg').hidden = false; };
    try {
      const res = await DB.deleteAccount($('#delPin').value);
      if (res === 'ok') {
        location.replace('login.html?deleted=1');
        return;
      }
      say({ wrong: "That PIN isn't right.",
            locked: 'Too many wrong PINs. Try again in 15 minutes.',
            not_member: "You're not signed in any more. Reload the page and sign in." }[res]
          || 'Something went wrong (' + res + ').');
      if (res === 'wrong') { $('#delPin').value = ''; $('#delPin').focus(); }
    } catch (e) {
      say("Couldn't reach the database — nothing was deleted. Try again.");
    }
    go.textContent = 'Delete forever';
    delReady();
  });

  $('#outBtn').addEventListener('click', async () => {
    try { await DB.logout(); } catch (e) { /* going anyway */ }
    location.replace('login.html');
  });

  $('#refBtn').addEventListener('click', async () => {
    Store.clearPosterCache();
    render();
    closeData();
    const { found, fetched } = await Posters.warm(ITEMS);
    render();
    toast(fetched ? `Found ${found} of ${fetched} posters` : 'Automatic lookup is switched off');
  });

  /* --- source diagnostics --- */
  $('#testBtn').addEventListener('click', async () => {
    const box = $('#testOut');
    box.hidden = false;
    box.innerHTML = 'Testing…';
    $('#testBtn').disabled = true;

    const { movie, results } = await Posters.test();

    const rows = results.map(r =>
      `<div class="tl">
         <span class="tag-state ${r.state}">${r.state.toUpperCase()}</span>
         <span class="det">${escapeHtml(r.source)} — ${escapeHtml(r.detail)}${r.ms ? ' (' + r.ms + 'ms)' : ''}</span>
       </div>`).join('');

    const ok = results.some(r => r.state === 'ok');
    let note;
    if (ok) {
      note = 'Working. If posters still look sparse, that source simply has no image for those titles — add your own to the images folder.';
    } else if (results.every(r => r.state === 'skipped')) {
      note = 'No source is active. Check tmdbApiKey and posterSources in config.js.';
    } else if (results.some(r => r.state === 'error')) {
      note = 'Something is blocking the request. The usual causes: an ad blocker or privacy extension, a network that filters these domains, or opening the page as a local file instead of over https. Try the live site in a private window with extensions off.';
    } else {
      note = 'The sources answered but had no image for this film. Try the test again after picking a more mainstream title.';
    }

    box.innerHTML = `<div style="color:var(--dim);margin-bottom:8px">Test film: ${escapeHtml(movie.title)}</div>`
                  + rows + `<div class="note">${note}</div>`;
    $('#testBtn').disabled = false;
  });

  syncDirBtn();
  initListEditing();

  /* --- posters --- */
  // Swap each poster in as it resolves, without rebuilding the grid.
  Posters.onResolved((id, url) => {
    if (!url) return;
    const el = grid.querySelector(`.card[data-id="${id}"] .poster`);
    // Only fill in films still showing the gradient tile - never replace
    // one of your own images with Wikipedia's.
    if (el && !el.querySelector('img')) {
      const fb = el.querySelector('.poster-fallback');
      if (fb) fb.remove();
      el.insertAdjacentHTML('afterbegin', posterInner(MOVIE_BY_ID[id]));
    }
  });
  // Show what the lookup is doing rather than leaving it silent.
  document.addEventListener('posterprogress', e => {
    const { done, total, found, running } = e.detail;
    const box = $('#posterStatus');
    const txt = $('#posterStatusText');
    box.hidden = false;

    if (running) {
      box.classList.remove('done');
      txt.textContent = `Finding posters… ${done} of ${total}`;
      return;
    }
    box.classList.add('done');
    if (found === 0 && total > 0) {
      txt.innerHTML = 'No posters could be found. Open the <b>⬇ menu</b> and run '
                    + '<b>Test poster sources</b> to see why.';
    } else if (found < total) {
      txt.textContent = `Found ${found} of ${total} posters. The rest need an image in your images folder.`;
      setTimeout(() => { box.hidden = true; txt.textContent = ''; }, 9000);
    } else {
      box.hidden = true;
      txt.textContent = '';
    }
  });

  Posters.warm(ITEMS);
}

/* ============================================================
   CHANGING THE LIST - add, remove, copy from another member
   ============================================================ */

const KIND = IS_SERIES ? 'series' : 'movie';
const addOverlay = $('#addOverlay');
let addReq = 0;
let addTimer = null;

function openAdd() {
  if (READONLY) return;
  addOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  $('#aPick').hidden = true;
  $('#aResults').hidden = false;
  $('#aQ').focus();
  $('#aQ').select();
}

function closeAdd() {
  addOverlay.classList.remove('open');
  if (!overlay.classList.contains('open')) document.body.style.overflow = '';
}

/** Something on your list that is probably this one. */
function alreadyHave(tmdbId, title, year) {
  return ITEMS.find(m => m.tmdbId && m.tmdbId === tmdbId)
      || ITEMS.find(m => !m.tmdbId && m.title.toLowerCase() === String(title).toLowerCase()
                         && (!m.year || !year || Math.abs(m.year - year) <= 1));
}

async function runSearch(q) {
  const req = ++addReq;
  const box = $('#aResults');
  q = q.trim();
  if (q.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="add-note"><span class="spinner"></span> Searching…</div>';

  let res;
  try {
    res = await TMDB.search(KIND, q);
  } catch (e) {
    if (req === addReq) box.innerHTML = `<div class="add-note">Search isn't working right now (${escapeHtml(e.message || e)}).</div>`;
    return;
  }
  if (req !== addReq) return;                         // a newer search is on its way

  if (!res.length) {
    box.innerHTML = `<div class="add-note">Nothing found for “${escapeHtml(q)}”. Try fewer words, or check the spelling.</div>`;
    return;
  }

  box.innerHTML = res.map(r => {
    const have = alreadyHave(r.tmdb_id, r.title, r.year);
    const img = r.poster_path
      ? `<img src="${TMDB.posterUrl(r.poster_path, 'w185')}" alt="" loading="lazy">`
      : `<div class="poster-fallback"><div class="pf-title">${escapeHtml(r.title)}</div></div>`;
    return `
      <button class="add-hit ${have ? 'have' : ''}" data-tmdb="${r.tmdb_id}">
        <div class="add-hit-poster">${img}${have ? '<span class="have-tag">On your list</span>' : ''}</div>
        <div class="add-hit-t">${escapeHtml(r.title)}</div>
        <div class="add-hit-y">${fmtYear(r.year)}</div>
      </button>`;
  }).join('');
}

async function pick(tmdbId) {
  const box = $('#aPick');
  $('#aResults').hidden = true;
  box.hidden = false;
  box.innerHTML = '<div class="add-note"><span class="spinner"></span> Getting the details…</div>';

  let d;
  try {
    d = await TMDB.details(KIND, tmdbId);
  } catch (e) {
    box.innerHTML = `<div class="add-note">Couldn't load that one (${escapeHtml(e.message || e)}).
      <button class="btn btn-ghost" id="aBack">Back</button></div>`;
    $('#aBack').onclick = backToResults;
    return;
  }

  const have = alreadyHave(d.tmdb_id, d.title, d.year);
  const facts = [fmtYear(d.year), d.director,
                 d.kind === 'series'
                   ? `${d.seasons} season${d.seasons === 1 ? '' : 's'} · ${d.episodes} episodes`
                   : fmtRuntime(d.runtime)].filter(Boolean);

  const seasonPicker = d.kind === 'series' && d.seasonList.length ? `
    <div class="season-pick">
      <div class="sp-head">
        <span class="rate-label">Seasons I've watched</span>
        <button class="sp-all" type="button" id="aAll">None</button>
      </div>
      <div class="sp-grid">
        ${d.seasonList.map(x => `
          <label class="sp"><input type="checkbox" value="${x.n}" data-eps="${x.episodes}" checked>
            <span>S${x.n}</span><small>${x.episodes} ep</small></label>`).join('')}
      </div>
    </div>` : '';

  box.innerHTML = `
    <button class="add-back" id="aBack">&larr; Back to results</button>
    <div class="add-detail">
      <div class="add-detail-poster">${d.poster_path
        ? `<img src="${TMDB.posterUrl(d.poster_path, 'w342')}" alt="">`
        : `<div class="poster-fallback"><div class="pf-title">${escapeHtml(d.title)}</div></div>`}</div>
      <div>
        <h3>${escapeHtml(d.title)}</h3>
        <div class="modal-sub">${facts.map(escapeHtml).join('<span class="dot">·</span>')}</div>
        <div class="tags">${d.genres.map(g => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
        ${d.cast.length ? `<p class="add-cast">${escapeHtml(d.cast.join(', '))}</p>` : ''}
      </div>
    </div>
    ${seasonPicker}
    <label class="add-date">
      <span class="rate-label">Watched on <small>(optional)</small></span>
      <input type="date" id="aDate" max="${todayISO()}">
    </label>
    <div class="add-go">
      ${have
        ? `<span class="add-note" style="padding:0">Already on your list.</span>
           <button class="btn btn-primary" id="aOpen">Open it</button>`
        : `<button class="btn btn-primary" id="aGo">Add to my list</button>`}
    </div>`;

  $('#aBack').onclick = backToResults;
  if (have) { $('#aOpen').onclick = () => { closeAdd(); showItem(have.id); }; return; }

  const all = $('#aAll');
  if (all) {
    const boxes = () => [...box.querySelectorAll('.sp input')];
    const sync = () => { all.textContent = boxes().every(b => b.checked) ? 'None' : 'All'; };
    all.onclick = () => { const on = all.textContent === 'All'; boxes().forEach(b => (b.checked = on)); sync(); };
    box.querySelector('.sp-grid').addEventListener('change', sync);
  }
  $('#aGo').onclick = () => confirmAdd(d);
}

function backToResults() {
  $('#aPick').hidden = true;
  $('#aResults').hidden = false;
  $('#aQ').focus();
}

async function confirmAdd(d) {
  const go = $('#aGo');
  go.disabled = true;
  go.textContent = 'Adding…';

  let seasonsW = null, episodesW = null;
  if (d.kind === 'series') {
    const picked = [...$('#aPick').querySelectorAll('.sp input')].filter(b => b.checked);
    if (d.seasonList.length && !picked.length) {
      toast('Tick at least one season');
      go.disabled = false; go.textContent = 'Add to my list';
      return;
    }
    if (d.seasonList.length) {
      seasonsW = picked.length;
      episodesW = picked.reduce((n, b) => n + (+b.dataset.eps || 0), 0);
    }
  }
  const date = $('#aDate').value;

  try {
    const entry = Object.assign({}, d);
    delete entry.seasonList;
    const [tid] = await DB.upsertTitles([entry]);
    await DB.addToList([{
      user_id: B.me.id, title_id: tid,
      seasons_watched: seasonsW, episodes_watched: episodesW
    }], true);

    const item = B.toItem({
      title_id: tid, seasons_watched: seasonsW, episodes_watched: episodesW,
      t: {
        id: tid, kind: d.kind, tmdb_id: d.tmdb_id, title: d.title, year: d.year,
        runtime: d.runtime || null, seasons: d.seasons || null, episodes: d.episodes || null,
        ep_mins: d.ep_mins || null, genres: d.genres, director: d.director,
        cast_names: d.cast, poster_path: d.poster_path, wiki: null
      }
    }, ITEMS.reduce((n, m) => Math.max(n, m.order), -1) + 1);

    registerItem(item);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayISO()) Store.addWatch(item.id, date);

    rebuildFilters();
    renderHeaderStats();
    updateTagline();
    closeAdd();
    $('#aQ').value = '';
    $('#aResults').innerHTML = '';
    showItem(item.id);
    toast(`Added ${d.title}`);
  } catch (e) {
    console.error(e);
    toast("Couldn't add that — " + (e.message || 'try again'));
    go.disabled = false;
    go.textContent = 'Add to my list';
  }
}

/** Open the panel for one title, clearing filters if they hide it. */
function showItem(id) {
  render();
  let i = visible.findIndex(m => m.id === id);
  if (i === -1) {
    $('#resetBtn').click();
    i = visible.findIndex(m => m.id === id);
  }
  if (i !== -1) {
    openModal(i);
    const card = grid.querySelector(`.card[data-id="${id}"]`);
    if (card) card.scrollIntoView({ block: 'center' });
  }
}

function initListEditing() {
  $('#addBtn').addEventListener('click', openAdd);

  /* On a phone the + button floats in the corner. It can't float from
     inside the sticky filter bar (that bar's blur effect pins anything
     "fixed" to the bar itself), so it moves out to the page there. */
  const phone = matchMedia('(max-width: 560px)');
  const placeAdd = () => {
    const b = $('#addBtn');
    if (phone.matches) document.body.appendChild(b);
    else $('.controls').prepend(b);
  };
  if (phone.addEventListener) phone.addEventListener('change', placeAdd);
  placeAdd();
  $('#aClose').addEventListener('click', closeAdd);
  addOverlay.addEventListener('mousedown', e => { if (e.target === addOverlay) closeAdd(); });
  $('#aQ').addEventListener('input', e => {
    clearTimeout(addTimer);
    $('#aPick').hidden = true;
    $('#aResults').hidden = false;
    const q = e.target.value;
    addTimer = setTimeout(() => runSearch(q), 320);
  });
  $('#aQ').addEventListener('keydown', e => {
    if (e.key === 'Enter') { clearTimeout(addTimer); runSearch(e.target.value); }
  });
  $('#aResults').addEventListener('click', e => {
    const b = e.target.closest('.add-hit');
    if (b) pick(+b.dataset.tmdb);
  });

  $('#mProgSave').addEventListener('click', saveProgress);

  $('#mRemove').addEventListener('click', async () => {
    if (openIndex === -1 || READONLY) return;
    const m = visible[openIndex];
    if (!confirm(`Take “${m.title}” off your list? Its rating and watch dates go too.`)) return;
    try {
      await DB.removeFromList(B.me.id, m.id);
    } catch (e) { toast("Couldn't remove it — try again"); return; }
    unregisterItem(m.id);
    closeModal();
    rebuildFilters();
    render();
    renderHeaderStats();
    updateTagline();
    toast(`Removed ${m.title}`);
  });

  $('#mAddMine').addEventListener('click', async () => {
    if (openIndex === -1 || !READONLY) return;
    const m = visible[openIndex];
    const btn = $('#mAddMine');
    btn.disabled = true;
    try {
      await DB.addToList([{ user_id: B.me.id, title_id: m.id }], true);
      btn.textContent = 'On your list';
      toast(`Added ${m.title} to your list`);
    } catch (e) {
      btn.disabled = false;
      toast("Couldn't add it — try again");
    }
  });
}

function syncDirBtn() {
  const btn = $('#dirBtn');
  btn.classList.toggle('asc', state.dir === 'asc');
  const labels = {
    rating:  ['Lowest', 'Highest'],
    title:   ['A → Z', 'Z → A'],
    year:    ['Oldest', 'Newest'],
    runtime: ['Shortest', 'Longest'],
    recent:  ['Oldest', 'Latest'],
    lastwatch:  ['Longest ago', 'Most recent'],
    watchcount: ['Fewest', 'Most'],
    added:   ['First', 'Last']
  };
  const pair = labels[state.sort] || ['Asc', 'Desc'];
  $('#dirLabel').textContent = state.dir === 'asc' ? pair[0] : pair[1];
}

init();
