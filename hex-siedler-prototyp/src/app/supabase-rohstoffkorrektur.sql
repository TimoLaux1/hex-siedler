-- Einmal vollständig in Supabase > SQL Editor ausführen.
-- Korrigiert Rohstoffausgabe für zufällige Bretter, Aufbau, Städte,
-- Fischgründe, Räuber, Goldminen und die Kartenabgabe bei einer 7.

-- Die Karte wird für jedes Spiel neu gemischt. Deshalb wird der Rohstoff immer
-- aus dem tatsächlich gespeicherten sichtbaren Feldtyp abgeleitet. So bleiben
-- auch ältere Räume korrekt, deren "resource"-Eigenschaft noch nicht zum
-- angezeigten Namen bzw. className passt.
create or replace function public.board_tile_resource(p_tile jsonb)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_tile->>'className', p_tile->>'classname', ''))
    when 'forest' then 'wood'
    when 'clay' then 'brick'
    when 'meadow' then 'wool'
    when 'field' then 'grain'
    when 'mountain' then 'ore'
    when 'desert' then 'none'
    else case lower(coalesce(p_tile->>'name', ''))
      when 'wald' then 'wood'
      when 'lehm' then 'brick'
      when 'weide' then 'wool'
      when 'feld' then 'grain'
      when 'gebirge' then 'ore'
      when 'wüste' then 'none'
      else coalesce(p_tile->>'resource', 'none')
    end
  end;
$$;

create or replace function public.correct_setup_starting_resources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  placed jsonb;
  tile_index integer;
  resource_name text;
  player_buildings integer;
  corrected jsonb;
begin
  if coalesce(old.state->>'phase','') <> 'setup_settlement'
     or coalesce(new.state->'settlements','[]'::jsonb) = coalesce(old.state->'settlements','[]'::jsonb) then
    return new;
  end if;

  for placed in
    select fresh.value
    from jsonb_array_elements(coalesce(new.state->'settlements','[]'::jsonb)) fresh(value)
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(old.state->'settlements','[]'::jsonb)) previous(value)
      where (previous.value->>'vertex')::integer = (fresh.value->>'vertex')::integer
    )
  loop
    select count(*) into player_buildings
    from jsonb_array_elements(coalesce(new.state->'settlements','[]'::jsonb)) building
    where (building->>'player')::integer = (placed->>'player')::integer;

    -- Nur die zweite Startsiedlung vergibt Anfangsrohstoffe.
    if player_buildings = 2 then
      corrected := '{"wood":0,"brick":0,"wool":0,"grain":0,"ore":0}'::jsonb;
      for tile_index in
        select unnest(mapping.tile_indices)
        from public.board_vertex_tiles mapping
        where mapping.vertex_id = (placed->>'vertex')::integer
      loop
        resource_name := public.board_tile_resource(new.board_tiles->tile_index);
        if resource_name in ('wood','brick','wool','grain','ore') then
          corrected := jsonb_set(
            corrected,
            array[resource_name],
            to_jsonb(coalesce((corrected->>resource_name)::integer,0) + 1),
            true
          );
        end if;
      end loop;

      update public.game_players
      set resources = corrected
      where game_id = new.id
        and player_index = (placed->>'player')::integer;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists correct_setup_starting_resources_trigger on public.games;
create constraint trigger correct_setup_starting_resources_trigger
after update on public.games
deferrable initially deferred
for each row
execute function public.correct_setup_starting_resources();

-- Wird vom Client unmittelbar nach dem Setzen einer Startsiedlung aufgerufen.
-- Diese abschließende Korrektur läuft nach place_setup_settlement und kann daher
-- nicht mehr von einer älteren, hart codierten Rohstoffvergabe überschrieben werden.
create or replace function public.sync_my_setup_resources(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  my_index integer;
  own_buildings integer;
  second_vertex integer;
  tile_index integer;
  resource_name text;
  corrected jsonb := '{"wood":0,"brick":0,"wool":0,"grain":0,"ore":0}'::jsonb;
begin
  select * into game_row
  from public.games
  where id = p_game_id;

  if game_row.id is null then
    raise exception 'Spiel nicht gefunden';
  end if;

  select player_index into my_index
  from public.game_players
  where game_id = p_game_id
    and user_id = auth.uid();

  if my_index is null then
    raise exception 'Du gehörst nicht zu diesem Spiel';
  end if;

  if game_row.status <> 'playing'
     or coalesce(game_row.state->>'phase','') not like 'setup_%' then
    return (
      select resources
      from public.game_players
      where game_id = p_game_id and player_index = my_index
    );
  end if;

  select count(*), max(case when placement_order = latest_order then vertex end)
  into own_buildings, second_vertex
  from (
    select
      (building->>'vertex')::integer as vertex,
      placement_order,
      max(placement_order) over () as latest_order
    from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb))
      with ordinality placed(building,placement_order)
    where (building->>'player')::integer = my_index
  ) own_settlements;

  if own_buildings <> 2 or second_vertex is null then
    return (
      select resources
      from public.game_players
      where game_id = p_game_id and player_index = my_index
    );
  end if;

  for tile_index in
    select unnest(mapping.tile_indices)
    from public.board_vertex_tiles mapping
    where mapping.vertex_id = second_vertex
  loop
    resource_name := public.board_tile_resource(game_row.board_tiles->tile_index);
    if resource_name in ('wood','brick','wool','grain','ore') then
      corrected := jsonb_set(
        corrected,
        array[resource_name],
        to_jsonb(coalesce((corrected->>resource_name)::integer,0) + 1),
        true
      );
    end if;
  end loop;

  update public.game_players
  set resources = corrected
  where game_id = p_game_id
    and player_index = my_index;

  return corrected;
