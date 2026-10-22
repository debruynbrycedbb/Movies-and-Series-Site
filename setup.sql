-- =====================================================================
--  BRYCE'S CINEVAULT  -  database setup
--
--  Paste this whole file into Supabase:
--    SQL Editor  ->  New query  ->  paste  ->  Run
--
--  It is safe to run again later (for example after changing the family
--  code below) - nothing that already exists gets wiped.
--
--  How sign-in works, since there are no emails:
--    Every browser that opens the site gets a silent Supabase "anonymous"
--    session. Signing in with a username + PIN links that browser's
--    session to a member profile. Everything a member can see or change
--    is decided by that link, checked inside the database.
-- =====================================================================


-- ---------------------------------------------------------------------
--  THE FAMILY CODE  -  change it here and run the file again.
--  A longer code is harder to guess; 6+ characters is a good idea.
-- ---------------------------------------------------------------------
create schema if not exists app_private;

create table if not exists app_private.settings (
  key   text primary key,
  value text not null
);

insert into app_private.settings (key, value)
values ('family_code', '0011')
on conflict (key) do update set value = excluded.value;


-- ---------------------------------------------------------------------
--  Private bits: never reachable from the website directly.
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

revoke all on schema app_private from public;
revoke all on all tables in schema app_private from public;


-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------

-- One row per member. Usernames are lower-case letters, numbers, - and _.
create table if not exists public.profiles (
  id         uuid primary key default gen_random_uuid(),
  username   text not null unique check (username ~ '^[a-z0-9_-]{2,20}$'),
  created_at timestamptz not null default now()
);

-- PINs, stored as one-way hashes. Private.
create table if not exists app_private.credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash   text not null
);

