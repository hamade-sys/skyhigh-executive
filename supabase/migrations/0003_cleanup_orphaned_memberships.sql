-- 0003_cleanup_orphaned_memberships.sql
--
-- Phase 8.5 of the enterprise-readiness plan.
--
-- Before Phase 8 shipped, the in-game "End game" button only cleared
-- the player's local Zustand store and did NOT delete their
-- `game_members` row in Supabase. The home page then re-detected the
-- orphaned row via /api/games/active-membership and bounced the user
-- right back into the abandoned game — making the End-game CTA look
-- broken.
--
-- This one-time cleanup deletes any membership rows that point at
-- ended games (history at that point — there's no game to return to).
-- After this runs, the home page's active-game lookup is correct
-- again. Going forward, /api/games/forfeit removes the row at the
-- moment of forfeit, so this migration shouldn't accumulate work
-- after the first apply.
--
-- Idempotent — running this twice is a no-op (no rows match).

begin;

-- Defensive: only games marked 'ended' are eligible for cleanup.
-- We never delete from a 'lobby' or 'playing' game's membership
-- list here — that would silently kick active players.
delete from public.game_members
where game_id in (
  select id from public.games where status = 'ended'
);

-- Surface the count to the migration log so operators can confirm
-- the cleanup landed. Postgres' RAISE NOTICE writes to the migration
-- output without affecting the transaction.
do $$
declare
  ended_count int;
begin
  select count(*) into ended_count from public.games where status = 'ended';
  raise notice '0003_cleanup_orphaned_memberships: scanned % ended game(s)', ended_count;
end $$;

commit;
