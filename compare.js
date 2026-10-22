/* ============================================================
   COMPARE - two members, split down the middle

   Left half is one person (A), right half the other (B). Every
   section keeps that split: A's numbers grow out to the left from
   the centre line, B's out to the right, with the shared label in
   the middle. That makes "who has more" readable at a glance.

   - Taste match: on titles you've BOTH rated, how close the scores
     are. Identical ratings everywhere = 100%; a 10-point gap on
     every title = 0%. Needs at least MIN_SHARED of them.
   - Watch time: every title once plus logged rewatches, exactly as
     the Stats page counts it. Always covers films AND series.
   - Genres: ranked by how many titles the two of you have seen in
     each, combined, with each person's average rating alongside.
   ============================================================ */

const MIN_SHARED = 3;
const GAP_SHOWN  = 10;          // disagreements listed before "Show all"

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
let showAllGaps = false;

const byName = Object.fromEntries(Bt.members.map(m => [m.username, m]));
if (!byName[nameA]) nameA = Bt.me.username;
if (!byName[nameB]) nameB = (others[0] || Bt.me).username;

/** One member's whole list: { [titleId]: { item, r, n } }  (n = logged dates) */
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
    cache[username].catch(() => { delete cache[username]; });
  }
  return cache[username];
}

/* ---------- small helpers ---------- */

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const label = n => n === Bt.me.username ? 'You' : n;
const NOUNS = { movie: { one: 'film', many: 'films' }, series: { one: 'series', many: 'series' } };
const noun = () => NOUNS[kind];
const plural = (n, nn) => n === 1 ? nn.one : nn.many;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function fmtDuration(min) {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.round(min % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Every title once, plus one more viewing per logged date beyond the first. */
function watchMinutes(list, k) {
  return Object.values(list)
    .filter(x => !k || x.item.kind === k)
    .reduce((t, x) => t + (x.item.runtime || 0) * Math.max(1, x.n), 0);
}

function thumb(item) {
  return `<div class="cthumb">${posterInner(item)}</div>`;
}

function score(r, cls) {
  return r === null
    ? `<span class="cs none ${cls || ''}">—</span>`
    : `<span class="cs ${cls || ''}" style="color:${ratingColor(r)}">${fmtRating(r)}</span>`;
}

function sectionHead(title, note) {
  return `<div class="section-head"><h2>${title}</h2></div>
          ${note ? `<p class="note">${note}</p>` : ''}`;
}

/** Names over each half, so every section reads A | B. */
function sideLabels() {
  return `<div class="bf-names">
    <span class="a"><i class="cdot a"></i>${escapeHtml(label(nameA))}</span>
    <span></span>
    <span class="b">${escapeHtml(label(nameB))}<i class="cdot b"></i></span>
  </div>`;
}

/* ---------- butterfly rows: A grows left, B grows right ---------- */

/**
 * rows: [{ label, a, b, max, fa, fb, ta, tb, subA, subB }]
 *   a / b    the bar lengths (numbers, from zero)
 *   max      what a full-length bar means (shared by both sides, so
 *            the two halves are directly comparable)
 *   fa / fb  how to print each value
 *   ta / tb  hover text
 */
function butterfly(rows) {
  return `<div class="bf">${rows.map(r => {
    const w = v => r.max ? Math.max(0, Math.min(100, v / r.max * 100)).toFixed(1) : 0;
    const lead = r.a === r.b ? '' : (r.a > r.b ? 'lead-a' : 'lead-b');
    return `
      <div class="bf-row ${lead}">
        <div class="bf-side a" data-tip="${escapeHtml(r.ta)}">
          <span class="bf-val">${r.fa}${r.subA ? `<small>${r.subA}</small>` : ''}</span>
          <span class="bf-track"><span class="bf-bar" style="width:${w(r.a)}%;background:${COL_A}"></span></span>
        </div>
        <div class="bf-label">${r.label}</div>
        <div class="bf-side b" data-tip="${escapeHtml(r.tb)}">
          <span class="bf-track"><span class="bf-bar" style="width:${w(r.b)}%;background:${COL_B}"></span></span>
          <span class="bf-val">${r.fb}${r.subB ? `<small>${r.subB}</small>` : ''}</span>
        </div>
      </div>`;
  }).join('')}</div>`;
}

/* ---------- the sections ---------- */

function overview(A, B) {
  const nn = noun();
  const stats = L => {
    const vals = Object.values(L);
    const rated = vals.filter(x => x.r !== null).map(x => x.r);
    return {
      n: vals.length,
      rated: rated.length,
      avg: avg(rated),
      rewatch: vals.reduce((t, x) => t + Math.max(0, x.n - 1), 0)
    };
  };
  const a = stats(A), b = stats(B);
  const nA = label(nameA), nB = label(nameB);
  return `<div class="section">
    ${sectionHead('At a glance', `${cap(nn.many)} only — switch above for ${kind === 'movie' ? 'series' : 'films'}.`)}
    ${sideLabels()}
    ${butterfly([
      { label: `${cap(nn.many)} seen`, a: a.n, b: b.n, max: Math.max(a.n, b.n),
        fa: a.n, fb: b.n, ta: `${nA}: ${a.n} ${plural(a.n, nn)}`, tb: `${nB}: ${b.n} ${plural(b.n, nn)}` },
      { label: 'Rated', a: a.rated, b: b.rated, max: Math.max(a.n, b.n),
        fa: a.rated, fb: b.rated, ta: `${nA}: ${a.rated} of ${a.n} rated`, tb: `${nB}: ${b.rated} of ${b.n} rated` },
      { label: 'Average rating', a: a.avg || 0, b: b.avg || 0, max: 10,
        fa: a.avg === null ? '--' : fmtRating(a.avg), fb: b.avg === null ? '--' : fmtRating(b.avg),
        ta: `${nA}: average ${a.avg === null ? 'n/a' : fmtRating(a.avg)} (bars run 0–10)`,
        tb: `${nB}: average ${b.avg === null ? 'n/a' : fmtRating(b.avg)} (bars run 0–10)` },
      { label: 'Rewatches logged', a: a.rewatch, b: b.rewatch, max: Math.max(a.rewatch, b.rewatch),
        fa: a.rewatch, fb: b.rewatch, ta: `${nA}: ${a.rewatch} extra viewings`, tb: `${nB}: ${b.rewatch} extra viewings` }
    ])}
  </div>`;
}

function watchTime(LA, LB) {
  const rows = [['movie', 'Films'], ['series', 'Series'], [null, 'Everything']].map(([k, lbl]) => ({
    k, lbl, a: watchMinutes(LA, k), b: watchMinutes(LB, k)
  }));
  const max = Math.max(rows[2].a, rows[2].b);
  const total = rows[2];
  const diff = Math.abs(total.a - total.b);
  const more = total.a === total.b ? null : (total.a > total.b ? nameA : nameB);
  const verdict = !total.a && !total.b ? 'Nothing logged yet.'
    : !more ? 'Exactly the same amount of watching.'
    : `${escapeHtml(label(more))} ${more === Bt.me.username ? 'have' : 'has'} watched <b>${fmtDuration(diff)}</b> more in total
       (${Math.round(diff / 60).toLocaleString()} hours).`;

  return `<div class="section">
    ${sectionHead('Total watch time',
      'Films and series together, whichever tab is picked. Every title counts once, plus each logged rewatch — the same way the Stats page counts.')}
    <div class="wt-hero">
      <div class="wt-side a"><b>${fmtDuration(total.a)}</b><span>${Math.round(total.a / 60).toLocaleString()} hours</span></div>
      <div class="wt-vs">vs</div>
      <div class="wt-side b"><b>${fmtDuration(total.b)}</b><span>${Math.round(total.b / 60).toLocaleString()} hours</span></div>
    </div>
    <p class="wt-verdict">${verdict}</p>
    ${sideLabels()}
    ${butterfly(rows.map(r => ({
      label: r.lbl, a: r.a, b: r.b, max,
      fa: fmtDuration(r.a), fb: fmtDuration(r.b),
      ta: `${label(nameA)}: ${fmtDuration(r.a)} of ${r.lbl.toLowerCase()}`,
      tb: `${label(nameB)}: ${fmtDuration(r.b)} of ${r.lbl.toLowerCase()}`
    })))}
  </div>`;
}

function genres(A, B) {
  const nn = noun();
  const tally = L => {
    const out = {};
    Object.values(L).forEach(x => x.item.genres.forEach(g => {
      const e = out[g] = out[g] || { n: 0, scores: [] };
      e.n++;
      if (x.r !== null) e.scores.push(x.r);
    }));
    return out;
  };
  const gA = tally(A), gB = tally(B);
  const keys = [...new Set(Object.keys(gA).concat(Object.keys(gB)))];
  if (!keys.length) return '';
  const rows = keys.map(k => {
    const a = gA[k] || { n: 0, scores: [] }, b = gB[k] || { n: 0, scores: [] };
    return { k, a: a.n, b: b.n, avgA: avg(a.scores), avgB: avg(b.scores) };
  }).sort((x, y) => (y.a + y.b) - (x.a + x.b) || Math.max(y.a, y.b) - Math.max(x.a, x.b) || x.k.localeCompare(y.k));
  const max = Math.max(...rows.map(r => Math.max(r.a, r.b)));
  const avgTxt = v => v === null ? '' : `${fmtRating(v)} avg`;

  return `<div class="section">
    ${sectionHead('Genres by ' + nn.many + ' seen',
      `Every genre, ranked by how many ${nn.many} the two of you have seen in it together. The small number is each person's average rating in that genre.`)}
    ${sideLabels()}
    ${butterfly(rows.map(r => ({
      label: escapeHtml(r.k), a: r.a, b: r.b, max,
      fa: r.a, fb: r.b, subA: avgTxt(r.avgA), subB: avgTxt(r.avgB),
      ta: `${label(nameA)}: ${r.a} ${plural(r.a, nn)} in ${r.k}${r.avgA === null ? '' : `, average ${fmtRating(r.avgA)}`}`,
      tb: `${label(nameB)}: ${r.b} ${plural(r.b, nn)} in ${r.k}${r.avgB === null ? '' : `, average ${fmtRating(r.avgB)}`}`
    })))}
  </div>`;
}

/** Shared, rated titles as A-score | title | B-score rows. */
function pairRows(pairs) {
  return `<div class="gap-list">${pairs.map(([a, b]) => {
    const gap = Math.abs(a.r - b.r);
    return `
      <div class="gap-row">
        ${score(a.r, 'big')}
        <div class="gap-mid">
          ${thumb(a.item)}
          <div class="gap-t">
            <span class="t">${escapeHtml(a.item.title)}</span>
            <span class="y">${fmtYear(a.item.year)}</span>
          </div>
          <span class="gap-badge" title="${gap.toFixed(1)} points apart">${gap.toFixed(1)}</span>
        </div>
        ${score(b.r, 'big')}
      </div>`;
  }).join('')}</div>`;
}

function disagreements(both) {
  const nn = noun();
  const all = both.slice()
    .filter(([a, b]) => Math.abs(a.r - b.r) >= 0.5)
    .sort((x, y) => Math.abs(y[0].r - y[1].r) - Math.abs(x[0].r - x[1].r)
                 || x[0].item.title.localeCompare(y[0].item.title));
  const head = sectionHead('Where you disagree most',
    `${cap(nn.many)} you've both rated, biggest gap in score first. The number in the middle is how many points apart you are.`);
  if (!all.length) {
    return `<div class="section">${head}
      <p class="note">${both.length ? 'No real disagreements — every shared score is within half a point.' :
        `Shows up once you've both rated the same ${nn.one}.`}</p></div>`;
  }
  const shown = showAllGaps ? all : all.slice(0, GAP_SHOWN);
  return `<div class="section">${head}
    ${sideLabels()}
    ${pairRows(shown)}
    ${all.length > GAP_SHOWN ? `<button class="btn btn-ghost gap-more" id="gapMore">
        ${showAllGaps ? 'Show fewer' : `Show all ${all.length}`}</button>` : ''}
  </div>`;
}

function agreements(both) {
  const agree = both.slice()
    .filter(([a, b]) => Math.abs(a.r - b.r) <= 0.5)
    .sort((x, y) => (y[0].r + y[1].r) - (x[0].r + x[1].r))
    .slice(0, 6);
  if (!agree.length) return '';
  return `<div class="section">
    ${sectionHead('Where you agree', 'Rated within half a point of each other, best first.')}
    ${sideLabels()}
    ${pairRows(agree)}
  </div>`;
}

/** One half: someone's favourites the other person hasn't seen. */
function picksColumn(fromName, from, to, toName, side) {
  const list = Object.values(from)
    .filter(x => x.r !== null && x.r >= 7 && !to[x.item.id])
    .sort((x, y) => y.r - x.r || x.item.title.localeCompare(y.item.title))
    .slice(0, 10);
  const canAdd = toName === Bt.me.username && toName !== fromName;
  const whose = fromName === Bt.me.username ? 'Your' : escapeHtml(fromName) + "'s";
  const title = `${whose} picks for ${escapeHtml(toName === Bt.me.username ? 'you' : toName)}`;
  return `<div class="pick-col ${side}">
    <h3><i class="cdot ${side}"></i>${title}</h3>
    ${list.length ? list.map(x => `
      <div class="cpick-card">
        ${thumb(x.item)}
        <div class="cp-body">
          <div class="cp-t">${escapeHtml(x.item.title)}</div>
          <div class="cp-m">${fmtYear(x.item.year)}${x.item.genres.length ? ' · ' + escapeHtml(x.item.genres.slice(0, 2).join(', ')) : ''}</div>
          <div class="cp-s">${score(x.r)}
            ${canAdd ? `<button class="btn btn-ghost cp-add" data-id="${x.item.id}">+ My list</button>` : ''}</div>
        </div>
      </div>`).join('')
      : `<p class="note">Nothing rated 7+ that isn't already on both lists.</p>`}
  </div>`;
}

function picks(A, B) {
  return `<div class="section">
    ${sectionHead('Favourites the other hasn\'t seen', `Rated 7 or more by one of you, and not on the other's list.`)}
    <div class="pick-split">
      ${picksColumn(nameA, A, B, nameB, 'a')}
      ${picksColumn(nameB, B, A, nameA, 'b')}
    </div>
  </div>`;
}

/* ---------- header ---------- */

function fillPickers() {
  const opts = sel => Bt.members.map(m =>
    `<option value="${escapeHtml(m.username)}" ${m.username === sel ? 'selected' : ''}>${escapeHtml(label(m.username))}</option>`).join('');
  $c('#pickA').innerHTML = opts(nameA);
  $c('#pickB').innerHTML = opts(nameB);
  $c('#avA').textContent = nameA.charAt(0).toUpperCase();
  $c('#avB').textContent = nameB.charAt(0).toUpperCase();
  [...$c('#kindSeg').children].forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
}

function headerNumbers(A, B, shared, both) {
  const nn = noun();
  const sub = L => {
    const vals = Object.values(L);
    const r = vals.filter(x => x.r !== null).map(x => x.r);
    return `${vals.length} ${plural(vals.length, nn)} · avg ${r.length ? fmtRating(avg(r)) : '--'}`;
  };
  $c('#subA').textContent = sub(A);
  $c('#subB').textContent = sub(B);
  const gaps = both.map(([a, b]) => Math.abs(a.r - b.r));
  const match = both.length >= MIN_SHARED ? Math.round(100 - avg(gaps) * 10) : null;
  $c('#match').innerHTML = `<b>${match === null ? '--' : match + '<small>%</small>'}</b>
    <span>taste match</span>
    <em>${shared.length} ${plural(shared.length, nn)} in common</em>`;
  $c('#match').title = match === null
    ? `Needs ${MIN_SHARED} ${nn.many} you've both rated (${both.length} so far)`
    : `On the ${both.length} ${nn.many} you've both rated, scores are ${avg(gaps).toFixed(1)} apart on average`;
}

function syncUrl() {
  const p = new URLSearchParams();
  if (nameA !== Bt.me.username) p.set('a', nameA);
  if (nameB) p.set('b', nameB);
  if (kind === 'series') p.set('kind', 'series');
  history.replaceState(null, '', 'compare.html' + (p.toString() ? '?' + p : ''));
}

/* ---------- page ---------- */

let renderReq = 0;
async function render() {
  syncUrl();
  if (Bt.members.length < 2) {
    $c('#vsHead').hidden = true;
    $c('.vs-kind').hidden = true;
    content.innerHTML = `<div class="needs-ratings">
      <h3>You're the only member so far</h3>
      <p>Send the site and the family code to someone. Once they've joined, their list
         shows up here next to yours.</p></div>`;
    return;
  }
  fillPickers();
  if (nameA === nameB) {
    content.innerHTML = `<div class="needs-ratings small"><h3>Pick two different people</h3>
      <p>Choose someone else on one side of the split.</p></div>`;
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
  Object.values(LA).concat(Object.values(LB)).forEach(x => { ITEM_BY_ID[x.item.id] = ITEM_BY_ID[x.item.id] || x.item; });

  const shared = Object.keys(A).filter(id => B[id]).map(id => [A[id], B[id]]);
  const both = shared.filter(([a, b]) => a.r !== null && b.r !== null);
  headerNumbers(A, B, shared, both);

  content.innerHTML =
    watchTime(LA, LB) +
    overview(A, B) +
    genres(A, B) +
    disagreements(both) +
    agreements(both) +
    picks(A, B);
}

/* ---------- wiring ---------- */

$c('#pickA').addEventListener('change', e => { nameA = e.target.value; showAllGaps = false; render(); });
$c('#pickB').addEventListener('change', e => { nameB = e.target.value; showAllGaps = false; render(); });
$c('#kindSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.dataset.kind === kind) return;
  kind = b.dataset.kind;
  showAllGaps = false;
  render();
});

content.addEventListener('click', async e => {
  if (e.target.closest('#gapMore')) {
    showAllGaps = !showAllGaps;
    const y = window.scrollY;
    await render();
    window.scrollTo(0, y);
    return;
  }
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

// hover readout for the bars
const tip = $c('#ctip');
content.addEventListener('mousemove', e => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.transform = `translate(${x}px, ${e.clientY + 14}px)`;
});
content.addEventListener('mouseleave', () => { tip.hidden = true; });

render();
