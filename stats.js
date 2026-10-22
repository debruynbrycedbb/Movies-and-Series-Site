/* ============================================================
   STATISTICS

   Everything here is computed twice: once over your films, once
   over your series. The two blocks are identical in shape, so
   one set of functions builds both.

   Two kinds of number live on this page:

   - Time watched counts EVERY title in the collection once,
     whether or not you've rated it, plus one extra viewing for
     each date in its watch history beyond the first. So the
     number starts at "I've seen all of these once" and grows as
     you log rewatches. For a series, its length is episodes x
     average episode minutes.

   - Everything else is rating-based and only counts titles you
     have actually scored.

   Averages over a group of one or two titles are noise, so
   decades, genres and actors need a minimum to be ranked. The
   thresholds are right here:
   ============================================================ */

const MIN_DECADE_ITEMS = 3;
const MIN_GENRE_ITEMS  = 3;
const MIN_ACTOR_ITEMS  = 3;

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

function byGenre(rated) {
  const buckets = {};
  rated.forEach(m => m.genres.forEach(g => (buckets[g] = buckets[g] || []).push(m)));
  return Object.entries(buckets)
    .map(([g, items]) => ({ key: g, ...group(items) }))
    .sort((a, b) => b.avg - a.avg || a.key.localeCompare(b.key));
}

function byActor(rated) {
  const buckets = {};
  rated.forEach(m => {
    ((window.CAST || {})[m.id] || []).forEach(name => {
      (buckets[name] = buckets[name] || []).push(m);
    });
  });
  return Object.entries(buckets)
    .map(([name, items]) => ({ key: name, ...group(items) }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n || a.key.localeCompare(b.key));
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

  if (!R.length) {
    return html + `
      <div class="needs-ratings small">
        <h3>Rate some ${col.many} to unlock the rest</h3>
        <p>Best decade, genre and actors all come from the scores you give. The time
           above already counts everything, so that part works from day one.</p>
        <a class="btn btn-primary" href="${col.href}">Go to ${col.label.toLowerCase()}</a>
      </div></div>`;
  }

  /* decade */
  const decades = byDecade(R);
  const thinDecades = decades.filter(d => d.n < MIN_DECADE_ITEMS);
  html += `
    <div class="section">
      <div class="section-head"><h2>Best decade</h2></div>
      <p class="note">
        Average of your ratings for the ${col.many} you've scored from each decade. A decade
        needs at least ${MIN_DECADE_ITEMS} rated ${col.many} to take the top spot${thinDecades.length
          ? `, which rules out ${thinDecades.map(d => escapeHtml(d.key)).join(', ')} for now` : ''}.
      </p>
      ${barChart(decades, MIN_DECADE_ITEMS, noun)}
    </div>`;

  /* genre */
  const genresAll = byGenre(R);
  const genres = genresAll.filter(g => g.n >= MIN_GENRE_ITEMS);
  const thinGenres = genresAll.filter(g => g.n < MIN_GENRE_ITEMS);
  html += `
    <div class="section">
      <div class="section-head"><h2>Best genre</h2></div>
      <p class="note">
        Genres need at least ${MIN_GENRE_ITEMS} rated ${col.many} to be ranked — one 10/10
        shouldn't crown a genre. Titles count towards every genre they carry.
        ${thinGenres.length ? `${thinGenres.length} genre${thinGenres.length === 1 ? '' : 's'} below the threshold: ` +
          thinGenres.map(g => escapeHtml(g.key)).join(', ') + '.' : ''}
      </p>
      ${genres.length
        ? barChart(genres, 0, noun)
        : `<p class="note">No genre has ${MIN_GENRE_ITEMS} rated ${col.many} yet.</p>`}
    </div>`;

  /* actors */
  const actorsAll = byActor(R);
  const actors = actorsAll.filter(a => a.n >= MIN_ACTOR_ITEMS).slice(0, 15);
  html += `
    <div class="section">
      <div class="section-head"><h2>Top actors</h2></div>
      <p class="note">
        Ranked by the average of your ratings for their ${col.many}, counting only actors with
        at least ${MIN_ACTOR_ITEMS} rated. Based on the top three billed actors,
        not the full cast.
      </p>
      ${actors.length ? `
        <div class="actor-list">
          ${actors.map((a, i) => `
            <div class="actor ${i === 0 ? 'top' : ''}">
              <div class="rk">${String(i + 1).padStart(2, '0')}</div>
              <div>
                <div class="nm">${escapeHtml(a.key)}</div>
                <div class="films">${a.n} ${a.n === 1 ? col.one : col.many} · ${escapeHtml(
                  a.films.slice()
                    .sort((x, y) => Store.getRating(y.id) - Store.getRating(x.id))
                    .slice(0, 3).map(m => m.title).join(', ')
                )}${a.n > 3 ? ' …' : ''}</div>
              </div>
              <div class="track"><i style="width:${(a.avg / 10 * 100).toFixed(1)}%"></i></div>
              <div class="sc" style="color:${ratingColor(a.avg)}">${fmtRating(a.avg)}</div>
            </div>`).join('')}
        </div>
        <div class="chart-foot"><span class="swatch-gold"></span> highest average · bars run from 0 to 10</div>`
        : `<p class="note">No actor has ${MIN_ACTOR_ITEMS} rated ${col.many} yet}.</p>`}
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

window.addEventListener('storage', e => {
  if (e.key && e.key.startsWith('cinevault.')) location.reload();
});
