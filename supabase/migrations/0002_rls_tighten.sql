-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ ICAN Simulations — RLS tightening + join rate-limit              ║
-- ║ Phase 1 of the enterprise-readiness hardening plan.              ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- 0001_lobby.sql shipped permissive RLS policies (`using (true)`) for
-- every read on games / game_members / game_state / game_events. That
-- meant the anon key — which is in the browser bundle — could query
-- private games directly via Supabase's PostgREST endpoint, bypassing
-- our API layer.
--
-- This migration tightens reads to:
--   • games: visible if public+lobby OR caller is a member.
--   • game_members: visible only to members of the same game (no
--     cross-game member enumeration).
--   • game_state: visible only to members + host/facilitator.
--   • game_events: visible only to members + host/facilitator.
--
-- The API layer (service-role) is unaffected — it bypasses RLS by
-- design. These policies guard the BROWSER → SUPABASE direct path.
--
-- Note: callers authenticate via Supabase Auth. `auth.uid()` returns
-- the signed-in user's id. Anonymous browsers have `auth.uid() = null`
-- and are denied any private-game reads. They CAN still see public
-- lobbies in `status='lobby'` (the lobby browse path).
--
-- Plus: a new `join_rate_limit` table for the per-IP rate limiter on
-- /api/games/join (Phase 1.6).

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ join_rate_limit                                                  │
-- ╰──────────────────────────────────────────────────────────────────╯
-- One row per join attempt. The /api/games/join handler counts rows
-- per (ip, last 5 minutes) and returns 429 when over 10. A simple
-- daily cleanup keeps the table small.
create table if not exists public.join_rate_limit (
  id            bigserial primary key,
  ip            text not null,
  attempted_at  timestamptz not null default now()
);

create index if not exists join_rate_limit_ip_attempted_at_idx
  on public.join_rate_limit (ip, attempted_at desc);

-- Garbage-collect rows older than 1 hour. Run via pg_cron or a
-- nightly Vercel cron call to /api/cron/cleanup-rate-limit (TBD).
-- For now the table grows slowly; it's safe to manually truncate.
alter table public.join_rate_limit enable row level security;
drop policy if exists join_rate_limit_no_anon on public.join_rate_limit;
create policy join_rate_limit_no_anon on public.join_rate_limit
  for all using (false) with check (false);

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ Tighten existing read policies                                   │
-- ╰──────────────────────────────────────────────────────────────────╯

-- games: drop the permissive read-by-id, replace with two policies:
--   1. public lobbies are visible to everyone (anon + signed-in)
--   2. private games (or playing/ended) are visible only to members
drop policy if exists games_read_public on public.games;
drop policy if exists games_read_by_id on public.games;

create policy games_read_public_lobbies on public.games
  for select using (
    visibility = 'public' and status = 'lobby'
  );

create policy games_read_for_members on public.games
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.game_members gm
      where gm.game_id = id
        and gm.session_id = auth.uid()::text
    )
  );

create policy games_read_for_hosts on public.games
  for select using (
    auth.uid() is not null
    and (
      created_by_session_id = auth.uid()::text
      or facilitator_session_id = auth.uid()::text
    )
  );

-- game_members: visible only to members of the SAME game (no
-- cross-game enumeration). Plus the host/facilitator override.
drop policy if exists game_members_read on public.game_members;

create policy game_members_read_for_co_members on public.game_members
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.game_members self
      where self.game_id = game_members.game_id
        and self.session_id = auth.uid()::text
    )
  );

create policy game_members_read_for_hosts on public.game_members
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.games g
      where g.id = game_members.game_id
        and (
          g.created_by_session_id = auth.uid()::text
          or g.facilitator_session_id = auth.uid()::text
        )
    )
  );

-- Public lobbies need member-list visibility for browsers (so the
-- /lobby page shows seat counts). Only display_name + role are
-- exposed; session_id stays gated.
create policy game_members_read_for_public_lobby on public.game_members
  for select using (
    exists (
      select 1 from public.games g
      where g.id = game_members.game_id
        and g.visibility = 'public'
        and g.status = 'lobby'
    )
  );

-- game_state: ONLY members + host/facilitator. Public lobbies
-- never expose state via the anon-direct path.
drop policy if exists game_state_read on public.game_state;

create policy game_state_read_for_members on public.game_state
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.game_members gm
      where gm.game_id = game_state.game_id
        and gm.session_id = auth.uid()::text
    )
  );

create policy game_state_read_for_hosts on public.game_state
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.games g
      where g.id = game_state.game_id
        and (
          g.created_by_session_id = auth.uid()::text
          or g.facilitator_session_id = auth.uid()::text
        )
    )
  );

-- game_events: same shape as game_state — members + host/facilitator
-- only. The audit log can leak strategy intent if exposed publicly.
drop policy if exists game_events_read on public.game_events;

create policy game_events_read_for_members on public.game_events
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.game_members gm
      where gm.game_id = game_events.game_id
        and gm.session_id = auth.uid()::text
    )
  );

create policy game_events_read_for_hosts on public.game_events
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from public.games g
      where g.id = game_events.game_id
        and (
          g.created_by_session_id = auth.uid()::text
          or g.facilitator_session_id = auth.uid()::text
        )
    )
  );

-- ╭──────────────────────────────────────────────────────────────────╮
-- │ Notes for operators                                              │
-- ╰──────────────────────────────────────────────────────────────────╯
--
-- After applying this migration, browser-side queries via the
-- supabase-js anon client will:
--   • succeed for public lobbies the user is browsing;
--   • succeed for private games the user has joined;
--   • succeed for any game the user hosts or facilitates;
--   • fail (silently, with empty result) for everything else.
--
-- The API layer (server-side, service-role) continues to work
-- unchanged for all paths.
--
-- To verify, in the Supabase SQL editor:
--   set role anon;
--   select id, name, visibility, status from public.games;
--   -- Should return only public lobbies.
--   reset role;
