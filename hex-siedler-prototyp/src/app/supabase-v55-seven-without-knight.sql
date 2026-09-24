-- v55: Eine normale 7 vergibt keinen Ritterpunkt und beendet den Zug nicht.
-- Nach Räuber und möglichen Goldminen-Auswahlen folgt die reguläre Bauphase.
-- "Böser Klaus" behält seine Rittervergabe unverändert.

create or replace function public.move_turn_robber(
  p_game_id uuid,
  p_tile integer,
  p_target_player integer default null
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  my_index integer;
  stolen_resource text;
  goldmine_queue jsonb;
  new_state jsonb;
begin
  select * into game_row from public.games where id = p_game_id for update;
  select player_index into my_index from public.game_players
    where game_id = p_game_id and user_id = auth.uid();

  if my_index is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if game_row.status <> 'playing' or game_row.state->>'phase' <> 'robber'
    then raise exception 'Der Räuber ist gerade nicht am Zug'; end if;
  if (game_row.state->>'active_player')::integer <> my_index
    then raise exception 'Nur der aktive Spieler darf den Räuber versetzen'; end if;
  if p_tile not between 0 and 18 then raise exception 'Wähle ein gültiges Feld'; end if;
  if p_tile = coalesce((game_row.state->>'robber_tile')::integer,9)
    then raise exception 'Der Räuber muss auf ein anderes Feld ziehen'; end if;

  if p_target_player is not null then
    if p_target_player = my_index or not exists (
      select 1
      from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) building
      join public.board_vertex_tiles mapping
        on mapping.vertex_id = (building->>'vertex')::integer
      where (building->>'player')::integer = p_target_player
        and p_tile = any(mapping.tile_indices)
    ) then
      raise exception 'Dieser Spieler ist von dem Feld nicht betroffen';
    end if;

    select resource.key into stolen_resource
    from public.game_players victim
    cross join lateral jsonb_each_text(victim.resources) resource
    cross join lateral generate_series(1,greatest(resource.value::integer,0)) resource_copy
    where victim.game_id = p_game_id and victim.player_index = p_target_player
    order by random() limit 1;

    if stolen_resource is not null then
      update public.game_players
      set resources = jsonb_set(resources,array[stolen_resource],to_jsonb((resources->>stolen_resource)::integer-1))
      where game_id = p_game_id and player_index = p_target_player;

      update public.game_players
      set resources = jsonb_set(resources,array[stolen_resource],to_jsonb(coalesce((resources->>stolen_resource)::integer,0)+1))
      where game_id = p_game_id and player_index = my_index;
    end if;
  end if;

  select coalesce(jsonb_agg(owner.player_index order by owner.player_index),'[]'::jsonb)
  into goldmine_queue
  from (
    select distinct (building->>'player')::integer as player_index
    from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) building
    where building->>'building' = 'goldmine'
  ) owner;

  new_state := jsonb_set(game_row.state,'{robber_tile}',to_jsonb(p_tile));
  if stolen_resource is not null and p_target_player is not null then
    new_state := jsonb_set(
      new_state,
      '{last_robbery}',
      jsonb_build_object('thief',my_index,'victim',p_target_player,'at',clock_timestamp()),
      true
    );
  end if;
  if jsonb_array_length(goldmine_queue) > 0 then
    new_state := jsonb_set(
      jsonb_set(new_state,'{phase}','"goldmine"'::jsonb),
      '{goldmine_queue}',goldmine_queue
    );
  else
    -- Die 7 beendet den Zug nicht: Würfelergebnis und aktiver Spieler bleiben
    -- erhalten, nur der Räuberschritt ist abgeschlossen.
    new_state := jsonb_set(
      new_state - 'robber_roller' - 'goldmine_queue',
      '{phase}',
      '"build"'::jsonb
    );
  end if;

  update public.games
  set state = new_state, version = version + 1
  where id = p_game_id returning * into game_row;
  return game_row;
end;
$$;

create or replace function public.choose_goldmine_resource(
  p_game_id uuid,
  p_resource text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  my_index integer;
  remaining_queue jsonb;
  new_state jsonb;
begin
  select * into game_row from public.games where id = p_game_id for update;
  select player_index into my_index from public.game_players
    where game_id = p_game_id and user_id = auth.uid();

  if my_index is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if game_row.state->>'phase' <> 'goldmine'
    then raise exception 'Keine Goldmine wartet auf eine Auswahl'; end if;
  if (game_row.state->'goldmine_queue'->>0)::integer <> my_index
    then raise exception 'Eine andere Goldmine ist zuerst an der Reihe'; end if;
  if p_resource not in ('wood','brick','wool','grain','ore')
    then raise exception 'Wähle einen gültigen Rohstoff'; end if;

  update public.game_players
  set resources = jsonb_set(
    resources,array[p_resource],
    to_jsonb(coalesce((resources->>p_resource)::integer,0)+1)
  )
  where game_id = p_game_id and player_index = my_index;

  remaining_queue := (game_row.state->'goldmine_queue') - 0;
  new_state := game_row.state;
  if jsonb_array_length(remaining_queue) > 0 then
    new_state := jsonb_set(new_state,'{goldmine_queue}',remaining_queue);
  else
    -- Nach der letzten Goldminen-Auswahl darf der Spieler der 7 weiterbauen.
    new_state := jsonb_set(
      new_state - 'robber_roller' - 'goldmine_queue',
      '{phase}',
      '"build"'::jsonb
    );
  end if;

  update public.games
  set state = new_state, version = version + 1
  where id = p_game_id returning * into game_row;
  return game_row;
end;
$$;

-- Die Live-Bot-Funktion ist umfangreich. Hier wird gezielt nur der erste
-- Ritter-Update-Block entfernt: Er gehört zum normalen Räuberschritt nach 7.
-- Der zweite Treffer gehört zu "Böser Klaus" und bleibt unverändert.
do $$
declare
  function_definition text;
  corrected_definition text;
  regular_knight_update text :=
    'update[[:space:]]+public\.game_players[[:space:]]+set[[:space:]]+knight_points[[:space:]]*=[[:space:]]*coalesce\(knight_points[[:space:]]*,[[:space:]]*0\)[[:space:]]*\+[[:space:]]*1[[:space:]]+where[[:space:]]+game_id[[:space:]]*=[[:space:]]*p_game_id[[:space:]]+and[[:space:]]+player_index[[:space:]]*=[[:space:]]*bot_index[[:space:]]*;';
begin
  if to_regprocedure('public.run_game_bot(uuid)') is null then
    raise exception 'run_game_bot(uuid) wurde nicht gefunden';
  end if;

  select pg_get_functiondef(to_regprocedure('public.run_game_bot(uuid)'))
  into function_definition;
  corrected_definition := regexp_replace(function_definition,regular_knight_update,'','i');
  if corrected_definition = function_definition then
    raise exception 'Die reguläre Rittervergabe in run_game_bot konnte nicht eindeutig entfernt werden';
  end if;
  execute corrected_definition;
end;
$$;

revoke all on function public.move_turn_robber(uuid,integer,integer) from public;
grant execute on function public.move_turn_robber(uuid,integer,integer) to authenticated;
revoke all on function public.choose_goldmine_resource(uuid,text) from public;
grant execute on function public.choose_goldmine_resource(uuid,text) to authenticated;
