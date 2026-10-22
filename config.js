/* ============================================================
   SITE SETTINGS

   Everything in this file is safe to publish. The Supabase key
   below is a PUBLISHABLE key (sb_publishable_...), designed to sit
   in a public website - what members can see or change is enforced
   by the rules inside the database, not by keeping this secret.

   Never put a key starting with sb_secret_ in here.
   ============================================================ */

const SITE = {
  supabaseUrl: 'https://heprkuciviglhngfwfwq.supabase.co',
  supabaseKey: 'sb_publishable_NANHya4JQptxNEbLTY7mug_Den1vCzx',

  // Free from themoviedb.org. Powers "+ Add" search and posters.
  tmdbApiKey: 'bd77cc4549c176a32e9223c0752b8e3b'
};

/* Poster settings, used by core.js. */
const CONFIG = {
  useLocalImages: true,                 // your own files in images/ win
  imageFolder: 'images',
  imageExtensions: ['jpg', 'jpeg', 'png', 'webp'],

  // Fallback lookups for titles that have no TMDB poster stored.
  posterSources: ['tmdb', 'wikipedia'],
  tmdbApiKey: SITE.tmdbApiKey,
  lookupConcurrency: 4
};
