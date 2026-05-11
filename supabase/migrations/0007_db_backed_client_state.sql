-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SkyForce — DB-backed client state                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Removes the remaining dependence on browser storage for active app
-- features. Two categories move into Postgres:
--   1. lightweight user/game-scoped UI preferences
--   2. facilitator game snapshots

create extension if not exists "pgcrypto";

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ user_preferences                                                 │
-- ╰──────────────────────────────────────────────────────────────────╯
create table if not exists public.user_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  pref_key    text not null,
  value_json  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, pref_key)
);

create index if not exists user_preferences_user_idx
  on public.user_preferences (user_id);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ game_preferences                                                 │
-- ╰──────────────────────────────────────────────────────────────────╯
create table if not exists public.game_preferences (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid not null,
  pref_key    text not null,
  value_json  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (game_id, user_id, pref_key)
);

create index if not exists game_preferences_game_user_idx
  on public.game_preferences (game_id, user_id);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ game_snapshots                                                   │
-- ╰──────────────────────────────────────────────────────────────────╯
create table if not exists public.game_snapshots (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references public.games(id) on delete cascade,
  quarter           integer not null,
  saved_by_user_id  uuid not null,
  label             text not null,
  quarter_label     text not null,
  team_count        integer not null,
  state_json        jsonb not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (game_id, quarter)
);

create index if not exists game_snapshots_game_idx
  on public.game_snapshots (game_id, created_at desc);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ updated_at trigger                                               │
-- ╰──────────────────────────────────────────────────────────────────╯
drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

drop trigger if exists game_preferences_set_updated_at on public.game_preferences;
create trigger game_preferences_set_updated_at
  before update on public.game_preferences
  for each row execute function public.set_updated_at();

drop trigger if exists game_snapshots_set_updated_at on public.game_snapshots;
create trigger game_snapshots_set_updated_at
  before update on public.game_snapshots
  for each row execute function public.set_updated_at();

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ Row-Level Security                                               │
-- ╰──────────────────────────────────────────────────────────────────╯
alter table public.user_preferences enable row level security;
alter table public.game_preferences enable row level security;
alter table public.game_snapshots enable row level security;

-- Browser clients do not write these tables directly; server API routes
-- use the service-role client after deriving the caller from auth.
drop policy if exists user_preferences_no_anon_write on public.user_preferences;
create policy user_preferences_no_anon_write on public.user_preferences
  for all using (false) with check (false);

drop policy if exists game_preferences_no_anon_write on public.game_preferences;
create policy game_preferences_no_anon_write on public.game_preferences
  for all using (false) with check (false);

drop policy if exists game_snapshots_no_anon_write on public.game_snapshots;
create policy game_snapshots_no_anon_write on public.game_snapshots
  for all using (false) with check (false);
