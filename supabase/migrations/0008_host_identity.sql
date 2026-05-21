-- Host identity alignment: created_by_session_id must match the host member row.
-- New games set this from server auth in POST /api/games/create (see route.ts).
-- Legacy rows: run once in SQL editor if snapshots return 403 for the creator.

UPDATE games g
SET created_by_session_id = gm.session_id
FROM game_members gm
WHERE gm.game_id = g.id
  AND gm.role IN ('host', 'facilitator')
  AND g.created_by_session_id IS DISTINCT FROM gm.session_id
  AND gm.session_id IS NOT NULL;

COMMENT ON COLUMN games.created_by_session_id IS
  'Auth user id (Supabase user.id) of the game creator; must match host game_members.session_id.';
