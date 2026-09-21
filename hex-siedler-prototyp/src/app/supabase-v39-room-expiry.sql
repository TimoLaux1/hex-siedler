-- New Katan v39: Inaktive Räume nach 24 Stunden schließen.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

alter table public.games
  add column if not exists last_active_at timestamptz;

-- Vorhandene Spiele möglichst anhand ihrer letzten sichtbaren Aktivität
-- einordnen. Räume ohne Aktivität erhalten einmalig den Migrationszeitpunkt.
update public.games g
set last_active_at = coalesce(
  (select ga.created_at from public.game_activity ga where ga.game_id = g.id),
  now()
)
where g.last_active_at is null;

alter table public.games
  alter column last_active_at set default now(),
  alter column last_active_at set not null;

create or replace function public.touch_game_last_active_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Jede echte Änderung am Spielzustand zählt als Aktivität.
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.state is distinct from old.state
     or new.version is distinct from old.version then
    new.last_active_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists touch_game_last_active_at_trigger on public.games;
create trigger touch_game_last_active_at_trigger
before insert or update on public.games
for each row execute function public.touch_game_last_active_at();

create or replace function public.close_stale_game_rooms(
  p_join_code text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  update public.games g
  set status = 'finished',
      state = coalesce(g.state, '{}'::jsonb)
        || jsonb_build_object('phase', 'expired', 'expired_at', now()),
      version = coalesce(g.version, 0) + 1
  where g.status in ('waiting', 'setup', 'playing')
    and g.last_active_at < now() - interval '24 hours'
    and (p_join_code is null or trim(p_join_code) = '' or g.join_code = upper(trim(p_join_code)))
    and exists (
      select 1
      from public.game_players gp
      where gp.game_id = g.id
        and gp.user_id = auth.uid()
    );

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

revoke all on function public.close_stale_game_rooms(text) from public;
grant execute on function public.close_stale_game_rooms(text) to authenticated;

create or replace function public.resume_my_game_room(p_join_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resumed_game jsonb;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  perform public.close_stale_game_rooms(p_join_code);

  select to_jsonb(g)
  into resumed_game
  from public.games g
  inner join public.game_players gp on gp.game_id = g.id
  where gp.user_id = auth.uid()
    and g.status in ('waiting', 'setup', 'playing')
    and g.last_active_at >= now() - interval '24 hours'
    and (
      p_join_code is null
      or trim(p_join_code) = ''
      or g.join_code = upper(trim(p_join_code))
    )
  order by
    case when p_join_code is not null and g.join_code = upper(trim(p_join_code)) then 0 else 1 end,
    g.last_active_at desc
  limit 1;

  return resumed_game;
end;
$$;

revoke all on function public.resume_my_game_room(text) from public;
grant execute on function public.resume_my_game_room(text) to authenticated;

-- Auch der Beitritt per Raumcode räumt einen abgelaufenen Raum zuerst auf.
-- Die vorhandene join_game_room-Funktion akzeptiert danach ohnehin nur noch
-- Räume mit status = 'waiting'.
create or replace function public.expire_game_room_by_code(p_join_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  was_closed boolean := false;
begin
  update public.games g
  set status = 'finished',
      state = coalesce(g.state, '{}'::jsonb)
        || jsonb_build_object('phase', 'expired', 'expired_at', now()),
      version = coalesce(g.version, 0) + 1
  where g.join_code = upper(trim(p_join_code))
    and g.status in ('waiting', 'setup', 'playing')
    and g.last_active_at < now() - interval '24 hours';

  was_closed := found;
  return was_closed;
end;
$$;

revoke all on function public.expire_game_room_by_code(text) from public;
grant execute on function public.expire_game_room_by_code(text) to authenticated;
