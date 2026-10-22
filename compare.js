/* ============================================================
   COMPARE - two members' lists side by side

   Everything here is worked out from the two lists alone:
   - Shared: titles on both lists.
   - Taste match: on titles you've BOTH rated, how close the scores
     are. Identical ratings everywhere = 100%; a 10-point gap on
     every title = 0%. Needs at least MIN_SHARED of them.
   - Genre averages: each person's average across their own rated
     titles in that genre (not just the shared ones), shown for
     genres where both have rated at least MIN_GENRE.
   ============================================================ */

const MIN_SHARED = 3;
const MIN_GENRE  = 2;

// validated pair (dataviz validator, dark surface #12151d): person A, person B
const COL_A = '#1797b8';
const COL_B = '#8f6ff2';

const Bt = window.BOOT;
const $c = s => document.querySelector(s);
const content = $c('#content');
const cache = {};                       // username -> Promise<list>

const qs = new URLSearchParams(location.search);
const others = Bt.members.filter(m => m.id !== Bt.me.id);
let nameA = qs.get('a') || Bt.me.username;
let nameB = qs.get('b') || (others[0] ? others[0].username : '');
let kind = qs.get('kind') === 'series' ? 'series' : 'movie';

const byName = Object.fromEntries(Bt.members.map(m => [m.username, m]));
if (!byName[nameA]) nameA = Bt.me.username;
if (!byName[nameB]) nameB = others[0] ? others[0].username : '';

/** One member's whole list: { [titleId]: { item, r, n } } */
function load(username) {
  if (!cache[username]) {
    const m = byName[username];
    cache[username] = Promise.all([DB.loadList(m.id), DB.loadWatches(m.id)]).then(([rows, ws]) => {
      const counts = {};
      ws.forEach(w => (counts[w.title_id] = (counts[w.title_id] || 0) + 1));
      const out = {};
      rows.filter(r => r.t).forEach((r, i) => {
        out[r.title_id] = {
          item: Bt.toItem(r, i),
          r: r.rating === null || r.rating === undefined ? null : Number(r.rating),
          n: counts[r.title_id] || 0
        };
      });
      return out;
    });
  }
  return cache[username];
}

/* ---------- small helpers ---------- */

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const label = n => n === Bt.me.username ? 'You' : n;
const noun = () => kind === 'series' ? { one: 'series', many: 'series' } : { one: 'film', many: 'films' };

function thumb(item) {
  return `<div class="cthumb">${posterInner(item)}</div>`;
}

function score(r) {
  return r === null
    ? '<span class="cs none">—</span>'
    : `<span class="cs" style="color:${ratingColor(r)}">${fmtRating(r)}</span>`;
}

function legend() {
  return `<div class="clegend">
    <span><i style="background:${COL_A}"></i>${escapeHtml(label(nameA))}</span>
    <span><i style="background:${COL_B}"></i>${escapeHtml(label(nameB))}</span>
  </div>`;
}

/* ---------- the sections ---------- */

