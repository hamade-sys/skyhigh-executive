-- 0006_forfeit_atomic.sql
--
-- Group-D of the audit follow-ups. Wraps the forfeit flow in a single
-- Postgres transaction so concurrent state mutations cannot orphan a
-- player who forfeited halfway through a CAS race.
--
-- Before this migration, the forfeit endpoint did:
--   1. SELECT game_state row (read version + teams)
--   2. UPDATE game_state with new teams + version+1 (CAS)
--   3. DELETE game_members row
--   4. UPDATE games SET status='ended' (when last human gone)
--   5. INSERT audit events
-- If another writer (e.g. /api/games/state-update from a peer)
-- landed between 1 and 2, step 2 returned 0 rows and the route
-- failed with "stale state — refresh and retry". The user retried,
-- but if the FIRST attempt happened to delete the member row before
-- failing (it doesn't today, but the ordering invariant is fragile),
-- the second attempt's assertMembership would fail too. The function
-- below is the structural fix: all mutations succeed or none do.
--
-- Caller responsibilities (NextJS route):
--   - Verify auth (getAuthenticatedUserId).
--   - Verify membership (assertMembership) — same logic re-implemented
--     here using the function arguments, so SECURITY DEFINER works.
--   - Emit Realtime broadcast AFTER the function returns success.
--
-- Returns: jsonb with {replaced_by_bot, remaining_humans, game_ended}
-- so the route can surface accurate copy to the player.

begin;

create or replace function public.forfeit_member_atomic(
  p_game_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game record;
  v_state record;
  v_state_json jsonb;
  v_teams jsonb;
  v_team jsonb;
  v_team_index int := -1;
  v_team_id text;
  v_difficulty text;
  v_current_quarter int;
  v_remaining_humans int := 0;
  v_replaced_by_bot boolean := false;
  v_game_ended boolean := false;
  i int;
begin
  -- Lock the game row to serialize concurrent forfeits / state writes
  -- on the same game. Other transactions wait for ours to commit
  -- before they read game_state.version, eliminating the CAS race.
  select id, status, current_quarter, created_by_session_id,
         facilitator_session_id
  into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  -- Lobby case — just delete the member row and (optionally) tear
  -- down the now-empty lobby. No team flip needed because no team
  -- has been created yet at lobby phase.
  if v_game.status = 'lobby' then
    delete from public.game_members
    where game_id = p_game_id and session_id = p_session_id;

    insert into public.game_events (game_id, actor_session_id, type, payload_json)
    values (
      p_game_id, p_session_id, 'game.forfeited',
      jsonb_build_object('from', 'lobby')
    );

    -- If the lobby is now fully empty (no non-spectator/non-facilitator
    -- members), garbage-collect it so the public lobby browser doesn't
    -- show a ghost row.
    if not exists (
      select 1 from public.game_members
      where game_id = p_game_id
        and role <> 'spectator'
        and role <> 'facilitator'
    ) then
      delete from public.game_events where game_id = p_game_id;
      delete from public.game_state  where game_id = p_game_id;
      delete from public.games        where id      = p_game_id;
    end if;

    return jsonb_build_object(
      'replaced_by_bot', false,
      'remaining_humans', 0,
      'game_ended', false
    );
  end if;

  -- Playing case — load the engine state.
  select state_json, version
  into v_state
  from public.game_state
  where game_id = p_game_id
  for update;

  if not found then
    raise exception 'Game state missing' using errcode = 'P0002';
  end if;

  v_state_json := v_state.state_json;
  v_teams := coalesce(v_state_json -> 'teams', '[]'::jsonb);
  v_current_quarter := coalesce((v_state_json ->> 'currentQuarter')::int, 1);
  v_difficulty := coalesce(
    v_state_json -> 'session' ->> 'botDifficulty',
    'medium'
  );

  -- Find the team owned by the forfeiting session.
  for i in 0 .. (jsonb_array_length(v_teams) - 1) loop
    if (v_teams -> i ->> 'claimedBySessionId') = p_session_id::text then
      v_team_index := i;
      v_team := v_teams -> i;
      v_team_id := v_team ->> 'id';
      exit;
    end if;
  end loop;

  -- No claimed team (joined lobby but didn't onboard before start).
  -- Just delete the member row + audit.
  if v_team_index = -1 then
    delete from public.game_members
    where game_id = p_game_id and session_id = p_session_id;

    insert into public.game_events (game_id, actor_session_id, type, payload_json)
    values (
      p_game_id, p_session_id, 'game.forfeited',
      jsonb_build_object('from', 'playing', 'note', 'no_team_claimed')
    );

    return jsonb_build_object(
      'replaced_by_bot', false,
      'remaining_humans', 0,
      'game_ended', false
    );
  end if;

  -- Flip the team to bot control while preserving its accumulated
  -- state (cash, fleet, routes, brand, milestones).
  v_teams := jsonb_set(
    v_teams,
    array[v_team_index::text],
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                v_team,
                array['claimedBySessionId'], 'null'::jsonb, true
              ),
              array['controlledBy'], '"bot"'::jsonb, true
            ),
            array['playerDisplayName'], 'null'::jsonb, true
          ),
          array['isPlayer'], 'false'::jsonb, true
        ),
        array['botDifficulty'], to_jsonb(v_difficulty), true
      ),
      array['flags'],
      coalesce(v_team -> 'flags', '{}'::jsonb)
        || jsonb_build_object(
          'forfeitedAtQuarter', v_current_quarter,
          'forfeitedBySessionId', p_session_id::text
        ),
      true
    ),
    true
  );

  v_replaced_by_bot := true;
  v_state_json := jsonb_set(v_state_json, array['teams'], v_teams, true);

  -- Count remaining humans for the auto-end check.
  v_remaining_humans := 0;
  for i in 0 .. (jsonb_array_length(v_teams) - 1) loop
    if (v_teams -> i ->> 'controlledBy') = 'human' then
      v_remaining_humans := v_remaining_humans + 1;
    end if;
  end loop;

  if v_remaining_humans = 0 then
    v_state_json := jsonb_set(v_state_json, array['phase'], '"endgame"'::jsonb, true);
    v_game_ended := true;
  end if;

  -- Persist the new state (no CAS needed — we hold a row lock).
  update public.game_state
  set state_json = v_state_json,
      version = version + 1
  where game_id = p_game_id;

  -- Delete the member row.
  delete from public.game_members
  where game_id = p_game_id and session_id = p_session_id;

  -- Flip the games row when fully ended.
  if v_game_ended then
    update public.games
    set status = 'ended', ended_at = now()
    where id = p_game_id;
  end if;

  -- Audit events.
  insert into public.game_events (game_id, actor_session_id, actor_team_id, type, payload_json)
  values (
    p_game_id, p_session_id, v_team_id, 'game.forfeited',
    jsonb_build_object(
      'from', 'playing',
      'teamId', v_team_id,
      'replacedByBotDifficulty', v_difficulty,
      'remainingHumans', v_remaining_humans,
      'gameEnded', v_game_ended
    )
  );
  if v_game_ended then
    insert into public.game_events (game_id, type, payload_json)
    values (
      p_game_id, 'game.autoEnded',
      jsonb_build_object('reason', 'all_human_players_forfeited')
    );
  end if;

  return jsonb_build_object(
    'replaced_by_bot', v_replaced_by_bot,
    'remaining_humans', v_remaining_humans,
    'game_ended', v_game_ended
  );
end;
$$;

-- Lock down the function so only the service-role client can call
-- it. The Next API route uses the service-role client by design;
-- direct browser calls via the anon key are blocked.
revoke all on function public.forfeit_member_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.forfeit_member_atomic(uuid, uuid) to service_role;

commit;
