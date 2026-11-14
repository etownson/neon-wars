# Supabase Leaderboard Setup

Neon Wars ships with an optional **online leaderboard** backed by
[Supabase](https://supabase.com). It is free for a low-traffic game and needs no
server or extra npm dependency — the game talks to Supabase's PostgREST API with
plain `fetch()` calls.

The feature is **self-disabling**: until you fill in the config, the game runs
normally and just hides the leaderboard.

## To enable the leaderboard

### 1. Create the project

1. Go to <https://supabase.com> and create a free account (no billing card).
2. Create a new project. Pick any region; the free tier is fine.
3. Once the project is ready, go to **Project Settings → API**, and copy two values:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **`anon` public key**

### 2. Fill in the config

Open `src/supabaseConfig.ts` and paste them in:

```ts
export const supabaseUrl = "https://xxxx.supabase.co";
export const supabaseAnonKey = "<your anon public key>";
```

> The `anon` key is designed to be public in browsers. Security comes from the
> row-level-security policy below, **not** from hiding the key.

### 3. Create the table

In the Supabase dashboard, open **SQL Editor → New query** and run:

```sql
-- Scores table for the Neon Wars leaderboard
create table if not exists public.scores (
  id         uuid primary key default gen_random_uuid(),
  initials   text not null check (char_length(initials) between 1 and 3),
  score      integer not null,
  wave       integer not null default 1,
  created_at timestamptz not null default now()
);

-- Anyone may read scores…
alter table public.scores enable row level security;
drop policy if exists "reads" on public.scores;
create policy "reads"
  on public.scores for select
  to anon
  using (true);

-- …and anyone may submit a score.
drop policy if exists "inserts" on public.scores;
create policy "inserts"
  on public.scores for insert
  to anon
  with check (true);

-- Nobody (not even anon) may edit or delete scores, so one player's initials
-- can't be overwritten by another.

-- Grant the anon role base access to the table and schema. This is required
-- when you leave the table "auto-expose" setting off: RLS policies only filter
-- rows for roles that already have table privileges.
grant usage on schema public to anon;
grant select, insert on public.scores to anon;
```

### 4. Build & deploy

```bash
npm run build
```

Commit and push to `main` — the existing `.github/workflows/deploy.yml`
automatically rebuilds and publishes to GitHub Pages.

## How it works

- **Submit:** on game over, the player types 1–3 initials and hits SUBMIT. The
  game `POST`s `{ initials, score, wave }` to `/rest/v1/scores`.
- **View:** the top 10 scores are shown on the game-over screen, fetched with
  `order=score.desc` via `/rest/v1/scores`.
- All leaderboard code lives in `src/leaderboard.ts`.

## Notes / caveats

- **Anti-cheat:** the score is sent straight from the browser, so someone with
  DevTools can post any score. For a casual leaderboard that's fine. If you ever
  want it locked down, add a [Supabase Edge
  Function](https://supabase.com/docs/guides/functions) that re-validates the
  score before inserting — but that's beyond this scaffold.
- **Rate limits:** free-tier Supabase has request limits; a hobby game won't hit
  them.
- **Duplicates:** every submission inserts a new row (no dedup). A player can
  submit many times.
