-- 13-point games use the extended physical piece reserve shown in the UI.
create or replace function public.build_game_road(
  p_game_id uuid,
  p_edge integer,
  p_vertex_a integer,
  p_vertex_b integer
) returns games
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  game_row public.games;
  my_index integer;
  my_resources jsonb;
  my_bonus integer;
  connection_ok boolean;
  own_road_count integer;
  road_limit integer;
begin
  select * into game_row from public.games where id=p_game_id for update;
  if game_row.id is null then raise exception 'Spielraum nicht gefunden'; end if;

  select player_index,resources,road_limit_bonus
  into my_index,my_resources,my_bonus
  from public.game_players
  where game_id=p_game_id and user_id=auth.uid()
  for update;

  if my_index is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if game_row.status<>'playing' or game_row.state->>'phase'<>'build' then raise exception 'Jetzt kann keine Straße gebaut werden'; end if;
  if (game_row.state->>'active_player')::integer<>my_index then raise exception 'Du bist nicht am Zug'; end if;
  if not exists(
    select 1 from public.board_edges
    where edge_id=p_edge
      and ((vertex_a=p_vertex_a and vertex_b=p_vertex_b) or (vertex_a=p_vertex_b and vertex_b=p_vertex_a))
  ) then raise exception 'Ungültiger Straßenplatz'; end if;
  if exists(select 1 from jsonb_array_elements(game_row.state->'roads') road where (road->>'edge')::integer=p_edge) then
    raise exception 'Dieser Weg ist bereits belegt';
  end if;

  select count(*) into own_road_count
  from jsonb_array_elements(game_row.state->'roads') road
  where (road->>'player')::integer=my_index;
  road_limit := case
    when coalesce(game_row.victory_target,10) between 7 and 9 then 10
    when coalesce(game_row.victory_target,10)>=13 then 17+coalesce(my_bonus,0)
    else 15+coalesce(my_bonus,0)
  end;
  if own_road_count>=road_limit then raise exception 'Du hast keine Straße mehr übrig'; end if;

  select exists(
    select 1
    from unnest(array[p_vertex_a,p_vertex_b]) endpoint(vertex_id)
    where exists(
      select 1 from jsonb_array_elements(game_row.state->'settlements') building
      where (building->>'vertex')::integer=endpoint.vertex_id and (building->>'player')::integer=my_index
    ) or (
      not exists(
        select 1 from jsonb_array_elements(game_row.state->'settlements') building
        where (building->>'vertex')::integer=endpoint.vertex_id and (building->>'player')::integer<>my_index
      ) and exists(
        select 1 from jsonb_array_elements(game_row.state->'roads') road
        where (road->>'player')::integer=my_index
          and ((road->>'a')::integer=endpoint.vertex_id or (road->>'b')::integer=endpoint.vertex_id)
      )
    )
  ) into connection_ok;
  if not connection_ok then raise exception 'Die Straße muss an dein Straßennetz angeschlossen sein'; end if;
  if coalesce((my_resources->>'wood')::integer,0)<1 or coalesce((my_resources->>'brick')::integer,0)<1 then
    raise exception 'Du brauchst 1 Holz und 1 Lehm';
  end if;

  update public.game_players
  set resources=jsonb_set(
    jsonb_set(resources,'{wood}',to_jsonb((resources->>'wood')::integer-1)),
    '{brick}',to_jsonb((resources->>'brick')::integer-1)
  )
  where game_id=p_game_id and player_index=my_index;

  update public.games
  set version=version+1,
      state=jsonb_set(state,'{roads}',(state->'roads')||jsonb_build_array(
        jsonb_build_object('edge',p_edge,'a',p_vertex_a,'b',p_vertex_b,'player',my_index)
      ))
  where id=p_game_id
  returning * into game_row;
  return game_row;
end;
$function$;

create or replace function public.build_game_settlement(
  p_game_id uuid,
  p_vertex integer
) returns games
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  game_row public.games;
  my_index integer;
  my_resources jsonb;
  neighbors integer[];
  own_settlement_count integer;
  my_bonus integer;
  settlement_limit integer;
