/* ============================================================
   BOOT - runs first on every page

   1. Makes sure this browser is signed in as a member. If not,
      sends it to login.html.
   2. Works out whose list we're looking at: yours, or another
      member's if the address ends in ?u=their-name.
   3. Loads that list from the database and shapes it exactly like
      the old movies.js / series.js / cast.js did, so every page
      script keeps working unchanged.
   4. Adds the member bar, keeps ?u= on the menu links, adds the
      TMDB credit, then loads the page's own scripts in order.

   A page uses it like this:
     <script src="boot.js" data-scripts="core.js library.js" data-kind="movie"></script>
   ============================================================ */

(() => {
  const me_script = document.currentScript;
  const opts = me_script.dataset;
  const scripts = (opts.scripts || '').split(/\s+/).filter(Boolean);
  // a ?v=NN on boot.js is passed on to every script it loads, so a new
  // upload is picked up straight away instead of an old cached copy
  const version = new URL(me_script.src, location.href).searchParams.get('v');
  const pageKind = opts.kind || '';              // 'movie' | 'series' | ''
  const skipList = opts.list === 'none';         // compare page loads its own

  const params = new URLSearchParams(location.search);
  const wantUser = (params.get('u') || '').toLowerCase();

  /* ---------- loader ---------- */

  const loader = document.createElement('div');
  loader.className = 'boot-loader';
  loader.innerHTML = '<span class="spinner"></span><span class="boot-text">Opening the vault…</span>';
  const mountLoader = () => document.body.appendChild(loader);
  if (document.body) mountLoader(); else document.addEventListener('DOMContentLoaded', mountLoader);

  function fail(msg, retry) {
    loader.classList.add('error');
    loader.innerHTML = `
      <div class="boot-err">
        <h3>Couldn't open the vault</h3>
        <p>${String(msg).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>
        ${retry ? '<button class="btn btn-primary" onclick="location.reload()">Try again</button>' : ''}
      </div>`;
  }

  function slugify(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /** One database row -> the item shape the pages were written against. */
  function toItem(row, index) {
    const t = row.t;
    const isSeries = t.kind === 'series';
    const seasons  = row.seasons_watched  != null ? row.seasons_watched  : (t.seasons  || 0);
    const episodes = row.episodes_watched != null ? row.episodes_watched : (t.episodes || 0);
    const epMins   = t.ep_mins || 0;
    return {
      kind: t.kind,
      id: t.id,
      slug: (isSeries ? 'tv--' : '') + slugify(t.title),
      tmdbId: t.tmdb_id || null,
      title: t.title,
      year: t.year || 0,
      runtime: isSeries ? episodes * epMins : (t.runtime || 0),
      seasons, episodes, epMins,
      totalSeasons: t.seasons || 0,
      totalEpisodes: t.episodes || 0,
      genres: t.genres || [],
      director: t.director || '',
      cast: t.cast_names || [],
      poster: TMDB.posterUrl(t.poster_path, 'w500'),
      wiki: t.wiki || t.title,
      order: index
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = version ? src + '?v=' + version : src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.body.appendChild(s);
    });
  }

  /* ---------- member bar ---------- */

  function memberBar(B) {
    const bar = document.createElement('div');
    bar.className = 'member-bar' + (B.readonly ? ' viewing-other' : '');
    const opt = B.members.map(m =>
      `<option value="${m.username}" ${m.id === B.viewing.id ? 'selected' : ''}>` +
      `${m.id === B.me.id ? m.username + ' (you)' : m.username}</option>`).join('');

    bar.innerHTML = `
      <div class="mb-inner">
        <label class="mb-view">
          <span class="mb-label">${B.readonly ? 'Viewing' : 'List'}</span>
          <select id="memberPick" aria-label="Whose list to view">${opt}</select>
        </label>
        ${B.readonly
          ? `<span class="mb-note">Read-only — this is ${escapeText(B.viewing.username)}'s list.
               <a href="${withUser(location.pathname.split('/').pop() || 'index.html', null)}">Back to mine</a></span>`
          : `<span class="mb-note">Signed in as <b>${escapeText(B.me.username)}</b></span>`}
      </div>`;

    const header = document.querySelector('.site-header');
    if (header) header.insertAdjacentElement('afterend', bar);
    else document.body.prepend(bar);

    bar.querySelector('#memberPick').addEventListener('change', e => {
      const u = e.target.value;
      const page = location.pathname.split('/').pop() || 'index.html';
      location.href = withUser(page, u === B.me.username ? null : u);
    });
  }

  function escapeText(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function withUser(href, user) {
    if (!user) return href;
    return href + (href.indexOf('?') === -1 ? '?' : '&') + 'u=' + encodeURIComponent(user);
  }

  /** Keep "whose list" as you move between pages. */
  function rewriteNav(B) {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    if (!nav.querySelector('a[href="compare.html"]')) {
      nav.insertAdjacentHTML('beforeend', '<a href="compare.html">Compare</a>');
    }
    if (B.readonly) {
      document.querySelectorAll('.nav a, a.brand').forEach(a => {
        const h = a.getAttribute('href');
        if (h && h !== 'compare.html') a.setAttribute('href', withUser(h, B.viewing.username));
      });
    }
    const page = location.pathname.split('/').pop() || 'index.html';
    nav.querySelectorAll('a').forEach(a => {
      if ((a.getAttribute('href') || '').split('?')[0] === page) a.classList.add('active');
    });
  }

  function footer() {
    const f = document.createElement('footer');
    f.className = 'site-foot';
    f.innerHTML = `
      <img src="data:image/svg+xml,${encodeURIComponent(TMDB_LOGO)}" alt="TMDB" width="64" height="12">
      <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>`;
    document.body.appendChild(f);
  }

  // TMDB's short blue logo, drawn as text so there's no extra file to upload
  const TMDB_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 30"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#90cea1"/><stop offset=".56" stop-color="#3cbec9"/><stop offset="1" stop-color="#00b3e5"/></linearGradient></defs><rect width="160" height="30" rx="15" fill="url(#g)"/><text x="80" y="21" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700" fill="#0d253f" text-anchor="middle">TMDB</text></svg>`;

  /* ---------- go ---------- */

  async function run() {
    let me;
    try {
      await DB.ensureSession();
      me = await DB.me();
    } catch (e) {
      fail(e.message || e, true);
      return;
    }
    if (!me) {
      const next = (location.pathname.split('/').pop() || 'index.html') + location.search;
      location.replace('login.html?next=' + encodeURIComponent(next));
      return;
    }

    try {
      const members = await DB.members();
      const viewing = (wantUser && members.find(m => m.username === wantUser)) || me;

      const B = {
        me, members, viewing,
        readonly: viewing.id !== me.id,
        pageKind,
        ratings: {},          // title id -> { r, t }
        watches: {},          // title id -> ['YYYY-MM-DD', ...] newest first
        rows: {}              // title id -> the raw list row
      };

      let items = [];
      if (!skipList) {
        const [rows, watches] = await Promise.all([
          DB.loadList(viewing.id), DB.loadWatches(viewing.id)
        ]);
        items = rows.filter(r => r.t).map((r, i) => {
          B.rows[r.title_id] = r;
          if (r.rating !== null && r.rating !== undefined) {
            B.ratings[r.title_id] = { r: Number(r.rating), t: r.rated_at ? Date.parse(r.rated_at) : 0 };
          }
          return toItem(r, i);
        });
        watches.forEach(w => (B.watches[w.title_id] = B.watches[w.title_id] || []).push(w.watched_on));
        Object.values(B.watches).forEach(l => l.sort().reverse());
      }

      window.BOOT = B;
      window.MOVIES = items.filter(m => m.kind === 'movie');
      window.SERIES = items.filter(m => m.kind === 'series');
      window.CAST = Object.fromEntries(items.filter(m => m.cast.length).map(m => [m.id, m.cast]));
      if (pageKind === 'series') {
        window.PAGE_ITEMS = window.SERIES;
        window.PAGE_NOUN  = { one: 'series', many: 'series' };
      }

      // wording that changes with whose list it is
      B.whose = B.readonly ? viewing.username + "'s" : 'My';
      B.owner = B.readonly ? viewing.username : 'I';
      B.toItem = toItem;
      B.slugify = slugify;
      B.withUser = withUser;

      document.body.classList.toggle('readonly', B.readonly);
      memberBar(B);
      rewriteNav(B);
      footer();

      for (const src of scripts) await loadScript(src);
      loader.remove();
      window.BOOT_READY = true;
      document.dispatchEvent(new Event('cinevault:ready'));
    } catch (e) {
      console.error(e);
      fail(e.message || e, true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