end;
$$;

revoke all on function public.sync_my_setup_resources(uuid) from public;
grant execute on function public.sync_my_setup_resources(uuid) to authenticated;

create or replace function public.roll_turn_dice(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  my_index integer;
  die_one integer;
  die_two integer;
  rolled integer;
  placed jsonb;
  tile_index integer;
  resource_name text;
  building_multiplier integer;
  fish_tile jsonb;
  reward_index integer;
  discard_queue jsonb := '[]'::jsonb;
  next_phase text;
begin
  select * into game_row from public.games where id = p_game_id for update;
  select player_index into my_index from public.game_players
  where game_id = p_game_id and user_id = auth.uid();

  if my_index is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if game_row.status <> 'playing' or game_row.state->>'phase' <> 'turn'
    then raise exception 'Die reguläre Spielrunde ist noch nicht bereit'; end if;
  if (game_row.state->>'active_player')::integer <> my_index
    then raise exception 'Ein anderer Spieler ist am Zug'; end if;
  if game_row.state ? 'dice' then raise exception 'Du hast in diesem Zug bereits gewürfelt'; end if;

  die_one := floor(random() * 6 + 1)::integer;
  die_two := floor(random() * 6 + 1)::integer;
  rolled := die_one + die_two;

  if rolled <> 7 then
    for placed in select value from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) loop
      building_multiplier := case when placed->>'building' = 'city' then 2 else 1 end;

      -- Die tatsächlichen, zufällig gespeicherten Felder sind maßgeblich.
      for tile_index in
        select unnest(mapping.tile_indices)
        from public.board_vertex_tiles mapping
        where mapping.vertex_id = (placed->>'vertex')::integer
      loop
        if tile_index <> coalesce((game_row.state->>'robber_tile')::integer,9)
           and (game_row.board_tiles->tile_index->>'number')::integer = rolled then
          resource_name := public.board_tile_resource(game_row.board_tiles->tile_index);
          if resource_name in ('wood','brick','wool','grain','ore') then
            update public.game_players
            set resources = jsonb_set(
              resources,
              array[resource_name],
              to_jsonb(coalesce((resources->>resource_name)::integer,0) + building_multiplier),
              true
            )
            where game_id = p_game_id
              and player_index = (placed->>'player')::integer;
          end if;
        end if;
      end loop;

      -- Fischgründe geben pro Siedlung einen und pro Stadt zwei Zufallsrohstoffe.
      for fish_tile in select value from jsonb_array_elements(coalesce(game_row.fish_tiles,'[]'::jsonb)) loop
        if (fish_tile->>'number')::integer = rolled and exists (
          select 1 from public.board_vertex_fish_slots
          where vertex_id = (placed->>'vertex')::integer
            and fish_slot = (fish_tile->>'slot')::integer
        ) then
          for reward_index in 1..building_multiplier loop
            resource_name := (array['wood','brick','wool','grain','ore'])[floor(random()*5+1)::integer];
            update public.game_players
            set resources = jsonb_set(
              resources,
              array[resource_name],
              to_jsonb(coalesce((resources->>resource_name)::integer,0) + 1),
              true
            )
            where game_id = p_game_id
              and player_index = (placed->>'player')::integer;
          end loop;
        end if;
      end loop;
    end loop;
    next_phase := 'build';
  else
    select coalesce(jsonb_agg(
      jsonb_build_object('player', counted.player_index, 'remaining', floor(counted.total_cards / 2.0)::integer)
      order by counted.player_index
    ), '[]'::jsonb)
    into discard_queue
    from (
      select player_index,
        coalesce((resources->>'wood')::integer,0)
        + coalesce((resources->>'brick')::integer,0)
        + coalesce((resources->>'wool')::integer,0)
        + coalesce((resources->>'grain')::integer,0)
        + coalesce((resources->>'ore')::integer,0) as total_cards
      from public.game_players
      where game_id = p_game_id
    ) counted
    where counted.total_cards > 7;
    next_phase := case when jsonb_array_length(discard_queue) > 0 then 'discard' else 'robber' end;
  end if;

  update public.games
  set version = version + 1,
      state = (state - 'discard_queue' - 'trade_offer') || jsonb_build_object(
        'dice', jsonb_build_array(die_one,die_two),
        'phase', next_phase,
        'robber_roller', my_index
      ) || case when rolled = 7
        then jsonb_build_object('discard_queue',discard_queue)
        else '{}'::jsonb end
  where id = p_game_id
  returning * into game_row;

  return game_row;
end;
$$;

grant execute on function public.roll_turn_dice(uuid) to authenticated;

-- Bei mehreren Goldminen erhält der Besitzer auch mehrere Auswahlen.
create or replace function public.correct_goldmine_reward_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  corrected_queue jsonb;
begin
  if coalesce(new.state->>'phase','') = 'goldmine'
     and coalesce(old.state->>'phase','') <> 'goldmine' then
    select coalesce(jsonb_agg((building->>'player')::integer order by position),'[]'::jsonb)
    into corrected_queue
    from jsonb_array_elements(coalesce(new.state->'settlements','[]'::jsonb))
      with ordinality placed(building,position)
    where building->>'building' = 'goldmine';

    if corrected_queue is distinct from coalesce(new.state->'goldmine_queue','[]'::jsonb) then
      update public.games
      set state = jsonb_set(state,'{goldmine_queue}',corrected_queue,true),
          version = version + 1
      where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists correct_goldmine_reward_queue_trigger on public.games;
create trigger correct_goldmine_reward_queue_trigger
after update of state on public.games
for each row
execute function public.correct_goldmine_reward_queue();