begin
  select * into game_row from public.games where id=p_game_id for update;
  if game_row.id is null then raise exception 'Spielraum nicht gefunden'; end if;

  select player_index,resources,settlement_limit_bonus
  into my_index,my_resources,my_bonus
  from public.game_players
  where game_id=p_game_id and user_id=auth.uid()
  for update;

  if my_index is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if game_row.status<>'playing' or game_row.state->>'phase'<>'build' then raise exception 'Jetzt kann keine Siedlung gebaut werden'; end if;
  if (game_row.state->>'active_player')::integer<>my_index then raise exception 'Du bist nicht am Zug'; end if;
  select neighbor_vertices into neighbors from public.board_vertex_neighbors where vertex_id=p_vertex;
  if neighbors is null then raise exception 'Ungültiger Bauplatz'; end if;
  if exists(select 1 from jsonb_array_elements(game_row.state->'settlements') building where (building->>'vertex')::integer=p_vertex) then
    raise exception 'Dieser Bauplatz ist belegt';
  end if;
  if exists(select 1 from jsonb_array_elements(game_row.state->'settlements') building where (building->>'vertex')::integer=any(neighbors)) then
    raise exception 'Die Abstandsregel ist nicht erfüllt';
  end if;
  if not exists(
    select 1 from jsonb_array_elements(game_row.state->'roads') road
    where (road->>'player')::integer=my_index
      and ((road->>'a')::integer=p_vertex or (road->>'b')::integer=p_vertex)
  ) then raise exception 'Die Siedlung muss an deine Straße angeschlossen sein'; end if;

  select count(*) into own_settlement_count
  from jsonb_array_elements(game_row.state->'settlements') building
  where (building->>'player')::integer=my_index
    and coalesce(building->>'building','settlement')='settlement';
  settlement_limit := case
    when coalesce(game_row.victory_target,10) between 7 and 9 then 5
    when coalesce(game_row.victory_target,10)>=13 then 6+coalesce(my_bonus,0)
    else 5+coalesce(my_bonus,0)
  end;
  if own_settlement_count>=settlement_limit then raise exception 'Du hast keine Siedlung mehr übrig'; end if;

  if coalesce((my_resources->>'wood')::integer,0)<1
    or coalesce((my_resources->>'brick')::integer,0)<1
    or coalesce((my_resources->>'wool')::integer,0)<1
    or coalesce((my_resources->>'grain')::integer,0)<1 then
    raise exception 'Du brauchst Holz, Lehm, Wolle und Getreide';
  end if;

  update public.game_players
  set resources=jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(resources,'{wood}',to_jsonb((resources->>'wood')::integer-1)),
            '{brick}',to_jsonb((resources->>'brick')::integer-1)
          ),
          '{wool}',to_jsonb((resources->>'wool')::integer-1)
        ),
        '{grain}',to_jsonb((resources->>'grain')::integer-1)
      ),
      victory_points=victory_points+1
  where game_id=p_game_id and player_index=my_index;

  update public.games
  set version=version+1,
      state=jsonb_set(state,'{settlements}',(state->'settlements')||jsonb_build_array(
        jsonb_build_object('vertex',p_vertex,'player',my_index,'building','settlement')
      ))
  where id=p_game_id
  returning * into game_row;
  return game_row;
end;
$function$;

