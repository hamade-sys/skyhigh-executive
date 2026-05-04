-- 0005_chat.sql
--
-- Phase 10 of the enterprise-readiness plan — in-game cohort chatbox.
--
-- Adds a single global chat channel per game. One row per message,
-- denormalised author display name + color id so deleted member rows
-- don't tombstone history. Facilitator broadcasts get a flag for
-- visual highlighting in the panel.
--
-- Soft-delete only: facilitator moderation flips deleted_at +
-- deleted_by_session_id; the row stays for audit. The chat panel
-- renders deleted rows as a tombstone ("message removed by
-- facilitator") so context isn't lost.
--
-- RLS: members of the game can SELECT, members can INSERT (with
-- length cap), facilitators can UPDATE for soft-delete. Non-members
-- get nothing. The /api/games/chat/* endpoints write via the
-- service-role client AFTER assertMembership, so they bypass RLS for
-- the application path; RLS is the defense-in-depth for direct
-- browser → Supabase queries via the anon key.

begin;

create table if not exists public.game_chat_messages (
  id                            uuid primary key default gen_random_uuid(),
  game_id                       uuid not null references public.games(id) on delete cascade,
  author_session_id             uuid not null,
  author_display_name           text not null,
  author_airline_color_id       text,
  is_facilitator_broadcast      boolean not null default false,
  body                          text not null,
  created_at                    timestamptz not null default now(),
  deleted_at                    timestamptz,
  deleted_by_session_id         uuid,
  constraint game_chat_body_length check (
    char_length(body) between 1 and 500
  )
);

create index if not exists game_chat_messages_game_created_idx
  on public.game_chat_messages (game_id, created_at desc);

alter table public.game_chat_messages enable row level security;

-- SELECT — members of the game can read history. Facilitators
-- inherit via their game_members row. Non-members get nothing.
drop policy if exists chat_select_members on public.game_chat_messages;
create policy chat_select_members on public.game_chat_messages
  for select
  using (
    exists (
      select 1
      from public.game_members m
      where m.game_id = game_chat_messages.game_id
        and m.session_id = auth.uid()
    )
  );

-- INSERT — members can send. Body length is enforced by the CHECK
-- constraint above; rate limiting is enforced application-side via
-- the /api/games/chat/send route handler.
drop policy if exists chat_insert_members on public.game_chat_messages;
create policy chat_insert_members on public.game_chat_messages
  for insert
  with check (
    exists (
      select 1
      from public.game_members m
      where m.game_id = game_chat_messages.game_id
        and m.session_id = auth.uid()
    )
    -- Author must match the authenticated user — no impersonation
    -- via direct browser → Supabase writes.
    and author_session_id = auth.uid()
  );

-- UPDATE — facilitators of the game can soft-delete (set deleted_at).
-- We don't expose any other update path to clients.
drop policy if exists chat_update_facilitator on public.game_chat_messages;
create policy chat_update_facilitator on public.game_chat_messages
  for update
  using (
    exists (
      select 1
      from public.games g
      where g.id = game_chat_messages.game_id
        and g.facilitator_session_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.games g
      where g.id = game_chat_messages.game_id
        and g.facilitator_session_id = auth.uid()
    )
  );

-- Per-author rate-limit helper — the /api/games/chat/send route uses
-- this to enforce 5 msgs/10s and 30 msgs/60s. Returns true when the
-- user is within the limits, false when they should be throttled.
-- We do this in Postgres rather than an in-memory limiter because
-- Vercel function instances don't share memory.
create or replace function public.check_chat_rate_limit(
  p_game_id uuid,
  p_session_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  burst_count int;
  minute_count int;
begin
  select count(*) into burst_count
  from public.game_chat_messages
  where game_id = p_game_id
    and author_session_id = p_session_id
    and created_at > now() - interval '10 seconds';

  if burst_count >= 5 then
    return false;
  end if;

  select count(*) into minute_count
  from public.game_chat_messages
  where game_id = p_game_id
    and author_session_id = p_session_id
    and created_at > now() - interval '60 seconds';

  if minute_count >= 30 then
    return false;
  end if;

  return true;
end;
$$;

-- Allow service-role + authenticated users to call the helper.
grant execute on function public.check_chat_rate_limit(uuid, uuid) to authenticated, anon;

commit;
