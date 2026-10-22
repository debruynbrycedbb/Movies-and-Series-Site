/* ============================================================
   IMPORT - old site -> your account

   Sources, any combination:
   - the original hand-typed list in movies.js / series.js / cast.js
   - ratings + watch dates the old site saved in this browser
   - a backup .json (old site's Export, or this site's Export)

   Ratings from more than one place: the newest wins. Watch dates
   combine. Titles already on your list are left untouched, so
   running this twice changes nothing the second time.
   ============================================================ */

(() => {
  const $ = s => document.querySelector(s);
  const Bt = window.BOOT;
  const esc = s => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const OLD = [].concat(window.MOVIES || [], window.SERIES || []);   // the old ids are title slugs
  const OLD_BY_ID = Object.fromEntries(OLD.map(m => [m.id, m]));
  const nFilms = (window.MOVIES || []).length;
  const nSeries = (window.SERIES || []).length;

  $('#who').textContent = Bt.me.username + "'s";
  $('#listInfo').innerHTML = `<b>${nFilms}</b> films and <b>${nSeries}</b> series, with their genres, directors and cast.`;
  $('#listWarn').hidden = Bt.me.username === 'bryce';

  /* ---------- what this browser has ---------- */

  function readLocal(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }
  const local = { ratings: readLocal('cinevault.ratings.v1'), watches: readLocal('cinevault.watches.v1') };
  const nLocalR = Object.keys(local.ratings).length;
  const nLocalW = Object.values(local.watches).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
  $('#browserInfo').innerHTML = nLocalR || nLocalW
    ? `Found <b>${nLocalR}</b> rating${nLocalR === 1 ? '' : 's'} and <b>${nLocalW}</b> watch date${nLocalW === 1 ? '' : 's'} from the old site.`
    : 'Nothing found in this browser. Use the browser (and device) where you rated on the old site, or a backup file.';
  if (!nLocalR && !nLocalW) { $('#useBrowser').checked = false; $('#useBrowser').disabled = true; }

  /* ---------- a backup file ---------- */

  let file = null;          // { ratings, watches, titles }
  $('#fileBtn').addEventListener('click', e => { e.preventDefault(); $('#file').click(); });
  $('#file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        file = parseBackup(obj);
        $('#useFile').disabled = false;
        $('#useFile').checked = true;
        $('#fileInfo').innerHTML = `<b>${esc(f.name)}</b>: ${file.summary}`;
        summary();
      } catch (err) {
        $('#fileInfo').innerHTML = `<span class="imp-warn">${esc(err.message || 'That file could not be read.')}</span>`;
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  function parseBackup(obj) {
    if (!obj || obj.app !== 'cinevault') throw new Error("That doesn't look like a CineVault backup.");
    // this site's export: a list of titles
    if (Array.isArray(obj.titles)) {
      return {
        ratings: {}, watches: {}, titles: obj.titles,
        summary: `${obj.titles.length} titles from ${esc(obj.member || 'a member')}'s list.`
      };
    }
    // the old site's export: ratings + watches keyed by old ids
    const r = obj.ratings || {}, w = obj.watches || {};
    const nr = Object.keys(r).length;
    const nw = Object.values(w).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
    return { ratings: r, watches: w, titles: [], summary: `${nr} ratings and ${nw} watch dates.` };
  }

  function summary() {
    const parts = [];
    if ($('#useList').checked) parts.push(`${nFilms + nSeries} titles`);
    if ($('#useBrowser').checked) parts.push(`${nLocalR} browser ratings`);
    if ($('#useFile').checked && file) parts.push('the backup file');
    $('#sum').textContent = parts.length ? 'Will bring in: ' + parts.join(', ') : 'Tick at least one thing to bring in.';
    $('#goBtn').disabled = !parts.length;
  }
  ['#useList', '#useBrowser', '#useFile'].forEach(s => $(s).addEventListener('change', summary));
  summary();

  /* ---------- the import ---------- */

  const prog = (frac, text) => {
    $('#prog').hidden = false;
    $('#bar').style.width = Math.round(frac * 100) + '%';
    $('#step').textContent = text;
  };

  /** Merge rating maps: { id: {r, t} | number }, newest wins. */
  function mergeRatings(into, from) {
    for (const [id, e] of Object.entries(from || {})) {
      const r = typeof e === 'number' ? e : e && e.r;
      if (typeof r !== 'number' || isNaN(r)) continue;
      const t = (e && e.t) || 0;
      if (!into[id] || into[id].t < t) into[id] = { r: Math.max(0, Math.min(10, Math.round(r * 10) / 10)), t };
    }
  }
  function mergeWatches(into, from) {
    for (const [id, list] of Object.entries(from || {})) {
      if (!Array.isArray(list)) continue;
      const set = new Set(into[id] || []);
      list.forEach(d => { if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d); });
      if (set.size) into[id] = [...set];
    }
  }

  async function pool(items, n, fn, onDone) {
    let next = 0, done = 0;
    const work = async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
        onDone(++done);
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, work));
  }

  $('#goBtn').addEventListener('click', async () => {
    const btn = $('#goBtn');
    btn.disabled = true;
    $('#done').hidden = true;
    ['#useList', '#useBrowser', '#useFile', '#useTmdb'].forEach(s => ($(s).disabled = true));

    try {
      /* 1. gather */
      const ratings = {}, watches = {};
      if ($('#useBrowser').checked) { mergeRatings(ratings, local.ratings); mergeWatches(watches, local.watches); }
      if ($('#useFile').checked && file) { mergeRatings(ratings, file.ratings); mergeWatches(watches, file.watches); }

      // entries: { src (old item shape), rating, rated_at, watched[] }
      const entries = [];
      const used = new Set();
      const addOld = m => {
        if (used.has(m.id)) return;
        used.add(m.id);
        entries.push({ m, r: ratings[m.id], w: watches[m.id] || [] });
      };
      if ($('#useList').checked) OLD.forEach(addOld);
      // ratings for titles from the old list even if the list itself isn't ticked
      Object.keys(ratings).concat(Object.keys(watches)).forEach(id => { if (OLD_BY_ID[id]) addOld(OLD_BY_ID[id]); });

      // this site's export format
      if ($('#useFile').checked && file && file.titles.length) {
        file.titles.forEach((t, i) => {
          if (!t || !t.title) return;
          const kind = t.kind === 'series' ? 'series' : 'movie';
          entries.push({
            m: { kind, id: 'file-' + i, title: t.title, year: t.year || 0, genres: [], director: '',
                 seasons: t.seasons || 0, episodes: t.episodes || 0, order: OLD.length + i },
            tmdbId: t.tmdb_id || null,
            r: typeof t.rating === 'number' ? { r: t.rating, t: Date.now() } : undefined,
            w: Array.isArray(t.watched) ? t.watched : []
          });
        });
      }
      if (!entries.length) throw new Error('Nothing to import — the old ratings here don\'t match any title.');

      /* 2. match on TMDB */
      let matched = 0;
      if ($('#useTmdb').checked) {
        prog(0, `Matching on TMDB… 0 of ${entries.length}`);
        await pool(entries, 6, async e => {
          if (e.tmdbId) { matched++; return; }
          try {
            const hit = await TMDB.match(e.m.kind, e.m.title, e.m.year);
            if (hit) { e.tmdbId = hit.tmdb_id; e.poster = hit.poster_path; matched++; }
          } catch (err) { /* no match is fine - it still imports */ }
        }, done => prog(done / entries.length * 0.7, `Matching on TMDB… ${done} of ${entries.length}`));
      }

      /* 3. catalogue */
      prog(0.72, 'Adding titles to the catalogue…');
      const castOf = m => (window.CAST || {})[m.id] || [];
      const ids = await DB.upsertTitles(entries.map(({ m, tmdbId, poster }) => ({
        kind: m.kind,
        tmdb_id: tmdbId || null,
        title: m.title,
        year: m.year || null,
        runtime: m.kind === 'movie' ? (m.runtime || null) : null,
        seasons: m.kind === 'series' ? (m.seasons || null) : null,
        episodes: m.kind === 'series' ? (m.episodes || null) : null,
        ep_mins: m.kind === 'series' ? (m.epMins || null) : null,
        genres: m.genres || [],
        director: m.director || '',
        cast: castOf(m),
        poster_path: poster || null,
        wiki: m.wiki && m.wiki !== m.title ? m.wiki : null
      })));

      /* 4. your list */
      prog(0.85, 'Putting them on your list…');
      // which of these you already have - those are left exactly as they are
      const already = new Set(await DB.hasTitles(Bt.me.id, [...new Set(ids.filter(Boolean))]));
      const base = Date.now() - entries.length * 1000;
      const rows = {}, wrows = [];
      let nr = 0, nw = 0;
      entries.forEach((e, i) => {
        const tid = ids[i];
        if (!tid || rows[tid]) return;       // two old lines that turned out to be one title
        rows[tid] = {
          user_id: Bt.me.id,
          title_id: tid,
          rating: e.r ? e.r.r : null,
          rated_at: e.r ? new Date(e.r.t || Date.now()).toISOString() : null,
          seasons_watched: e.m.kind === 'series' ? (e.m.seasons || null) : null,
          episodes_watched: e.m.kind === 'series' ? (e.m.episodes || null) : null,
          added_at: new Date(base + (e.m.order || i) * 1000).toISOString()
        };
        if (e.r && !already.has(tid)) nr++;
        e.w.forEach(d => { wrows.push({ user_id: Bt.me.id, title_id: tid, watched_on: d }); nw++; });
      });

      const fresh = Object.values(rows).filter(r => !already.has(r.title_id));
      await DB.addToList(Object.values(rows), true);

      prog(0.94, 'Adding watch dates…');
      if (wrows.length) await DB.addWatches(wrows);
      prog(1, 'Done');

      $('#done').className = 'imp-done';
      $('#done').innerHTML = `
        <b>All done.</b> ${fresh.length} title${fresh.length === 1 ? '' : 's'} added to your list${
          already.size ? ` (${already.size} you already had were left as they were)` : ''}${
          fresh.length ? `, with ${nr} rating${nr === 1 ? '' : 's'}` : ''}. ${nw ? `${nw} watch date${nw === 1 ? '' : 's'} checked and merged in.` : ''}
        ${$('#useTmdb').checked ? `${matched} of ${entries.length} matched on TMDB.` : ''}
        <br><a href="index.html">Go to Movies →</a> &nbsp; <a href="series.html">Series →</a>`;
      $('#done').hidden = false;
    } catch (err) {
      console.error(err);
      $('#done').className = 'imp-done err';
      $('#done').textContent = 'The import stopped: ' + (err.message || err) + ' — nothing is lost; you can run it again.';
      $('#done').hidden = false;
      btn.disabled = false;
      ['#useList', '#useBrowser', '#useTmdb'].forEach(s => ($(s).disabled = false));
      if (file) $('#useFile').disabled = false;
    }
  });
})();
