/* ============================================================
   STATISTICS

   Everything here is computed twice: once over your films, once
   over your series. The two blocks are identical in shape, so
   one set of functions builds both.

   What each part counts:

   - Time watched: EVERY title once, rated or not, plus one extra
     viewing for each logged date beyond the first. For a series,
     its length is episodes x average episode minutes.

   - Top genres and Top actors: ranked by how many titles you've
     seen (everything on the list), with the average rating of the
     ones you've scored shown beside it.

   - Best decade: ranked by average rating, so only scored titles
     count, and a decade needs a minimum to take the top spot:
   ============================================================ */

const MIN_DECADE_ITEMS = 3;

const $$ = sel => document.querySelector(sel);
const content = $$('#content');

const COLLECTIONS = [
  {
    key: 'movies', label: 'Movies', items: window.MOVIES || [],
    one: 'film', many: 'films', href: 'index.html', file: 'movies.js',
    lengthNote: 'runtime'
  },
  {
    key: 'series', label: 'Series', items: window.SERIES || [],
    one: 'series', many: 'series', href: 'series.html', file: 'series.js',
    lengthNote: 'episodes × average episode length'
  }
];

/* ---------- helpers ---------- */

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/** Times you've seen something: at least once, plus any extra logged dates. */
function viewings(id) {
  return Math.max(1, Store.watchCount(id));
}

