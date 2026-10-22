/* ============================================================
   DATA LAYER

   The only file that talks to Supabase (DB) and to TMDB (TMDB).
   Every page goes through these two objects, so if anything about
   the database changes, this is the one place to look.
   ============================================================ */

const DB = (() => {
  let sb = null;
  const PAGE = 1000;               // Supabase returns at most 1000 rows per request

  function client() {
    if (sb) return sb;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('The Supabase library did not load. Check your connection and reload.');
    }
    sb = window.supabase.createClient(SITE.supabaseUrl, SITE.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cinevault.auth' }
    });
    return sb;
  }

  /** Turn a Supabase {data, error} into data, or a readable thrown error. */
  function unwrap({ data, error }) {
    if (error) throw new Error(error.message || String(error));
    return data;
  }

  /** Fetch every row of a query, 1000 at a time. */
  async function all(build) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const rows = unwrap(await build().range(from, from + PAGE - 1));
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  return {
    /* ---------- session & members ---------- */

    /** Is there already a browser session? Never creates one. */
    async hasSession() {
      const { data } = await client().auth.getSession();
      return !!(data && data.session);
    },

    /** Make sure this browser has a (silent, anonymous) session. */
    async ensureSession() {
      const c = client();
      const { data } = await c.auth.getSession();
      if (data && data.session) return data.session;
      const res = await c.auth.signInAnonymously();
      if (res.error) {
        if (/anonymous/i.test(res.error.message)) {
          throw new Error('Sign-in is not switched on yet. In Supabase, open Authentication → ' +
            'Sign In / Providers and turn on "Allow anonymous sign-ins".');
        }
        throw new Error(res.error.message);
      }
      return res.data.session;
    },

    /** The member this browser is signed in as, or null. */
    async me() {
      const rows = unwrap(await client().rpc('me'));
      return (rows && rows[0]) || null;
    },

    async register(username, pin, code) {
      return unwrap(await client().rpc('register', { p_username: username, p_pin: pin, p_code: code }));
    },

    async login(username, pin) {
      return unwrap(await client().rpc('login', { p_username: username, p_pin: pin }));
    },

    /* Unlinks this browser from your name. The silent browser session
       itself is kept, so signing back in doesn't create a new one. */
    async logout() {
      unwrap(await client().rpc('logout'));
    },

    async changePin(oldPin, newPin) {
      return unwrap(await client().rpc('change_pin', { p_old: oldPin, p_new: newPin }));
    },

    async members() {
      return unwrap(await client().from('profiles')
        .select('id, username, created_at').order('username'));
    },

    /* ---------- reading lists ---------- */

    /** A member's whole list, each row carrying its catalogue entry as `t`. */
    async loadList(profileId) {
      return all(() => client().from('user_titles')
        .select('title_id, rating, rated_at, seasons_watched, episodes_watched, added_at, t:titles(*)')
        .eq('user_id', profileId)
        .order('added_at').order('title_id'));
    },

    async loadWatches(profileId) {
      return all(() => client().from('watches')
        .select('title_id, watched_on')
        .eq('user_id', profileId)
        .order('title_id').order('watched_on'));
    },

    /** Everyone's rating for one title: [{ user_id, rating }]. */
    async titleRatings(titleId) {
      return unwrap(await client().from('user_titles')
        .select('user_id, rating').eq('title_id', titleId));
    },

    /** Which of these titles a member already has. */
    async hasTitles(profileId, titleIds) {
      const out = [];
      for (const part of chunk(titleIds, 80)) {        // keeps the URL short
        const rows = unwrap(await client().from('user_titles')
          .select('title_id').eq('user_id', profileId).in('title_id', part));
        rows.forEach(r => out.push(r.title_id));
      }
      return out;
    },

    /* ---------- changing your own list ---------- */

    async updateProgress(profileId, titleId, seasons, episodes) {
      unwrap(await client().from('user_titles')
        .update({ seasons_watched: seasons, episodes_watched: episodes })
        .eq('user_id', profileId).eq('title_id', titleId));
    },

    async setRating(profileId, titleId, rating) {
      unwrap(await client().from('user_titles')
        .update({ rating, rated_at: rating === null ? null : new Date().toISOString() })
        .eq('user_id', profileId).eq('title_id', titleId));
    },

    async addWatch(profileId, titleId, date) {
      unwrap(await client().from('watches')
        .upsert({ user_id: profileId, title_id: titleId, watched_on: date },
                { onConflict: 'user_id,title_id,watched_on', ignoreDuplicates: true }));
    },

    async removeWatch(profileId, titleId, date) {
      unwrap(await client().from('watches').delete()
        .eq('user_id', profileId).eq('title_id', titleId).eq('watched_on', date));
    },

    async clearWatches(profileId, titleId) {
      unwrap(await client().from('watches').delete()
        .eq('user_id', profileId).eq('title_id', titleId));
    },

    /** Add titles to the shared catalogue (or find them). Returns ids in order. */
    async upsertTitles(items) {
      const ids = [];
      for (const part of chunk(items, 100)) {
        const rows = unwrap(await client().rpc('upsert_titles', { p_items: part }));
        rows.sort((a, b) => a.out_idx - b.out_idx).forEach(r => ids.push(r.out_id));
      }
      return ids;
    },

    /** Put rows on your list. keepExisting leaves rows you already have alone. */
    async addToList(rows, keepExisting) {
      for (const part of chunk(rows, 200)) {
        unwrap(await client().from('user_titles')
          .upsert(part, { onConflict: 'user_id,title_id', ignoreDuplicates: !!keepExisting }));
      }
    },

    async removeFromList(profileId, titleId) {
      unwrap(await client().from('user_titles').delete()
        .eq('user_id', profileId).eq('title_id', titleId));
    },

    async addWatches(rows) {
      for (const part of chunk(rows, 300)) {
        unwrap(await client().from('watches')
          .upsert(part, { onConflict: 'user_id,title_id,watched_on', ignoreDuplicates: true }));
      }
    }
  };
})();


