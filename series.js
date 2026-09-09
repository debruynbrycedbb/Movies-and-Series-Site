/* ============================================================
   SERIES DATA  -  the TV list, same idea as movies.js
   ------------------------------------------------------------
   One series per line, fields separated by the | character:

     Title | Year | Seasons | Episodes | EpisodeMins | Genres | Creator | WikipediaTitle

   ONLY THE TITLE IS REQUIRED. Everything after it can be left
   out, and you can stop at any point:

     Breaking Bad|2008|5|62|47|Crime,Drama|Vince Gilligan|
     Breaking Bad|2008|5|62|47|Crime,Drama|      <- no creator
     Breaking Bad|2008|5|62                      <- no episode length
     Breaking Bad|2008                           <- just a year
     Breaking Bad                                <- bare minimum

   Notes on each field:
     Year         First aired. Used for sorting and the decade filter.
     Seasons      How many seasons you've watched.
     Episodes     Total episodes across those seasons.
     EpisodeMins  Average episode length in minutes. Episodes x this
                  is what the Statistics page counts as watch time,
                  so a rough average is fine - 22 for a sitcom, 45
                  for an hour drama, 55 for a prestige one.
     Genres       Comma separated, e.g. Crime,Drama.
     Creator      Shown on the series panel; also searchable.
     Wikipedia    Only when the article name differs from the title,
                  e.g. The Office (American TV series).

   Add a series by adding a line. Remove one by deleting its line.

   CAREFUL: a series' rating and its poster filename are both keyed
   to its title. Renaming a title orphans its rating and its image.
   ============================================================ */

const SERIES_SOURCE = `
Silo|2023|3|30|55|Sci-Fi,Drama,Mystery|Graham Yost|Silo (TV series)
Andor|2022|2|24|45|Sci-Fi,Drama,Action|Tony Gilroy|Andor (TV series)
The Office|2005|9|188|22|Comedy|Greg Daniels|The Office (American TV series)
Modern Family|2009|11|250|22|Comedy|Lloyd & Levitan|
It's Always Sunny in Philadelphia|2005|18|185|22|Comedy|Rob McElhenney|
True Detective|2014|1|8|55|Crime,Drama,Mystery|Nic Pizzolatto|
Big Mouth|2017|4|40|26|Animation,Comedy|Nick Kroll|Big Mouth (TV series)
Rick and Morty|2013|9|91|23|Animation,Sci-Fi,Comedy|Roiland & Harmon|
Futurama|1999|14|180|22|Animation,Sci-Fi,Comedy|Matt Groening|
Ahsoka|2023|2|16|45|Sci-Fi,Action,Adventure|Dave Filoni|Ahsoka (TV series)
Obi-Wan Kenobi|2022|1|6|48|Sci-Fi,Action,Adventure|Joby Harold|Obi-Wan Kenobi (TV series)
The Mandalorian|2019|3|24|40|Sci-Fi,Action,Adventure|Jon Favreau|
Family Guy|1999|24|440|22|Animation,Comedy|Seth MacFarlane|
Band of Brothers|2001|1|10|60|War,Drama,History|Hanks & Spielberg|Band of Brothers (miniseries)
The Pacific|2010|1|10|55|War,Drama,History|Hanks & Spielberg|The Pacific (miniseries)
Chernobyl|2019|1|5|66|Drama,History|Craig Mazin|Chernobyl (miniseries)
Game of Thrones|2011|8|73|57|Fantasy,Drama,Adventure|Benioff & Weiss|
The Last Dance|2020|1|10|50|Documentary,Sport|Jason Hehir|The Last Dance (miniseries)
Formula 1: Drive to Survive|2019|3|30|40|Documentary,Sport|James Gay-Rees|Formula 1: Drive to Survive
Curb Your Enthusiasm|2000|3|30|28|Comedy|Larry David|
Narcos|2015|3|30|50|Crime,Drama,Biography|Chris Brancato|
Black Mirror|2011|6|26|60|Sci-Fi,Drama,Thriller|Charlie Brooker|
Peaky Blinders|2013|6|36|58|Crime,Drama|Steven Knight|Peaky Blinders (TV series)
Arrested Development|2003|5|90|22|Comedy|Mitchell Hurwitz|
Daredevil|2015|1|13|54|Action,Crime,Drama|Drew Goddard|Daredevil (TV series)
WandaVision|2021|1|9|36|Sci-Fi,Drama,Comedy|Jac Schaeffer|
Moon Knight|2022|1|6|47|Action,Fantasy,Adventure|Jeremy Slater|Moon Knight (TV series)
The Falcon and the Winter Soldier|2021|1|6|50|Action,Adventure,Drama|Malcolm Spellman|
Loki|2021|2|12|48|Sci-Fi,Action,Fantasy|Michael Waldron|Loki (TV series)
Spider-Noir|2026|1|8|45|Action,Crime,Sci-Fi|Oram & Fisher|
Stranger Things|2016|5|42|51|Sci-Fi,Horror,Drama|The Duffer Brothers|
The Boys|2019|5|40|60|Action,Sci-Fi,Comedy|Eric Kripke|The Boys (TV series)
Gen V|2023|1|8|50|Action,Sci-Fi,Drama|Craig Rosenberg|
Fallout|2024|2|16|60|Sci-Fi,Action,Adventure|Wagner & Robertson-Dworet|Fallout (American TV series)
Money Heist|2017|2|22|50|Crime,Drama,Thriller|Alex Pina|
Love, Death & Robots|2019|4|45|15|Animation,Sci-Fi,Horror|Tim Miller|
The Witcher|2019|2|16|60|Fantasy,Action,Adventure|Lauren Schmidt Hissrich|The Witcher (TV series)
Mindhunter|2017|2|19|55|Crime,Drama,Thriller|Joe Penhall|
Sex Education|2019|4|32|50|Comedy,Drama|Laurie Nunn|Sex Education (TV series)
Squid Game|2021|1|9|55|Thriller,Drama,Action|Hwang Dong-hyuk|
Silicon Valley|2014|6|53|28|Comedy|Mike Judge|Silicon Valley (TV series)
`;


