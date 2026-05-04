-- 0004_airline_colors.sql
--
-- Phase 9 of the enterprise-readiness plan — airline color identity.
--
-- Adds `airline_color_id` to `game_members` so each player's chosen
-- color persists across reconnects and survives browser-cache clears.
-- The column is nullable so legacy rows from before Phase 9 don't
-- break, and the back-fill below assigns deterministic colors to
-- existing memberships by join order so the leaderboard / route map
-- never look unstyled after deploy.
--
-- Uniqueness within a game is enforced via a partial unique index
-- (skipping null rows). Future races on /api/games/claim-color land
-- as a 23505 conflict, which the route handler converts to a clean
-- 409 "color already taken" response.

begin;

alter table public.game_members
  add column if not exists airline_color_id text;

-- Partial unique index — null values are allowed multiple times per
-- game (legacy / pre-pick rows), but two non-null claims of the same
-- color in the same game are rejected.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname  = 'game_members_airline_color_per_game_key'
  ) then
    create unique index game_members_airline_color_per_game_key
      on public.game_members (game_id, airline_color_id)
      where airline_color_id is not null;
  end if;
end $$;

-- Back-fill — for each existing game, assign the 8-color palette to
-- members in join order (oldest first). Cycles past the 8th member
-- with NULL since we only have 8 distinct ids; in practice no game
-- has >8 human members so this is mostly defensive.
with ordered as (
  select id, game_id, connected_at,
         row_number() over (
           partition by game_id
           order by connected_at, id
         ) as rn
  from public.game_members
  where airline_color_id is null
)
update public.game_members m
set airline_color_id = case ordered.rn
  when 1 then 'teal'
  when 2 then 'sky'
  when 3 then 'amber'
  when 4 then 'emerald'
  when 5 then 'rose'
  when 6 then 'violet'
  when 7 then 'indigo'
  when 8 then 'slate'
  else null
end
from ordered
where m.id = ordered.id;

commit;
