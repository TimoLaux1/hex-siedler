-- Wüster Klaus may also turn an undeveloped fish tile into desert.

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
    if selected_tile between 0 and 18 then
      if coalesce(game_row.board_tiles->selected_tile->>'resource','none')='none' then
        raise exception 'Wähle ein Rohstoff- oder Fischfeld';
      end if;
      if exists(
        select 1
        from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) settlement
        join public.board_vertex_tiles mapping on mapping.vertex_id=(settlement->>'vertex')::integer
        where selected_tile=any(mapping.tile_indices)
      ) then raise exception 'An diesem Feld wurde bereits gebaut'; end if;
    elsif exists(
      select 1
      from jsonb_array_elements(coalesce(game_row.fish_tiles,'[]'::jsonb)) fish
      where 19+(fish->>'slot')::integer=selected_tile
        and not coalesce((fish->>'desert')::boolean,false)
    ) then
      if exists(
        select 1
        from jsonb_array_elements(coalesce(game_row.state->'settlements','[]'::jsonb)) settlement
        join public.board_vertex_fish_slots mapping on mapping.vertex_id=(settlement->>'vertex')::integer
        where mapping.fish_slot=selected_tile-19
      ) then raise exception 'An diesem Feld wurde bereits gebaut'; end if;
    else
      raise exception 'Wähle ein Rohstoff- oder Fischfeld';
    end if;
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

create or replace function public.resolve_klaus_card(
  p_game_id uuid,
  p_card_id uuid
) returns games
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  game_row public.games;
  card_row public.game_cards;
  actor_index integer;
  target_player integer;
  selected_vertex integer;
  selected_edge integer;
  selected_tile integer;
  selected_resource text;
  stolen_resource text;
  collected integer;
  winner_index integer;
  new_state jsonb;
  new_roads jsonb;
  new_board_tiles jsonb;
  new_fish_tiles jsonb;