/* Parsed the same forgiving way as movies.js. Ids get a "tv--" prefix
   so a series can never collide with a film of the same name - the
   slug rule collapses runs of punctuation to a single dash, so no
   film title can ever produce a double dash. */

const SERIES = (() => {
  const seen = new Set();

  return SERIES_SOURCE
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line[0] !== '#')
    .map((line, index) => {
      const p = line.split('|').map(s => s.trim());
      const title = p[0];

      if (!title) {
        console.warn('[cinevault] series line ' + (index + 1) + ' has no title, skipped:', line);
        return null;
      }

      let id = 'tv--' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (seen.has(id)) {
        console.warn('[cinevault] duplicate series title "' + title + '" - rename one of them.');
        let n = 2;
        while (seen.has(id + '-' + n)) n++;
        id = id + '-' + n;
      }
      seen.add(id);

      const year     = parseInt(p[1], 10);
      const seasons  = parseInt(p[2], 10) || 0;
      const episodes = parseInt(p[3], 10) || 0;
      const epMins   = parseInt(p[4], 10) || 0;

      return {
        kind: 'series',
        id,
        title,
        year: isNaN(year) ? 0 : year,
        seasons,
        episodes,
        epMins,
        // total sitting-down time, so the shared code can treat this
        // exactly like a film's runtime
        runtime: episodes * epMins,
        genres: (p[5] || '').split(',').map(g => g.trim()).filter(Boolean),
        director: p[6] || '',        // the creator, named to match movies.js
        wiki: p[7] || title,
        order: index
      };
    })
    .filter(Boolean);
})();

window.SERIES = SERIES;
