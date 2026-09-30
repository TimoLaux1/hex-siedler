-- The physical reserve depends on the selected victory-point target:
--   7-9 SP:  10 roads, 5 settlements, 3 cities (fixed, no reserve bonus)
--   10-12 SP: 15 roads, 5 settlements, 4 cities (+ Reicher-Klaus bonus)
--   13-15 SP: 17 roads, 6 settlements, 4 cities (+ Reicher-Klaus bonus)
--
-- This trigger is the final server-side guard for every state-changing path,
-- including normal player RPCs, Klaus cards and bot turns. If an older RPC
-- misses its own early limit check, the complete transaction is rolled back.

create or replace function public.enforce_game_piece_reserve()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  player_row record;
  target integer:=coalesce(new.victory_target,10);
  road_count integer;
  settlement_count integer;
  city_count integer;
  road_limit integer;
  settlement_limit integer;
  city_limit integer;
begin
  for player_row in
    select player_index,coalesce(road_limit_bonus,0) as road_bonus,
           coalesce(settlement_limit_bonus,0) as settlement_bonus
    from public.game_players
    where game_id=new.id
  loop
    select count(*) into road_count
    from jsonb_array_elements(coalesce(new.state->'roads','[]'::jsonb)) road
    where (road->>'player')::integer=player_row.player_index;

    select count(*) filter (where coalesce(building->>'building','settlement')='settlement'),
           count(*) filter (where building->>'building'='city')
    into settlement_count,city_count
    from jsonb_array_elements(coalesce(new.state->'settlements','[]'::jsonb)) building
    where (building->>'player')::integer=player_row.player_index;

    if target between 7 and 9 then
      road_limit:=10;
      settlement_limit:=5;
      city_limit:=3;
    elsif target>=13 then
      road_limit:=17+player_row.road_bonus;
      settlement_limit:=6+player_row.settlement_bonus;
      city_limit:=4;
    else
      road_limit:=15+player_row.road_bonus;
      settlement_limit:=5+player_row.settlement_bonus;
      city_limit:=4;
    end if;

    if road_count>road_limit then
      raise exception 'Spieler % hat keine Straße mehr übrig',player_row.player_index;
    end if;
    if settlement_count>settlement_limit then
      raise exception 'Spieler % hat keine Siedlung mehr übrig',player_row.player_index;
    end if;
    if city_count>city_limit then
      raise exception 'Spieler % hat keine Stadt mehr übrig',player_row.player_index;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists enforce_game_piece_reserve on public.games;
create trigger enforce_game_piece_reserve
before insert or update of state,victory_target on public.games
for each row execute function public.enforce_game_piece_reserve();

-- Apply the matching early checks from these two canonical scripts together
-- with this migration. They provide friendly errors before the final trigger:
--   supabase-v58-piece-limits-angry-before-roll.sql
--   supabase-bots.sql
