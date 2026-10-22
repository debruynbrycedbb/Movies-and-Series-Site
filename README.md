# Bryce's CineVault

A private film and series tracker for a few friends and family. Everyone gets their
own list. You rate titles out of 10, log the days you watched them, and can look at
everyone else's lists and compare tastes.

- **No emails and no personal details.** Members join with a username and a PIN.
- **Not open to the public.** Joining needs the family code, and only members can see
  any lists.
- **Your list follows you.** Ratings are saved to your account, so they're the same on
  your phone and your computer.
- **Look, don't touch.** You can view anyone's list, but only you can change yours.

The site is plain files on GitHub Pages (free). The lists live in a free Supabase
database. Search and posters come from TMDB.

---

## One-time setup (about 10 minutes)

### 1. Set up the database

1. Open your project at [supabase.com](https://supabase.com/dashboard).
2. Go to **SQL Editor → New query**.
3. Open `setup.sql` from this folder, copy all of it, paste it in, and press **Run**.
   You should see "Success. No rows returned".

You can run `setup.sql` again at any time, for example after changing the family
code. It never deletes anything.

### 2. Turn on sign-in

Go to **Authentication → Sign In / Providers** and switch on
**Allow anonymous sign-ins**, then save.

This is what makes sign-in work without emails. Every browser that opens the site gets
a silent session. Typing your name and PIN links that session to your profile. The
database decides what each session can see and change.

### 3. Delete the secret key you sent earlier

Go to **Project Settings → API Keys**. Delete the key starting with `sb_secret_` and
create a new secret key if you need one. The site only ever uses the
**publishable** key (`sb_publishable_…`), which is already in `config.js` and is safe
in a public website.

> Never put an `sb_secret_` key in any file on the site. Anyone who has it can bypass
> every rule in the database.

### 4. Upload the files to GitHub

Replace everything in your repository with the files in this zip. Every page now loads
its files with a version tag (`?v=14`), so browsers pick up the new copies straight away
instead of showing an old cached one. The images folder
stays as it is, so keep any posters you've already uploaded.

New files: `config.js`, `db.js`, `boot.js`, `login.html`, `login.js`, `compare.html`,
`compare.js`, `import.html`, `import.js` and `setup.sql`. Every other page has changed
too, so upload all of them.

(`setup.sql` doesn't need to be on GitHub, but it does no harm there because it
contains no keys.)

### 5. Join, then bring in your old ratings

1. Open the site. It sends you to the sign-in page.
2. Choose **Join**, enter the family code, and pick a username and PIN.
3. Open **⚙ → Bring in old ratings** (or go to `import.html`) **in the same browser
   you used to rate films on the old site**. The old ratings are stored in that
   browser.
4. Leave everything ticked and press **Start import**. It copies:
   - all 567 films and 41 series
   - the ratings and watch dates saved in that browser
   - a backup `.json` file, if you have one from the old Export button
5. It also matches each title on TMDB so posters appear and your list lines up with
   everyone else's. That takes a minute or two.

You can run the import again safely. Anything already on your list is left alone.

### 6. Invite people

Send them the site address and the family code. They choose **Join** and pick their
own name and PIN.

---

## Using it

### Your list

- **+ Add** (top left on a computer, the round button on a phone) searches TMDB. Pick
  the right title, then **Add to my list**.
  - For a series, tick the seasons you've watched.
  - You can also enter the day you watched it.
- Click any poster to rate it from 0 to 10 in steps of 0.1, log more watch dates, or
  **Remove from my list**.
- For a series, **How far I've got** sets your season and episode count. The Stats
  page uses that for watch time.

### Other people's lists

Use the **List** dropdown under the menu to switch to someone else's list. Every page
then shows their list: Movies, Series, Top 25, Genres and Stats. The bar turns purple
so you know you're looking at someone else's list, and **Back to mine** returns you to
yours.

On someone else's list:

- Click a poster to see their rating and watch dates.
- **+ Add to my list** copies that title onto yours.
- **Also on** shows what every other member rated the same title.

### Compare

Pick any two members and Movies or Series. The page shows:

- how many titles each of you has, and how many you've both seen
- **Taste match**: how close your scores are on titles you've both rated. 100% means
  identical scores. It needs at least 3 titles you've both rated.
- average ratings per genre, side by side
- where you disagree most, and where you agree
- each person's highly rated titles the other hasn't seen, with a **+ My list**
  button

### Account (⚙)

The ⚙ button on the Movies and Series pages lets you:

- change your PIN
- sign out
- export a copy of a list
- bring in old ratings
- test or refresh posters

---

## Looking after the site

### Forgotten PIN

There's no email, so you reset it yourself in Supabase. In **SQL Editor**, run:

```sql
update app_private.credentials
   set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf'))
 where profile_id = (select id from public.profiles where username = 'theirname');
```

Then tell them their new PIN is 1234 and ask them to change it under ⚙.

The bottom of `setup.sql` has more of these snippets, including how to list members
and how to remove one.

### Changing the family code

Edit the line `values ('family_code', '0011')` near the top of `setup.sql` and run the
whole file again.

A 4-digit code is easy to share but also fairly easy to guess, even though the
database pauses joining for an hour after 20 wrong tries. Six or more characters
(for example `popcorn-42`) is much stronger. Changing the code doesn't affect anyone
who has already joined.

### Lockouts

- **10 wrong PINs** for a username in 15 minutes locks that username for 15 minutes.
- **20 wrong family codes** in an hour, from anyone, pauses joining for an hour.

### The free Supabase plan pauses idle projects

If nobody opens the site for **a week**, Supabase pauses the database and the site
shows "Couldn't open the vault". Open your project at supabase.com and press
**Restore**. Your data is kept. Any regular use stops this from happening.

---

## Posters

The site looks for a poster in this order and uses the first one it finds:

1. A URL typed into a title's **"point at an image on the web"** box. This only
   applies in that browser.
2. **A file in the `images/` folder**. Everyone sees it.
3. The TMDB poster saved with the title. Anything added with **+ Add** or matched
   during the import has one.
4. A search on TMDB, then Wikipedia.
5. A plain tile with the title on it.

### Your own images

Name each file after the title's id. `POSTER-FILENAMES.txt` lists them all, for
example:

```
images/inception.jpg
images/tv--breaking-bad.jpg
```

`.jpg`, `.jpeg`, `.png` and `.webp` all work. Portrait images in a 2:3 shape (about
400×600) are best.

To find the exact filename for any title, open it and expand **Poster wrong or
missing? Fix it**. It shows the filename with a Copy button.

**Creating the images folder on GitHub:**

1. Choose **Add file → Create new file**.
2. Type `images/README.md` as the name. The slash creates the folder.
3. Commit the file.
4. Upload images into that folder.

If a new image doesn't appear, hard-refresh with Ctrl+Shift+R (Cmd+Shift+R on a Mac),
or use **⚙ → Refresh posters**.

---

## What each file does

| File | Purpose |
|---|---|
| `config.js` | Supabase address, publishable key and TMDB key. Safe to publish. |
| `db.js` | Everything that reads or writes the database, plus TMDB search. |
| `boot.js` | Runs first on every page. Checks you're signed in, loads the list being viewed, adds the member bar. |
| `login.html`, `login.css`, `login.js` | Sign in and Join. The page has its own stylesheet. |
| `index.html`, `series.html`, `library.js` | The Movies and Series pages. |
| `top25.*`, `genres.*`, `stats.*` | Top 25, best per genre, statistics. |
| `compare.html`, `compare.js` | Side-by-side comparison of two members. |
| `import.html`, `import.js` | One-off copy of the old site's data into an account. |
| `movies.js`, `series.js`, `cast.js` | The original hand-typed list. Only the import page uses these now; new titles come from **+ Add**. |
| `core.js`, `styles.css`, `top25.css` | Shared code and styling. |
| `setup.sql` | The database tables and the rules for who can see and change what. |

This product uses the TMDB API but is not endorsed or certified by TMDB. TMDB's API is
free for non-commercial use like this.
