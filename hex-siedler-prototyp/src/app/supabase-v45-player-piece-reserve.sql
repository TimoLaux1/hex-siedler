-- New Katan v45: Vorratsboni der Spieler für die Anzeige bereitstellen.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

drop function if exists public.get_game_players_with_bots(uuid);
create function public.get_game_players_with_bots(p_game_id uuid)
returns table(
  user_id uuid,
  player_name text,
  player_index integer,
  color text,
  resources jsonb,
  victory_points integer,
  knight_points integer,
  last_bank_trade_round integer,
  is_bot boolean,
  road_limit_bonus integer,
  settlement_limit_bonus integer
)
language sql
security definer
set search_path = public
as $$
  select
    gp.user_id,
    gp.player_name,
    gp.player_index,
    gp.color,
    gp.resources,
    gp.victory_points,
    coalesce(gp.knight_points,0),
    gp.last_bank_trade_round,
    gp.is_bot,
    coalesce(gp.road_limit_bonus,0),
    coalesce(gp.settlement_limit_bonus,0)
  from public.game_players gp
  where gp.game_id = p_game_id
    and exists (
      select 1 from public.game_players me
      where me.game_id = p_game_id and me.user_id = auth.uid()
    )
  order by gp.player_index;
$$;

revoke all on function public.get_game_players_with_bots(uuid) from public;
grant execute on function public.get_game_players_with_bots(uuid) to authenticated;