-- Which browser session belongs to which member. Private.
create table if not exists app_private.sessions (
  auth_uid   uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Failed family-code and sign-in attempts, for lockouts. Private.
create table if not exists app_private.attempts (
  kind    text not null,             -- 'code' or 'login'
  subject text not null,             -- '' for the code, the username for logins
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index if not exists attempts_lookup on app_private.attempts (kind, subject, at);

-- The shared catalogue. Every member's lists point at these rows, so a
-- film only exists once no matter how many people have seen it.
create table if not exists public.titles (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('movie', 'series')),
  tmdb_id     integer,
  title       text not null,
  year        integer,
  runtime     integer,               -- films: minutes
  seasons     integer,               -- series: seasons that exist
  episodes    integer,               -- series: episodes that exist
  ep_mins     integer,               -- series: typical episode length
  genres      text[] not null default '{}',
  director    text,                  -- director, or creator for a series
  cast_names  text[] not null default '{}',
  poster_path text,                  -- TMDB poster, e.g. /abc123.jpg
  wiki        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (kind, tmdb_id)
);

-- A member's list: what they've seen, and their rating if they gave one.
create table if not exists public.user_titles (
  user_id          uuid not null references public.profiles(id) on delete cascade,
  title_id         uuid not null references public.titles(id) on delete cascade,
  rating           numeric(3,1) check (rating between 0 and 10),
  rated_at         timestamptz,
  seasons_watched  integer,          -- series only: how far this member got
  episodes_watched integer,
  added_at         timestamptz not null default now(),
  primary key (user_id, title_id)
);

-- Watch dates. Removing a title from your list removes its dates too.
create table if not exists public.watches (
  user_id    uuid not null,
  title_id   uuid not null,
  watched_on date not null,
  primary key (user_id, title_id, watched_on),
  foreign key (user_id, title_id)
    references public.user_titles(user_id, title_id) on delete cascade
);


-- ---------------------------------------------------------------------
--  Who is signed in
-- ---------------------------------------------------------------------

create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.profile_id from app_private.sessions s where s.auth_uid = auth.uid()
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_profile_id() is not null
$$;

create or replace function public.me()
returns table (id uuid, username text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username from public.profiles p
  where p.id = public.current_profile_id()
$$;


-- ---------------------------------------------------------------------
--  Lockouts
-- ---------------------------------------------------------------------

create or replace function app_private.too_many(
  p_kind text, p_subject text, p_max int, p_window interval
) returns boolean
language sql stable set search_path = '' as $$
  select count(*) >= p_max from app_private.attempts a
  where a.kind = p_kind and a.subject = p_subject
    and not a.ok and a.at > now() - p_window
$$;


-- ---------------------------------------------------------------------
--  Family code, join, sign in, sign out, change PIN
--  Each returns a short status word the website turns into a message.
-- ---------------------------------------------------------------------

-- 20 wrong codes in an hour (from anyone) pauses joining for an hour.
create or replace function public.check_family_code(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  if app_private.too_many('code', '', 20, interval '1 hour') then
    raise exception 'Too many wrong family codes. Joining is paused for an hour.';
  end if;
  v_ok := coalesce(p_code, '') =
          (select s.value from app_private.settings s where s.key = 'family_code');
  insert into app_private.attempts (kind, subject, ok) values ('code', '', v_ok);
  return v_ok;
end $$;

create or replace function public.register(p_username text, p_pin text, p_code text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  u   text := lower(trim(coalesce(p_username, '')));
  pid uuid;
begin
  if auth.uid() is null then return 'no_session'; end if;
  if u !~ '^[a-z0-9_-]{2,20}$' then return 'bad_username'; end if;
  if length(coalesce(p_pin, '')) < 4 then return 'short_pin'; end if;
  if not public.check_family_code(p_code) then return 'bad_code'; end if;

  begin
    insert into public.profiles (username) values (u) returning id into pid;
  exception when unique_violation then
    return 'taken';
  end;

  insert into app_private.credentials (profile_id, pin_hash)
  values (pid, extensions.crypt(p_pin, extensions.gen_salt('bf')));

  insert into app_private.sessions (auth_uid, profile_id) values (auth.uid(), pid)
  on conflict (auth_uid) do update set profile_id = excluded.profile_id, created_at = now();

  return 'ok';
end $$;

-- 10 wrong PINs for one username in 15 minutes locks that username for 15.
create or replace function public.login(p_username text, p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u   text := lower(trim(coalesce(p_username, '')));
  pid uuid;
  h   text;
begin
  if auth.uid() is null then return 'no_session'; end if;
  if app_private.too_many('login', u, 10, interval '15 minutes') then return 'locked'; end if;

  select p.id, c.pin_hash into pid, h
  from public.profiles p join app_private.credentials c on c.profile_id = p.id
  where p.username = u;

  if pid is null or h <> extensions.crypt(coalesce(p_pin, ''), h) then
    insert into app_private.attempts (kind, subject, ok) values ('login', u, false);
    return 'wrong';
  end if;

  insert into app_private.attempts (kind, subject, ok) values ('login', u, true);
  insert into app_private.sessions (auth_uid, profile_id) values (auth.uid(), pid)
  on conflict (auth_uid) do update set profile_id = excluded.profile_id, created_at = now();
  return 'ok';
end $$;

create or replace function public.logout() returns void
language sql security definer set search_path = '' as $$
  delete from app_private.sessions s where s.auth_uid = auth.uid()
$$;

create or replace function public.change_pin(p_old text, p_new text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.current_profile_id();
  h   text;
begin
  if pid is null then return 'not_member'; end if;
  if length(coalesce(p_new, '')) < 4 then return 'short_pin'; end if;
  select c.pin_hash into h from app_private.credentials c where c.profile_id = pid;
  if h <> extensions.crypt(coalesce(p_old, ''), h) then return 'wrong'; end if;
  update app_private.credentials
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf'))
   where profile_id = pid;
  return 'ok';
end $$;


-- Delete your own account. Needs your PIN (wrong PINs count towards the
-- same lockout as signing in). Removes your profile, PIN, list, ratings
-- and watch dates, plus any catalogue titles that were only ever on your
-- list. Titles other members also have stay on THEIR lists.
create or replace function public.delete_account(p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.current_profile_id();
  u   text;
  h   text;
begin
  if pid is null then return 'not_member'; end if;

  select p.username, c.pin_hash into u, h
  from public.profiles p join app_private.credentials c on c.profile_id = p.id
  where p.id = pid;

  if app_private.too_many('login', u, 10, interval '15 minutes') then return 'locked'; end if;
  if h is null or h <> extensions.crypt(coalesce(p_pin, ''), h) then
    insert into app_private.attempts (kind, subject, ok) values ('login', u, false);
    return 'wrong';
  end if;

  -- titles nobody else has on their list
  delete from public.titles t
   where t.id in (select ut.title_id from public.user_titles ut where ut.user_id = pid)
     and not exists (select 1 from public.user_titles o
                     where o.title_id = t.id and o.user_id <> pid);

  -- everything else hangs off the profile and goes with it:
  -- list, ratings, watch dates, PIN and signed-in browsers
  delete from public.profiles where id = pid;
  delete from app_private.attempts a where a.kind = 'login' and a.subject = u;
  return 'ok';
end $$;


-- ---------------------------------------------------------------------
--  Adding titles to the shared catalogue
--  Takes a list, returns the catalogue id for each one in order. A title
--  that already exists (same TMDB id, or same name + year when there's
--  no TMDB id) is reused rather than duplicated.
-- ---------------------------------------------------------------------

create or replace function public.upsert_titles(p_items jsonb)
returns table (out_idx int, out_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  it  jsonb;
  i   int := 0;
  tid uuid;
  me  uuid := public.current_profile_id();
begin
  if me is null then raise exception 'Members only.'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    tid := null;

    if nullif(it->>'tmdb_id', '') is not null then
      select t.id into tid from public.titles t
      where t.kind = it->>'kind' and t.tmdb_id = (it->>'tmdb_id')::int;
    else
      select t.id into tid from public.titles t
      where t.kind = it->>'kind' and t.tmdb_id is null
        and lower(t.title) = lower(it->>'title')
        and coalesce(t.year, 0) = coalesce(nullif(it->>'year', '')::int, 0)
      limit 1;
    end if;

    if tid is null then
      insert into public.titles (
        kind, tmdb_id, title, year, runtime, seasons, episodes, ep_mins,
        genres, director, cast_names, poster_path, wiki, created_by)
      values (
        it->>'kind',
        nullif(it->>'tmdb_id', '')::int,
        it->>'title',
        nullif(it->>'year', '')::int,
        nullif(it->>'runtime', '')::int,
        nullif(it->>'seasons', '')::int,
        nullif(it->>'episodes', '')::int,
        nullif(it->>'ep_mins', '')::int,
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'genres', '[]'::jsonb))), '{}'),
        nullif(it->>'director', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'cast', '[]'::jsonb))), '{}'),
        nullif(it->>'poster_path', ''),
        nullif(it->>'wiki', ''),
        me)
      on conflict (kind, tmdb_id) do update set kind = excluded.kind
      returning id into tid;
    end if;

    out_idx := i;
    out_id  := tid;
    return next;
    i := i + 1;
  end loop;
end $$;


-- ---------------------------------------------------------------------
--  Row level security: members can read everyone's lists; you can only
--  change your own. Visitors who aren't signed in can read nothing.
-- ---------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.titles      enable row level security;
alter table public.user_titles enable row level security;
alter table public.watches     enable row level security;

revoke all on public.profiles, public.titles, public.user_titles, public.watches from anon;
grant select on public.profiles, public.titles to authenticated;
grant select, insert, update, delete on public.user_titles, public.watches to authenticated;

-- The site's functions: only for browsers with a session. (Visitors with
-- no session couldn't do anything with them anyway; this just shuts the door.)
revoke execute on function
  public.current_profile_id(), public.is_member(), public.me(),
  public.check_family_code(text), public.register(text, text, text),
  public.login(text, text), public.logout(), public.change_pin(text, text),
  public.delete_account(text), public.upsert_titles(jsonb)
from public, anon;
grant execute on function
  public.current_profile_id(), public.is_member(), public.me(),
  public.register(text, text, text), public.login(text, text), public.logout(),
  public.change_pin(text, text), public.delete_account(text), public.upsert_titles(jsonb)
to authenticated;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using (public.is_member());

drop policy if exists "members read titles" on public.titles;
create policy "members read titles" on public.titles
  for select to authenticated using (public.is_member());

drop policy if exists "members read lists" on public.user_titles;
create policy "members read lists" on public.user_titles
  for select to authenticated using (public.is_member());

drop policy if exists "own list insert" on public.user_titles;
create policy "own list insert" on public.user_titles
  for insert to authenticated with check (user_id = public.current_profile_id());

drop policy if exists "own list update" on public.user_titles;
create policy "own list update" on public.user_titles
  for update to authenticated
  using (user_id = public.current_profile_id())
  with check (user_id = public.current_profile_id());

drop policy if exists "own list delete" on public.user_titles;
create policy "own list delete" on public.user_titles
  for delete to authenticated using (user_id = public.current_profile_id());

drop policy if exists "members read watches" on public.watches;
create policy "members read watches" on public.watches
  for select to authenticated using (public.is_member());

drop policy if exists "own watches insert" on public.watches;
create policy "own watches insert" on public.watches
  for insert to authenticated with check (user_id = public.current_profile_id());

drop policy if exists "own watches delete" on public.watches;
create policy "own watches delete" on public.watches
  for delete to authenticated using (user_id = public.current_profile_id());


-- =====================================================================
--  HANDY ADMIN SNIPPETS  -  run these one at a time when you need them.
--  (They're commented out; remove the -- in front of the line to use.)
-- =====================================================================

-- Someone forgot their PIN. Set a new one for them:
-- update app_private.credentials
--    set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf'))
--  where profile_id = (select id from public.profiles where username = 'alex');

-- Remove a member and everything on their list:
-- delete from public.profiles where username = 'alex';

-- See who has joined:
-- select username, created_at from public.profiles order by created_at;