function tiles(A, B, shared, both) {
  const n = noun();
  const rA = Object.values(A).filter(x => x.r !== null).map(x => x.r);
  const rB = Object.values(B).filter(x => x.r !== null).map(x => x.r);
  const gaps = both.map(([a, b]) => Math.abs(a.r - b.r));
  const match = both.length >= MIN_SHARED ? Math.round(100 - avg(gaps) * 10) : null;

  const t = (lbl, val, sub, cls) => `
    <div class="tile ${cls || ''}">
      <span class="lbl">${lbl}</span>
      <div class="val">${val}</div>
      <div class="sub">${sub}</div>
    </div>`;

  return `<div class="stat-row ctiles">
    ${t(`<i class="cdot a"></i>${escapeHtml(label(nameA))}`, Object.keys(A).length,
        `${n.many} · average ${rA.length ? fmtRating(avg(rA)) : '--'}`)}
    ${t(`<i class="cdot b"></i>${escapeHtml(label(nameB))}`, Object.keys(B).length,
        `${n.many} · average ${rB.length ? fmtRating(avg(rB)) : '--'}`)}
    ${t('Seen by both', shared.length,
        shared.length ? `${both.length} rated by both` : `no ${n.many} in common yet`)}
    ${t('Taste match', match === null ? '--' : match + '<small>%</small>',
        match === null
          ? `needs ${MIN_SHARED} ${n.many} you've both rated`
          : `scores are ${avg(gaps).toFixed(1)} apart on average`, 'accent')}
  </div>`;
}

function genreChart(A, B) {
  const g = list => {
    const out = {};
    Object.values(list).forEach(x => {
      if (x.r === null) return;
      x.item.genres.forEach(name => (out[name] = out[name] || []).push(x.r));
    });
    return out;
  };
  const gA = g(A), gB = g(B);
  const rows = Object.keys(gA)
    .filter(k => gB[k] && gA[k].length >= MIN_GENRE && gB[k].length >= MIN_GENRE)
    .map(k => ({ k, a: avg(gA[k]), b: avg(gB[k]), na: gA[k].length, nb: gB[k].length }))
    .sort((x, y) => (y.a + y.b) - (x.a + x.b) || x.k.localeCompare(y.k))
    .slice(0, 14);

  const head = `<div class="section-head"><h2>Genre averages</h2></div>`;
  if (!rows.length) {
    return `<div class="section">${head}
      <p class="note">Shows up once you've both rated at least ${MIN_GENRE} ${noun().many} in the same genre.</p></div>`;
  }

  const bar = (who, v, n, col) => {
    const name = who === 'a' ? label(nameA) : label(nameB);
    return `<div class="cbar-line" data-tip="${escapeHtml(name)}: ${fmtRating(v)} average over ${n} rated">
      <span class="cbar-track"><span class="cbar" style="width:${(v * 10).toFixed(1)}%;background:${col}"></span></span>
      <span class="cbar-v">${fmtRating(v)}</span>
    </div>`;
  };

  return `<div class="section">${head}
    <p class="note">Each person's average across their own rated ${noun().many} in that genre.
      Genres where you've both rated at least ${MIN_GENRE}. Bars run from 0 to 10.</p>
    ${legend()}
    <div class="cgenres">
      ${rows.map(r => `
        <div class="cgenre">
          <div class="cg-name">${escapeHtml(r.k)}</div>
          <div class="cg-bars">${bar('a', r.a, r.na, COL_A)}${bar('b', r.b, r.nb, COL_B)}</div>
        </div>`).join('')}
    </div>
  </div>`;
}

