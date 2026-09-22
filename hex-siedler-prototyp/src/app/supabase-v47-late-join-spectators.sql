-- New Katan v47: Beitritte nach dem Spielstart sind reine Zuschauer.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

create table if not exists public.game_spectators (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.game_spectators enable row level security;

create or replace function public.join_game_room(p_join_code text, p_player_name text)
returns table(game_id uuid, player_index integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_game public.games%rowtype;
  existing_index integer;
  next_index integer;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if char_length(trim(p_player_name)) not between 1 and 24 then raise exception 'Ungültiger Spielername'; end if;

  select g.* into found_game
  from public.games g
  where g.join_code = upper(trim(p_join_code))
    and g.status in ('waiting','setup','playing')
  for update;

  if found_game.id is null then raise exception 'Spielraum nicht gefunden'; end if;

  select gp.player_index into existing_index
  from public.game_players gp
  where gp.game_id = found_game.id and gp.user_id = auth.uid();

  -- Bereits beteiligte Spieler behalten ihren bisherigen Platz.
  if existing_index is not null then
    return query select found_game.id, existing_index;
    return;
  end if;

  -- Sobald das Spiel gestartet wurde, wird kein weiterer Spielerplatz erzeugt.
  if found_game.status <> 'waiting' then
    insert into public.game_spectators(game_id,user_id)
    values (found_game.id,auth.uid())
    on conflict (game_id,user_id) do update set joined_at=now();
    return query select found_game.id, -1;
    return;
  end if;

  select count(*)::integer into next_index
  from public.game_players gp where gp.game_id = found_game.id;
  if next_index >= 4 then raise exception 'Spielraum ist voll'; end if;

  insert into public.game_players(game_id,user_id,player_name,player_index,color)
  values (found_game.id,auth.uid(),trim(p_player_name),next_index,
          (array['blue','coral','gold','green'])[next_index+1]);

  return query select found_game.id,next_index;
end;
$$;

revoke all on function public.join_game_room(text,text) from public;
grant execute on function public.join_game_room(text,text) to authenticated;

create or replace function public.get_spectator_game_room(p_game_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(g)
  from public.games g
  where g.id=p_game_id
    and exists (
      select 1 from public.game_spectators gs
      where gs.game_id=g.id and gs.user_id=auth.uid()
    );
$$;

revoke all on function public.get_spectator_game_room(uuid) from public;
grant execute on function public.get_spectator_game_room(uuid) to authenticated;

drop function if exists public.get_game_players_with_bots(uuid);
create function public.get_game_players_with_bots(p_game_id uuid)
returns table(
  user_id uuid, player_name text, player_index integer, color text,
  resources jsonb, victory_points integer, knight_points integer,
  last_bank_trade_round integer, is_bot boolean,
  road_limit_bonus integer, settlement_limit_bonus integer
)
language sql
security definer
set search_path = public
as $$
  select gp.user_id,gp.player_name,gp.player_index,gp.color,gp.resources,
         gp.victory_points,coalesce(gp.knight_points,0),gp.last_bank_trade_round,
         gp.is_bot,coalesce(gp.road_limit_bonus,0),coalesce(gp.settlement_limit_bonus,0)
  from public.game_players gp
  where gp.game_id=p_game_id
    and (
      exists(select 1 from public.game_players me where me.game_id=p_game_id and me.user_id=auth.uid())
      or exists(select 1 from public.game_spectators gs where gs.game_id=p_game_id and gs.user_id=auth.uid())
    )
  order by gp.player_index;
$$;

revoke all on function public.get_game_players_with_bots(uuid) from public;
grant execute on function public.get_game_players_with_bots(uuid) to authenticated;