/* ============================================================
   TMDB - searching, details for "+ Add", and matching old titles
   ============================================================ */

const TMDB = (() => {
  const BASE = 'https://api.themoviedb.org/3/';

  // TMDB's genre names, folded into the ones this site has always used.
  const GENRE_MAP = {
    'Science Fiction': ['Sci-Fi'],
    'Sci-Fi & Fantasy': ['Sci-Fi', 'Fantasy'],
    'Action & Adventure': ['Action', 'Adventure'],
    'War & Politics': ['War'],
    'Kids': ['Family'],
    'TV Movie': []
  };

  function mapGenres(list) {
    const out = [];
    (list || []).forEach(g => {
      const name = g.name || g;
      (GENRE_MAP[name] || [name]).forEach(x => { if (!out.includes(x)) out.push(x); });
    });
    return out.slice(0, 3);
  }

  async function get(path, params) {
    const q = new URLSearchParams(Object.assign({ api_key: SITE.tmdbApiKey }, params || {}));
    const res = await fetch(BASE + path + '?' + q);
    if (!res.ok) throw new Error('TMDB responded ' + res.status);
    return res.json();
  }

  const yearOf = d => parseInt(String(d || '').slice(0, 4), 10) || 0;

  /** Two names, joined; more than two, the first two and "…". */
  function names(list) {
    const n = (list || []).map(x => x.name).filter(Boolean);
    if (n.length <= 2) return n.join(' & ');
    return n.slice(0, 2).join(' & ') + ' …';
  }

  return {
    posterUrl(path, size) {
      return path ? 'https://image.tmdb.org/t/p/' + (size || 'w500') + path : null;
    },

    /** Search results for the "+ Add" box. */
    async search(kind, query) {
      const data = await get(kind === 'series' ? 'search/tv' : 'search/movie',
                             { query, include_adult: 'false' });
      return (data.results || []).slice(0, 12).map(r => ({
        tmdb_id: r.id,
        title: kind === 'series' ? r.name : r.title,
        year: yearOf(kind === 'series' ? r.first_air_date : r.release_date),
        poster_path: r.poster_path || null
      }));
    },

    /** Everything we store about one title, in the database's shape. */
    async details(kind, id) {
      if (kind === 'series') {
        const d = await get('tv/' + id, { append_to_response: 'credits' });
        const seasons = (d.seasons || [])
          .filter(s => s.season_number > 0 && s.episode_count > 0)
          .map(s => ({ n: s.season_number, episodes: s.episode_count }));
        return {
          kind: 'series',
          tmdb_id: d.id,
          title: d.name,
          year: yearOf(d.first_air_date),
          seasons: d.number_of_seasons || seasons.length,
          episodes: d.number_of_episodes || seasons.reduce((a, s) => a + s.episodes, 0),
          ep_mins: (d.episode_run_time && d.episode_run_time[0])
                   || (d.last_episode_to_air && d.last_episode_to_air.runtime)
                   || 45,
          genres: mapGenres(d.genres),
          director: names(d.created_by),
          cast: ((d.credits && d.credits.cast) || []).slice(0, 3).map(c => c.name),
          poster_path: d.poster_path || null,
          seasonList: seasons
        };
      }
      const d = await get('movie/' + id, { append_to_response: 'credits' });
      const directors = ((d.credits && d.credits.crew) || []).filter(c => c.job === 'Director');
      return {
        kind: 'movie',
        tmdb_id: d.id,
        title: d.title,
        year: yearOf(d.release_date),
        runtime: d.runtime || 0,
        genres: mapGenres(d.genres),
        director: names(directors),
        cast: ((d.credits && d.credits.cast) || []).slice(0, 3).map(c => c.name),
        poster_path: d.poster_path || null
      };
    },

    /** Find the TMDB entry for one of the old hand-typed titles.
        Only accepts a result within a year of ours, so a wrong match
        is unlikely - no match is better than the wrong film. */
    async match(kind, title, year) {
      const path = kind === 'series' ? 'search/tv' : 'search/movie';
      const yearKey = kind === 'series' ? 'first_air_date_year' : 'year';
      const dateKey = kind === 'series' ? 'first_air_date' : 'release_date';
      const nameKey = kind === 'series' ? 'name' : 'title';

      const tries = year ? [{ [yearKey]: year }, {}] : [{}];
      for (const extra of tries) {
        const data = await get(path, Object.assign({ query: title, include_adult: 'false' }, extra));
        const results = data.results || [];
        const hit = year
          ? results.find(r => Math.abs(yearOf(r[dateKey]) - year) <= 1)
          : results.find(r => String(r[nameKey]).toLowerCase() === title.toLowerCase());
        if (hit) return { tmdb_id: hit.id, poster_path: hit.poster_path || null };
      }
      return null;
    }
  };
})();
