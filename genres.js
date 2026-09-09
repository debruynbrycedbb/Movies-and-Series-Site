/* ============================================================
   TOP BY GENRE

   The same analysis run twice - once over films, once over series.
   For each genre, the highest rated title you've scored, plus the
   next three behind it. Ties break towards whichever you rated
   first, since you committed to that one earlier.
   ============================================================ */

const $$ = sel => document.querySelector(sel);
const content = $$('#content');

const COLLECTIONS = [
  { key: 'movies', label: 'Movies', items: window.MOVIES || [], one: 'film',   many: 'films',  href: 'index.html' },
  { key: 'series', label: 'Series', items: window.SERIES || [], one: 'series', many: 'series', href: 'series.html' }
];

/** Every genre appearing anywhere in a collection, alphabetically. */
function allGenres(items) {
  const set = new Set();
  items.forEach(m => m.genres.forEach(g => set.add(g)));
  return [...set].sort();
}

/** Rated titles in a genre, best first. */
function rankedIn(items, genre) {
  return items
    .filter(m => m.genres.includes(genre) && Store.getRating(m.id) !== null)
    .sort((a, b) => {
      const d = Store.getRating(b.id) - Store.getRating(a.id);
      if (d !== 0) return d;
      const t = Store.getRatedAt(a.id) - Store.getRatedAt(b.id);
      if (t !== 0) return t;
      return a.title.localeCompare(b.title);
    });
}

function metaLine(m) {
  const bits = [];
  if (m.year) bits.push(String(m.year));
  if (m.director) bits.push(m.director);
  if (m.kind === 'series' && m.seasons) {
    bits.push(m.seasons + (m.seasons === 1 ? ' season' : ' seasons'));
  } else {
    const rt = fmtRuntime(m.runtime);
    if (rt) bits.push(rt);
  }
  return bits.join(' · ');
}

function cardHtml(genre, ranked, totalInGenre, col) {
  const win = ranked[0];
  const r = Store.getRating(win.id);
  const runners = ranked.slice(1, 4);

  return `
    <div class="gcard">
      <div class="gcard-head">
        <h2>${escapeHtml(genre)}</h2>
        <span class="gcard-count">${ranked.length} of ${totalInGenre} rated</span>
      </div>

      <div class="gwin">
        <div class="gwin-poster">${posterInner(win)}</div>
        <div class="gwin-body">
          <span class="gwin-crown">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 3L12 4l4.5 6L21 7l-1.6 11H4.6z"/></svg>
            Best ${escapeHtml(genre)}
          </span>
          <h3>${escapeHtml(win.title)}</h3>
          <div class="gwin-meta">${escapeHtml(metaLine(win))}</div>
          <div class="gwin-score" style="color:${ratingColor(r)}">${fmtRating(r)}<small>/10</small></div>
        </div>
      </div>

      ${runners.length ? `
        <div class="grunners">
          ${runners.map((m, i) => `
            <div class="grun">
              <span class="r">${i + 2}</span>
              <span class="t">${escapeHtml(m.title)}</span>
              <span class="s" style="color:${ratingColor(Store.getRating(m.id))}">${fmtRating(Store.getRating(m.id))}</span>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
}

/** One collection's whole block: heading, cards, and the leftovers. */
function sectionHtml(col) {
  const items = col.items;
  const head = `
    <div class="section-head big">
      <h2>${col.label}</h2>
      <span class="section-count">${items.length} ${items.length === 1 ? col.one : col.many}</span>
    </div>`;

  if (!items.length) {
    return `<div class="section">${head}
      <div class="needs-ratings small">
        <h3>No ${col.many} listed yet</h3>
        <p>Add them to <code>${col.key === 'series' ? 'series.js' : 'movies.js'}</code>
           and their genres appear here automatically.</p>
      </div></div>`;
  }

  const genres = allGenres(items);
  const counts = {};
  genres.forEach(g => { counts[g] = items.filter(m => m.genres.includes(g)).length; });

  const withWinner = [];
  const withoutWinner = [];
  genres.forEach(g => {
    const ranked = rankedIn(items, g);
    if (ranked.length) withWinner.push({ g, ranked });
    else withoutWinner.push(g);
  });

  // strongest picks lead
  withWinner.sort((a, b) =>
    Store.getRating(b.ranked[0].id) - Store.getRating(a.ranked[0].id) || a.g.localeCompare(b.g));

  if (!withWinner.length) {
    return `<div class="section">${head}
      <div class="needs-ratings small">
        <h3>Nothing rated yet</h3>
        <p>This picks the best of your ${col.many} in each of the ${genres.length} genres
           they cover. Rate a few and it fills itself in.</p>
        <a class="btn btn-primary" href="${col.href}">Go to ${col.label.toLowerCase()}</a>
      </div></div>`;
  }

  let html = `<div class="section">${head}
    <div class="genre-grid">
      ${withWinner.map(x => cardHtml(x.g, x.ranked, counts[x.g], col)).join('')}
    </div>`;

  if (withoutWinner.length) {
    html += `
      <div class="genre-unrated">
        <h3>No ratings yet in these genres</h3>
        <div class="tags">
          ${withoutWinner.map(g =>
            `<span class="tag">${escapeHtml(g)} <span style="opacity:.6">${counts[g]}</span></span>`).join('')}
        </div>
      </div>`;
  }

  return html + '</div>';
}

function render() {
  renderHeaderStats(window.MOVIES || []);

  const totals = COLLECTIONS.map(c => c.items.length);
  $$('#gsub').textContent = totals[1]
    ? `My highest rated film and series in every genre — ${totals[0]} films and ${totals[1]} series.`
    : 'My highest rated film in every genre.';

  content.innerHTML = COLLECTIONS.map(sectionHtml).join('');
}

render();

// Posters arrive in the background on a first visit; repaint when they land.
let repaint;
Posters.onResolved(() => {
  clearTimeout(repaint);
  repaint = setTimeout(render, 220);
});
Posters.warm(ALL_ITEMS.filter(m => Store.getRating(m.id) !== null));

window.addEventListener('storage', e => {
  if (e.key && e.key.startsWith('cinevault.')) location.reload();
});