begin
  select * into game_row from public.games where games.id=p_game_id for update;
  if not exists(select 1 from public.game_players where game_id=p_game_id and user_id=auth.uid()) then
    raise exception 'Du gehörst nicht zu diesem Spiel';
  end if;
  select * into card_row from public.game_cards where id=p_card_id and game_id=p_game_id for update;
  if card_row.id is null then raise exception 'Klaus-Karte nicht gefunden'; end if;
  if card_row.status='played' then return game_row; end if;
  if card_row.status<>'pending' then raise exception 'Diese Karte wartet nicht auf Ausführung'; end if;
  if clock_timestamp()<(game_row.state->'card_event'->>'resolve_at')::timestamptz then return game_row; end if;

  select player_index into actor_index from public.game_players where game_id=p_game_id and user_id=card_row.user_id;
  new_state := game_row.state-'card_event';
  new_board_tiles := game_row.board_tiles;
  new_fish_tiles := game_row.fish_tiles;

  if card_row.card_type='disappointed' then
    target_player := (card_row.payload->>'target_player')::integer;
    update public.game_players set victory_points=greatest(0,victory_points-1)
    where game_id=p_game_id and player_index=target_player;
  elsif card_row.card_type='angry' then
    selected_tile := (card_row.payload->>'tile')::integer;
    new_state := jsonb_set(new_state,'{robber_tile}',to_jsonb(selected_tile));
    update public.game_players set knight_points=knight_points+1
    where game_id=p_game_id and player_index=actor_index;
    if card_row.payload ? 'target_player' then
      target_player := (card_row.payload->>'target_player')::integer;
      select resource_entry.key into stolen_resource
      from public.game_players victim
      cross join lateral jsonb_each_text(victim.resources) resource_entry
      cross join lateral generate_series(1,greatest(resource_entry.value::integer,0)) resource_copy
      where victim.game_id=p_game_id and victim.player_index=target_player
      order by random()
      limit 1;
      if stolen_resource is not null then
        update public.game_players
        set resources=jsonb_set(resources,array[stolen_resource],to_jsonb((resources->>stolen_resource)::integer-1))
        where game_id=p_game_id and player_index=target_player;
        update public.game_players
        set resources=jsonb_set(resources,array[stolen_resource],to_jsonb(coalesce((resources->>stolen_resource)::integer,0)+1))
        where game_id=p_game_id and player_index=actor_index;
      end if;
    end if;
  elsif card_row.card_type='proud' then
    selected_resource := card_row.payload->>'resource';
    select coalesce(sum(coalesce((resources->>selected_resource)::integer,0)),0)::integer into collected
    from public.game_players where game_id=p_game_id and player_index<>actor_index;
    update public.game_players set resources=jsonb_set(resources,array[selected_resource],'0'::jsonb)
    where game_id=p_game_id and player_index<>actor_index;
    update public.game_players
    set resources=jsonb_set(resources,array[selected_resource],to_jsonb(coalesce((resources->>selected_resource)::integer,0)+collected))
    where game_id=p_game_id and player_index=actor_index;
  elsif card_row.card_type='stupid' then
    selected_edge := (card_row.payload->>'edge')::integer;
    select coalesce(jsonb_agg(road),'[]'::jsonb) into new_roads
    from jsonb_array_elements(coalesce(new_state->'roads','[]'::jsonb)) road
    where not ((road->>'edge')::integer=selected_edge and (road->>'player')::integer=actor_index);
    new_state := jsonb_set(new_state,'{roads}',new_roads);
  elsif card_row.card_type='sneaky' then
    selected_vertex := (card_row.payload->>'vertex')::integer;
    if exists(
      select 1 from jsonb_array_elements(coalesce(new_state->'settlements','[]'::jsonb)) settlement
      where (settlement->>'vertex')::integer=selected_vertex
    ) then raise exception 'Die Sneaky-Kreuzung wurde inzwischen bebaut'; end if;
    update public.game_players
    set resources=resources||jsonb_build_object(
          'wood',(resources->>'wood')::integer-1,
          'brick',(resources->>'brick')::integer-1,
          'wool',(resources->>'wool')::integer-1,
          'grain',(resources->>'grain')::integer-1
        ),
        victory_points=victory_points+1
    where game_id=p_game_id and player_index=actor_index
      and (resources->>'wood')::integer>=1
      and (resources->>'brick')::integer>=1
      and (resources->>'wool')::integer>=1
      and (resources->>'grain')::integer>=1;
    if not found then raise exception 'Für die Sneaky-Siedlung fehlen inzwischen Rohstoffe'; end if;
    new_state := jsonb_set(
      new_state,
      '{settlements}',
      coalesce(new_state->'settlements','[]'::jsonb)||jsonb_build_array(
        jsonb_build_object('vertex',selected_vertex,'player',actor_index,'building','settlement')
      )
    );
  elsif card_row.card_type='desert' then
    selected_tile := (card_row.payload->>'tile')::integer;
    -- Recheck under the game lock in case somebody built during the card delay.
    if selected_tile between 0 and 18 then
      if exists(
        select 1
        from jsonb_array_elements(coalesce(new_state->'settlements','[]'::jsonb)) settlement
        join public.board_vertex_tiles mapping on mapping.vertex_id=(settlement->>'vertex')::integer
        where selected_tile=any(mapping.tile_indices)
      ) then raise exception 'An diesem Feld wurde inzwischen gebaut'; end if;
      new_board_tiles := jsonb_set(
        new_board_tiles,
        array[selected_tile::text],
        jsonb_build_object('name','Wüste','className','desert','symbol','●','number',0,'resource','none')
      );
    elsif exists(
      select 1
      from jsonb_array_elements(coalesce(new_fish_tiles,'[]'::jsonb)) fish
      where 19+(fish->>'slot')::integer=selected_tile
        and not coalesce((fish->>'desert')::boolean,false)
    ) then
      if exists(
        select 1
        from jsonb_array_elements(coalesce(new_state->'settlements','[]'::jsonb)) settlement
        join public.board_vertex_fish_slots mapping on mapping.vertex_id=(settlement->>'vertex')::integer
        where mapping.fish_slot=selected_tile-19
      ) then raise exception 'An diesem Feld wurde inzwischen gebaut'; end if;
      select coalesce(
        jsonb_agg(
          case
            when 19+(fish.value->>'slot')::integer=selected_tile
              then fish.value||jsonb_build_object('number',0,'desert',true)
            else fish.value
          end
          order by fish.ordinality
        ),
        '[]'::jsonb
      ) into new_fish_tiles
      from jsonb_array_elements(coalesce(new_fish_tiles,'[]'::jsonb)) with ordinality fish(value,ordinality);
    else
      raise exception 'Das gewählte Feld kann nicht mehr verwüstet werden';
    end if;
  elsif card_row.card_type='rich' then
    update public.game_players
    set road_limit_bonus=road_limit_bonus+2,
        settlement_limit_bonus=settlement_limit_bonus+1
    where game_id=p_game_id and player_index=actor_index;
  end if;

  update public.game_cards set status='played',must_play=false where id=p_card_id;
  select player_index into winner_index
  from public.game_players
  where game_id=p_game_id and victory_points>=game_row.victory_target
  order by victory_points desc,player_index
  limit 1;
  if winner_index is not null then
    new_state:=jsonb_set(jsonb_set(new_state,'{phase}','"finished"'::jsonb),'{winner_player}',to_jsonb(winner_index));
  end if;
  update public.games
  set state=new_state,
      board_tiles=new_board_tiles,
      fish_tiles=new_fish_tiles,
      status=case when winner_index is not null then 'finished' else status end,
      version=version+1
  where id=p_game_id
  returning * into game_row;

  if card_row.card_type='angry' then
    select * into game_row from public.refresh_largest_army(p_game_id);
  end if;
  return game_row;
end;
$function$;