-- Angry Klaus may be played before rolling; every other Klaus card remains
-- restricted to the build phase after the roll.
create or replace function public.play_klaus_card(
  p_game_id uuid,
  p_card_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns games
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  game_row public.games;
  player_row public.game_players;
  card_row public.game_cards;
  current_round integer;
  target_player integer;
  selected_vertex integer;
  selected_edge integer;
  selected_tile integer;
  selected_resource text;
begin
  select * into game_row from public.games where games.id=p_game_id for update;
  select * into player_row from public.game_players where game_id=p_game_id and user_id=auth.uid();
  select * into card_row from public.game_cards where id=p_card_id and game_id=p_game_id for update;

  if player_row.user_id is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if card_row.id is null or card_row.user_id<>auth.uid() or card_row.status<>'hand' then
    raise exception 'Diese Klaus-Karte gehört nicht zu deiner Hand';
  end if;
  if game_row.status<>'playing' or not (
    game_row.state->>'phase'='build'
    or (game_row.state->>'phase'='turn' and card_row.card_type='angry')
  ) then
    raise exception 'Diese Klaus-Karte kann jetzt nicht gespielt werden';
  end if;
  if (game_row.state->>'active_player')::integer<>player_row.player_index then raise exception 'Du bist nicht am Zug'; end if;
  if game_row.state ? 'card_event' then raise exception 'Eine andere Klaus-Karte wird gerade gezeigt'; end if;

  current_round := coalesce((game_row.state->>'round')::integer,1);
  if not card_row.must_play and card_row.bought_round is not null and card_row.bought_round>=current_round then
    raise exception 'Diese Klaus-Karte ist frühestens in deinem nächsten Zug spielbar';
  end if;
  if not card_row.must_play and exists (
    select 1 from public.game_cards
    where game_id=p_game_id and user_id=auth.uid() and played_round=current_round and status in ('pending','played')
  ) then raise exception 'Du hast in dieser Runde bereits eine Klaus-Karte gespielt'; end if;

  if card_row.card_type='disappointed' then
    target_player := (p_payload->>'target_player')::integer;
    if target_player=player_row.player_index or not exists(
      select 1 from public.game_players where game_id=p_game_id and player_index=target_player
    ) then raise exception 'Wähle einen anderen Spieler'; end if;
  elsif card_row.card_type='proud' then
    selected_resource := p_payload->>'resource';
    if selected_resource not in ('wood','brick','wool','grain','ore') then raise exception 'Wähle einen gültigen Rohstoff'; end if;
  elsif card_row.card_type='stupid' then
    selected_edge := (p_payload->>'edge')::integer;
    if not exists(
      select 1 from jsonb_array_elements(coalesce(game_row.state->'roads','[]'::jsonb)) road
      where (road->>'edge')::integer=selected_edge and (road->>'player')::integer=player_row.player_index
    ) then raise exception 'Wähle eine eigene Straße'; end if;
  elsif card_row.card_type='sneaky' then
    selected_vertex := (p_payload->>'vertex')::integer;
    if not exists(select 1 from public.board_vertex_tiles where vertex_id=selected_vertex)
      and not exists(select 1 from public.board_vertex_fish_slots where vertex_id=selected_vertex) then
      raise exception 'Ungültige Kreuzung';
    end if;
    if exists(
      select 1 from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) settlement
      where (settlement->>'vertex')::integer=selected_vertex
    ) then raise exception 'Diese Kreuzung ist bereits bebaut'; end if;
    if not exists(
      select 1 from jsonb_array_elements(coalesce(game_row.state->'roads','[]'::jsonb)) road
      where (road->>'player')::integer=player_row.player_index
        and ((road->>'a')::integer=selected_vertex or (road->>'b')::integer=selected_vertex)
    ) then raise exception 'Die Kreuzung muss an dein Straßennetz angeschlossen sein'; end if;
    if coalesce((player_row.resources->>'wood')::integer,0)<1
      or coalesce((player_row.resources->>'brick')::integer,0)<1
      or coalesce((player_row.resources->>'wool')::integer,0)<1
      or coalesce((player_row.resources->>'grain')::integer,0)<1 then
      raise exception 'Für die Sneaky-Siedlung fehlen Rohstoffe';
    end if;
  elsif card_row.card_type='angry' then
    selected_tile := (p_payload->>'tile')::integer;
    if selected_tile not between 0 and 18 then raise exception 'Wähle ein gültiges Feld'; end if;
    if p_payload ? 'target_player' then
      target_player := (p_payload->>'target_player')::integer;
      if target_player=player_row.player_index or not exists(
        select 1
        from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) settlement
        join public.board_vertex_tiles mapping on mapping.vertex_id=(settlement->>'vertex')::integer
        where (settlement->>'player')::integer=target_player and selected_tile=any(mapping.tile_indices)
      ) then raise exception 'Dieser Spieler ist vom Ritterfeld nicht betroffen'; end if;
    end if;
  elsif card_row.card_type='desert' then
    selected_tile := (p_payload->>'tile')::integer;
    if selected_tile not between 0 and 18 or coalesce(game_row.board_tiles->selected_tile->>'resource','none')='none' then
      raise exception 'Wähle ein Rohstofffeld';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) settlement
      join public.board_vertex_tiles mapping on mapping.vertex_id=(settlement->>'vertex')::integer
      where selected_tile=any(mapping.tile_indices)
    ) then raise exception 'An diesem Feld wurde bereits gebaut'; end if;
  elsif card_row.card_type<>'rich' then
    raise exception 'Unbekannte Klaus-Karte';
  end if;

  update public.game_cards
  set status='pending',payload=coalesce(p_payload,'{}'::jsonb),played_round=current_round
  where id=p_card_id;

  update public.games
  set version=version+1,
      state=jsonb_set(state,'{card_event}',jsonb_build_object(
        'card_id',p_card_id,
        'card_type',card_row.card_type,
        'player',player_row.player_index,
        'resolve_at',clock_timestamp()+interval '4 seconds'
      ))
  where id=p_game_id
  returning * into game_row;
  return game_row;
end;
$function$;