/** "1d 4h 30m" - the unit that makes the number legible. */
function fmtDuration(min) {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = Math.round(min % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function group(items) {
  return { avg: mean(items.map(m => Store.getRating(m.id))), n: items.length, films: items };
}

/* ---------- the four questions, per collection ---------- */

function byDecade(rated) {
  const buckets = {};
  rated.forEach(m => {
    if (!m.year) return;
    (buckets[decadeOf(m.year)] = buckets[decadeOf(m.year)] || []).push(m);
  });
  return Object.entries(buckets)
    .map(([d, items]) => ({ key: d + 's', sortKey: +d, ...group(items) }))
    .sort((a, b) => b.avg - a.avg || a.sortKey - b.sortKey);
}

/** Seen-count + average rating for a bucket of titles.
    n = every title on the list (seen), rated = those with a score. */
function seenGroup(items) {
  const scores = items.map(m => Store.getRating(m.id)).filter(r => r !== null);
  return { n: items.length, rated: scores.length, avg: scores.length ? mean(scores) : null, films: items };
}

/** Most watched first; ties go to the better average, then A-Z. */
function bySeen(a, b) {
  return b.n - a.n || (b.avg ?? -1) - (a.avg ?? -1) || a.key.localeCompare(b.key);
}

function byGenre(items) {
  const buckets = {};
  items.forEach(m => m.genres.forEach(g => (buckets[g] = buckets[g] || []).push(m)));
  return Object.entries(buckets)
    .map(([g, list]) => ({ key: g, ...seenGroup(list) }))
    .sort(bySeen);
}

function byActor(items) {
  const buckets = {};
  items.forEach(m => {
    ((window.CAST || {})[m.id] || []).forEach(name => {
      (buckets[name] = buckets[name] || []).push(m);
    });
  });
  return Object.entries(buckets)
    .map(([name, list]) => ({ key: name, ...seenGroup(list) }))
    .sort(bySeen);
}

function watchTime(items) {
  let base = 0, extra = 0, unknown = 0;
  items.forEach(m => {
    if (!m.runtime) { unknown++; return; }
    base += m.runtime;
    extra += m.runtime * (viewings(m.id) - 1);
  });
  return { base, extra, total: base + extra, unknown };
}

/* ---------- chart pieces ---------- */

/** One horizontal bar. Bars start at zero - a truncated axis would
    exaggerate small differences between averages. */
function barRow(row, isTop, min, noun) {
  const thin = min && row.n < min;
  return `
    <div class="bar-row ${isTop ? 'top' : ''} ${thin ? 'thin' : ''}"
         title="${escapeHtml(row.key)}: ${fmtRating(row.avg)} from ${row.n} rated ${row.n === 1 ? noun.one : noun.many}">
      <div class="bar-name">${escapeHtml(row.key)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(row.avg / 10 * 100).toFixed(1)}%"></div>
      </div>
      <div class="bar-val">${fmtRating(row.avg)}</div>
      <div class="bar-sub">${row.n} ${row.n === 1 ? noun.one : noun.many}</div>
    </div>`;
}

/** rows must already be sorted; `min` fades rows too thin to rank. */
function barChart(rows, min, noun) {
  if (!rows.length) return '';
  const topIndex = rows.findIndex(r => !min || r.n >= min);
  return `<div class="bars">${rows.map((r, i) => barRow(r, i === topIndex, min, noun)).join('')}</div>
          <div class="chart-foot">
            <span class="swatch-gold"></span> highest average · bars run from 0 to 10
            ${min ? `· faded rows have fewer than ${min} rated ${noun.many} and aren't ranked` : ''}
          </div>`;
}

/** Ranked table: position, name, a bar for how many you've seen (from
    zero, against the most-watched row), the count, and the average of
    the ones you've rated. `detail` adds a second line under the name. */
function seenTable(rows, noun, firstCol, detail) {
  if (!rows.length) return '';
  const max = rows[0].n || 1;
  const plural = n => n === 1 ? noun.one : noun.many;
  return `
    <div class="seen-table">
      <div class="seen-row seen-head">
        <span></span><span>${firstCol}</span><span></span>
        <span>Seen</span><span>Avg rating</span>
      </div>
      ${rows.map((r, i) => `
        <div class="seen-row ${i === 0 ? 'top' : ''}"
             title="${escapeHtml(r.key)}: ${r.n} ${plural(r.n)} seen${r.avg !== null ? `, average ${fmtRating(r.avg)} from ${r.rated} rated` : ', none rated yet'}">
          <span class="rk">${String(i + 1).padStart(2, '0')}</span>
          <span class="nm-wrap">
            <span class="nm">${escapeHtml(r.key)}</span>
            ${detail ? `<span class="films">${detail(r)}</span>` : ''}
          </span>
          <span class="track"><i style="width:${(r.n / max * 100).toFixed(1)}%"></i></span>
          <span class="cnt"><b>${r.n}</b> ${plural(r.n)}</span>
          <span class="sc" style="color:${r.avg === null ? 'var(--dim)' : ratingColor(r.avg)}">
            ${r.avg === null ? '—' : fmtRating(r.avg)}
            <small>${r.rated ? r.rated + ' rated' : 'unrated'}</small>
          </span>
        </div>`).join('')}
    </div>
    <div class="chart-foot"><span class="swatch-gold"></span> most watched · bars show how many you've seen, from zero</div>`;
}

/* ---------- one collection's whole block ---------- */

function sectionFor(col) {
  const items = col.items;
  const noun = { one: col.one, many: col.many };

  const head = `
    <div class="section-head big">
      <h2>${col.label}</h2>
      <span class="section-count">${items.length} ${items.length === 1 ? col.one : col.many}</span>
    </div>`;

  if (!items.length) {
    return `<div class="stats-block">${head}
      <div class="needs-ratings small">
        <h3>No ${col.many} listed yet</h3>
        <p>Once ${BOOT.readonly ? 'they add' : 'you add'} some with <b>+ Add</b>, every number on this page
           picks them up automatically.</p>
      </div></div>`;
  }

  const R = items.filter(m => Store.getRating(m.id) !== null);
  const time = watchTime(items);
  const rewatches = items.reduce((n, m) => n + Math.max(0, Store.watchCount(m.id) - 1), 0);
  const overallAvg = mean(R.map(m => Store.getRating(m.id)));

  let html = `<div class="stats-block">${head}
    <div class="stat-row">
      <div class="tile hero">
        <span class="lbl">Time spent watching ${col.many}</span>
        <div class="val">${fmtDuration(time.total)}</div>
        <div class="sub">
          ${Math.round(time.total / 60).toLocaleString()} hours across ${items.length} ${col.many},
          counting every one once${time.extra ? ` plus ${rewatches} logged rewatch${rewatches === 1 ? '' : 'es'} (${fmtDuration(time.extra)})` : ''}.
          ${col.key === 'series' ? 'A series counts as its episodes × average episode length.' : ''}
          ${time.unknown ? `${time.unknown} ${time.unknown === 1 ? col.one + " has no length yet and isn't" : col.many + " have no length yet and aren't"} counted.` : ''}
        </div>
      </div>

      <div class="tile">
        <span class="lbl">${col.label} rated</span>
        <div class="val">${R.length}<small>/ ${items.length}</small></div>
        <div class="sub">${items.length - R.length} still to score</div>
      </div>

      <div class="tile">
        <span class="lbl">Average rating</span>
        <div class="val" style="color:${R.length ? ratingColor(Math.round(overallAvg * 10) / 10) : 'var(--dim)'}">
          ${R.length ? fmtRating(overallAvg) : '--'}
        </div>
        <div class="sub">across everything you've scored</div>
      </div>

      <div class="tile">
        <span class="lbl">Rewatches logged</span>
        <div class="val">${rewatches}</div>
        <div class="sub">${rewatches ? 'extra viewings on top of the first' : 'log dates to track these'}</div>
      </div>
    </div>`;

  const who = BOOT.readonly ? BOOT.viewing.username : 'you';
  const whoHas = BOOT.readonly ? `${BOOT.viewing.username} has` : "you've";

  /* genres - by how many seen */
  const genres = byGenre(items);
  html += `
    <div class="section">
      <div class="section-head"><h2>Top genres</h2></div>
      <p class="note">
        Every genre ranked by how many ${col.many} ${whoHas} seen in it, with the average
        rating of the ones ${who === 'you' ? "you've" : 'they have'} scored. A title counts towards every genre it carries.
      </p>
      ${genres.length ? seenTable(genres, noun, 'Genre') : `<p class="note">No genres listed yet.</p>`}
    </div>`;

  /* actors - by how many seen */
  const actors = byActor(items).slice(0, 20);
  html += `
    <div class="section">
      <div class="section-head"><h2>Top actors</h2></div>
      <p class="note">
        The 20 actors ${who === 'you' ? "you've" : `${escapeHtml(who)} has`} seen most, ranked by how many of
        ${who === 'you' ? 'your' : 'their'} ${col.many} they're in, with the average rating of those
        ${col.many}. Based on the top three billed actors, not the full cast.
      </p>
      ${actors.length ? seenTable(actors, noun, 'Actor', a => escapeHtml(
          a.films.slice()
            .sort((x, y) => (Store.getRating(y.id) ?? -1) - (Store.getRating(x.id) ?? -1))
            .slice(0, 3).map(m => m.title).join(', ')) + (a.n > 3 ? ' …' : ''))
        : `<p class="note">No cast listed for these ${col.many} yet.</p>`}
    </div>`;

  /* decade - by rating, so it needs some scores */
  if (!R.length) {
    return html + `
      <div class="needs-ratings small">
        <h3>Rate some ${col.many} to find the best decade</h3>
        <p>Best decade comes from the scores ${who === 'you' ? 'you give' : 'they give'}. Everything above already works.</p>
        ${BOOT.readonly ? '' : `<a class="btn btn-primary" href="${col.href}">Go to ${col.label.toLowerCase()}</a>`}
      </div></div>`;
  }
  const decades = byDecade(R);
  const thinDecades = decades.filter(d => d.n < MIN_DECADE_ITEMS);
  html += `
    <div class="section">
      <div class="section-head"><h2>Best decade</h2></div>
      <p class="note">
        Average of the ratings for the ${col.many} scored from each decade. A decade
        needs at least ${MIN_DECADE_ITEMS} rated ${col.many} to take the top spot${thinDecades.length
          ? `, which rules out ${thinDecades.map(d => escapeHtml(d.key)).join(', ')} for now` : ''}.
      </p>
      ${barChart(decades, MIN_DECADE_ITEMS, noun)}
    </div>`;

  return html + '</div>';
}

/* ---------- combined headline ---------- */

function combinedTotal() {
  const all = COLLECTIONS.reduce((acc, c) => acc.concat(c.items), []);
  if (COLLECTIONS.every(c => c.items.length === 0)) return '';
  const t = watchTime(all);
  const counts = COLLECTIONS.map(c => `${c.items.length} ${c.items.length === 1 ? c.one : c.many}`);
  return `
    <div class="stat-row" style="margin-bottom:34px">
      <div class="tile hero">
        <span class="lbl">Total time spent watching</span>
        <div class="val">${fmtDuration(t.total)}</div>
        <div class="sub">
          ${Math.round(t.total / 60).toLocaleString()} hours across ${counts.join(' and ')},
          counting every title once plus every rewatch you've logged.
        </div>
      </div>
    </div>`;
}

function render() {
  renderHeaderStats(window.MOVIES || []);
  if (BOOT.readonly) $$('#gsub').textContent = `What ${BOOT.viewing.username}'s ratings and viewing habits add up to.`;
  content.innerHTML = combinedTotal() + COLLECTIONS.map(sectionFor).join('');
}

render();

/* (No "reload when another tab changes something" here any more. Ratings
   live in the database now, and that listener also fired on the poster
   cache and the sign-in session, so two open tabs reloaded each other
   endlessly.) */
