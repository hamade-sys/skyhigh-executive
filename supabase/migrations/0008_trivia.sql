-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ ICAN Trivia — boards, templates, column bank, live rooms         ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- A Jeopardy-style quiz game that sits beside the simulations.
--
--   trivia_sets          boards (working games) and templates (the
--                        templates bank). Content is one JSON document
--                        per set, validated by src/lib/trivia/content.ts.
--   trivia_bank_columns  the column bank: every titled column saved on
--                        any board or template lands here, so a host
--                        can pull a whole column into another game.
--                        Rows outlive the board they came from.
--   trivia_rooms         a live game: 4-letter join code, a snapshot of
--                        the board (answers included) and the game
--                        state, written with a version compare-and-swap.
--   trivia_players       who joined a room. No account: each player
--                        holds a random token; only its hash is stored.
--   trivia_ai_log        one row per AI-assist call, for the per-user
--                        hourly cap.
--
-- Access: RLS on, no policies, privileges revoked from anon and
-- authenticated. Every read and write goes through /api/trivia/*
-- with the service-role key, after the route has checked the caller
-- (host = signed-in owner, player = token). Room content holds the
-- answers, so it must never be readable with the anon key.
--
-- Idempotent (if not exists / drop … if exists) because
-- runtime-migrations.ts may meet a partially-applied database.

create extension if not exists "pgcrypto";

-- ── trivia_sets ────────────────────────────────────────────────────
create table if not exists public.trivia_sets (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  owner_label     text,
  kind            text not null check (kind in ('board', 'template')),
  visibility      text not null default 'private'
                  check (visibility in ('private', 'shared')),
  title           text not null check (char_length(title) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 280),
  content         jsonb not null,
  -- Denormalised for list views, kept in step by the API on save.
  column_titles   text[] not null default '{}',
  question_count  integer not null default 0,
  -- The template (or library template id) a board was started from.
  source_id       text,
  plays           integer not null default 0,
  last_played_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists trivia_sets_owner_idx
  on public.trivia_sets (owner_id, kind, updated_at desc);
create index if not exists trivia_sets_shared_idx
  on public.trivia_sets (kind, updated_at desc)
  where visibility = 'shared';

-- ── trivia_bank_columns ────────────────────────────────────────────
create table if not exists public.trivia_bank_columns (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,
  owner_label     text,
  visibility      text not null default 'private'
                  check (visibility in ('private', 'shared')),
  title           text not null check (char_length(title) between 1 and 60),
  questions       jsonb not null,
  question_count  integer not null default 0,
  -- Where it was last saved from. Nulled (not deleted) when that
  -- board goes, so the bank keeps the column.
  source_set_id   uuid references public.trivia_sets(id) on delete set null,
  source_title    text,
  -- The editor's column id. With source_set_id it identifies "this
  -- column on that board", so re-saving a board updates its bank rows
  -- instead of piling up copies.
  column_key      text not null,
  starred         boolean not null default false,
  times_used      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists trivia_bank_columns_source_uidx
  on public.trivia_bank_columns (owner_id, source_set_id, column_key);
create index if not exists trivia_bank_columns_owner_idx
  on public.trivia_bank_columns (owner_id, updated_at desc);
create index if not exists trivia_bank_columns_shared_idx
  on public.trivia_bank_columns (updated_at desc)
  where visibility = 'shared';

-- ── trivia_rooms ───────────────────────────────────────────────────
create table if not exists public.trivia_rooms (
  id                uuid primary key default gen_random_uuid(),
  code              text not null check (code ~ '^[A-Z]{4}$'),
  host_id           uuid not null,
  -- sha256 of the room's host token (lets a second device co-host).
  host_token_hash   text not null,
  set_id            uuid references public.trivia_sets(id) on delete set null,
  title             text not null,
  content           jsonb not null,
  state             jsonb not null,
  status            text not null default 'lobby'
                    check (status in ('lobby', 'playing', 'ended')),
  version           integer not null default 1,
  last_activity_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  ended_at          timestamptz
);

-- One live room per code. Ended rooms release their code.
create unique index if not exists trivia_rooms_code_live_uidx
  on public.trivia_rooms (code)
  where status <> 'ended';
create index if not exists trivia_rooms_host_idx
  on public.trivia_rooms (host_id, created_at desc);
create index if not exists trivia_rooms_activity_idx
  on public.trivia_rooms (last_activity_at)
  where status <> 'ended';

-- ── trivia_players ─────────────────────────────────────────────────
create table if not exists public.trivia_players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.trivia_rooms(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 20),
  color         text not null,
  token_hash    text not null,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create unique index if not exists trivia_players_room_name_uidx
  on public.trivia_players (room_id, lower(name));
create index if not exists trivia_players_room_idx
  on public.trivia_players (room_id, joined_at);

-- ── trivia_ai_log ──────────────────────────────────────────────────
create table if not exists public.trivia_ai_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  mode        text not null,
  ok          boolean not null default true,
  input_tokens  integer,
  output_tokens integer,
  created_at  timestamptz not null default now()
);

create index if not exists trivia_ai_log_user_idx
  on public.trivia_ai_log (user_id, created_at desc);

-- ── updated_at triggers (set_updated_at() comes from 0001) ─────────
drop trigger if exists trivia_sets_set_updated_at on public.trivia_sets;
create trigger trivia_sets_set_updated_at
  before update on public.trivia_sets
  for each row execute function public.set_updated_at();

drop trigger if exists trivia_bank_columns_set_updated_at on public.trivia_bank_columns;
create trigger trivia_bank_columns_set_updated_at
  before update on public.trivia_bank_columns
  for each row execute function public.set_updated_at();

drop trigger if exists trivia_rooms_set_updated_at on public.trivia_rooms;
create trigger trivia_rooms_set_updated_at
  before update on public.trivia_rooms
  for each row execute function public.set_updated_at();

-- ── Lock it down: server only ──────────────────────────────────────
alter table public.trivia_sets          enable row level security;
alter table public.trivia_bank_columns  enable row level security;
alter table public.trivia_rooms         enable row level security;
alter table public.trivia_players       enable row level security;
alter table public.trivia_ai_log        enable row level security;

revoke all on table public.trivia_sets          from anon, authenticated;
revoke all on table public.trivia_bank_columns  from anon, authenticated;
revoke all on table public.trivia_rooms         from anon, authenticated;
revoke all on table public.trivia_players       from anon, authenticated;
revoke all on table public.trivia_ai_log        from anon, authenticated;

grant all on table public.trivia_sets          to service_role;
grant all on table public.trivia_bank_columns  to service_role;
grant all on table public.trivia_rooms         to service_role;
grant all on table public.trivia_players       to service_role;
grant all on table public.trivia_ai_log        to service_role;