function pairList(title, note, pairs) {
  const head = `<div class="section-head"><h2>${title}</h2></div>`;
  if (!pairs.length) return '';
  return `<div class="section">${head}
    <p class="note">${note}</p>
    <div class="cpairs">
      <div class="cpair chead"><span></span><span></span>
        <span><i class="cdot a"></i>${escapeHtml(label(nameA))}</span>
        <span><i class="cdot b"></i>${escapeHtml(label(nameB))}</span>
        <span>Gap</span></div>
      ${pairs.map(([a, b]) => `
        <div class="cpair">
          ${thumb(a.item)}
          <span class="ct">${escapeHtml(a.item.title)}<small>${fmtYear(a.item.year)}</small></span>
          ${score(a.r)}${score(b.r)}
          <span class="cgap">${Math.abs(a.r - b.r).toFixed(1)}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

function picks(fromName, from, to, toName) {
  const list = Object.values(from)
    .filter(x => x.r !== null && x.r >= 7 && !to[x.item.id])
    .sort((x, y) => y.r - x.r || x.item.title.localeCompare(y.item.title))
    .slice(0, 12);
  if (!list.length) return '';
  const canAdd = toName === Bt.me.username;
  const whoTo = toName === Bt.me.username ? "you haven't" : `${escapeHtml(toName)} hasn't`;

  return `<div class="section">
    <div class="section-head"><h2>${escapeHtml(label(fromName))}'s favourites ${whoTo} seen</h2></div>
    <p class="note">Rated 7 or more by ${escapeHtml(fromName === Bt.me.username ? 'you' : fromName)}, not on ${toName === Bt.me.username ? 'your' : escapeHtml(toName) + "'s"} list.</p>
    <div class="cpicks">
      ${list.map(x => `
        <div class="cpick-card">
          ${thumb(x.item)}
          <div class="cp-body">
            <div class="cp-t">${escapeHtml(x.item.title)}</div>
            <div class="cp-m">${fmtYear(x.item.year)}${x.item.genres.length ? ' · ' + escapeHtml(x.item.genres.slice(0, 2).join(', ')) : ''}</div>
            <div class="cp-s">${score(x.r)}
              ${canAdd ? `<button class="btn btn-ghost cp-add" data-id="${x.item.id}">+ My list</button>` : ''}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- page ---------- */

function fillPickers() {
  const opts = sel => Bt.members.map(m =>
    `<option value="${escapeHtml(m.username)}" ${m.username === sel ? 'selected' : ''}>${escapeHtml(label(m.username))}</option>`).join('');
  $c('#pickA').innerHTML = opts(nameA);
  $c('#pickB').innerHTML = opts(nameB);
  [...$c('#kindSeg').children].forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
}

function syncUrl() {
  const p = new URLSearchParams();
  if (nameA !== Bt.me.username) p.set('a', nameA);
  if (nameB) p.set('b', nameB);
  if (kind === 'series') p.set('kind', 'series');
  history.replaceState(null, '', 'compare.html' + (p.toString() ? '?' + p : ''));
}

let renderReq = 0;
async function render() {
  syncUrl();
  if (Bt.members.length < 2) {
    content.innerHTML = `<div class="needs-ratings">
      <h3>You're the only member so far</h3>
      <p>Send the site and the family code to someone, and once they've joined their list
         shows up here next to yours.</p></div>`;
    $c('.compare-bar').hidden = true;
    return;
  }
  if (nameA === nameB) {
    content.innerHTML = `<div class="needs-ratings small"><h3>Pick two different people</h3>
      <p>Choose someone else in one of the boxes above.</p></div>`;
    return;
  }

  const req = ++renderReq;
  content.innerHTML = '<div class="add-note"><span class="spinner"></span> Loading both lists…</div>';
  let LA, LB;
  try {
    [LA, LB] = await Promise.all([load(nameA), load(nameB)]);
  } catch (e) {
    content.innerHTML = `<div class="needs-ratings small"><h3>Couldn't load the lists</h3><p>${escapeHtml(e.message || e)}</p></div>`;
    return;
  }
  if (req !== renderReq) return;

  const only = L => Object.fromEntries(Object.entries(L).filter(([, x]) => x.item.kind === kind));
  const A = only(LA), B = only(LB);
  // lets posterInner()'s fallback handler find these titles
  Object.values(A).concat(Object.values(B)).forEach(x => { ITEM_BY_ID[x.item.id] = ITEM_BY_ID[x.item.id] || x.item; });

  const shared = Object.keys(A).filter(id => B[id]).map(id => [A[id], B[id]]);
  const both = shared.filter(([a, b]) => a.r !== null && b.r !== null);

  const disagree = both.slice()
    .sort((x, y) => Math.abs(y[0].r - y[1].r) - Math.abs(x[0].r - x[1].r)
                 || x[0].item.title.localeCompare(y[0].item.title))
    .filter(([a, b]) => Math.abs(a.r - b.r) >= 1)
    .slice(0, 8);
  const agree = both.slice()
    .sort((x, y) => Math.abs(x[0].r - x[1].r) - Math.abs(y[0].r - y[1].r)
                 || (y[0].r + y[1].r) - (x[0].r + x[1].r))
    .filter(([a, b]) => Math.abs(a.r - b.r) <= 1)
    .slice(0, 8);

  const n = noun();
  if (!Object.keys(A).length && !Object.keys(B).length) {
    content.innerHTML = tiles(A, B, shared, both) +
      `<div class="needs-ratings small"><h3>No ${n.many} on either list yet</h3></div>`;
    return;
  }

  content.innerHTML =
    tiles(A, B, shared, both) +
    genreChart(A, B) +
    pairList('Where you disagree', `${n.many.replace(/^./, c => c.toUpperCase())} you've both rated, biggest gap first.`, disagree) +
    pairList('Where you agree', 'Rated within a point of each other, highest scores first.', agree) +
    picks(nameB, B, A, nameA) +
    picks(nameA, A, B, nameB) +
    (shared.length ? '' : `<p class="note">No ${n.many} in common yet — the lists above are a good place to start.</p>`);
}

/* ---------- wiring ---------- */

fillPickers();
$c('#pickA').addEventListener('change', e => { nameA = e.target.value; render(); });
$c('#pickB').addEventListener('change', e => { nameB = e.target.value; render(); });
$c('#kindSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  kind = b.dataset.kind;
  fillPickers();
  render();
});

content.addEventListener('click', async e => {
  const b = e.target.closest('.cp-add');
  if (!b) return;
  b.disabled = true;
  try {
    await DB.addToList([{ user_id: Bt.me.id, title_id: b.dataset.id }], true);
    b.textContent = 'Added';
    delete cache[Bt.me.username];              // reload yours next time
    toast('Added to your list');
  } catch (err) {
    b.disabled = false;
    toast("Couldn't add it — try again");
  }
});

// hover readout for the genre bars
const tip = $c('#ctip');
content.addEventListener('mousemove', e => {
  const line = e.target.closest('.cbar-line');
  if (!line) { tip.hidden = true; return; }
  tip.textContent = line.dataset.tip;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.transform = `translate(${x}px, ${e.clientY + 14}px)`;
});
content.addEventListener('mouseleave', () => { tip.hidden = true; });

render();
