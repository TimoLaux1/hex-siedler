-- New Katan v50: smartere Bots und verlässlicher Hinterlistiger Klaus
-- Einmal vollständig im Supabase SQL Editor ausführen.

create or replace function public.record_bot_attack(p_game_id uuid,p_target_bot integer)
returns public.games language plpgsql security definer set search_path=public
as $$
declare
  g public.games; attacker public.game_players; target_bot public.game_players;
  streaks jsonb; previous_streak jsonb; grudges jsonb; next_count integer; next_state jsonb;
begin
  select * into g from public.games where id=p_game_id for update;
  if g.id is null or g.status<>'playing' then raise exception 'Das Spiel ist nicht aktiv.'; end if;
  select * into attacker from public.game_players where game_id=p_game_id and user_id=auth.uid();
  if attacker.player_index is null or attacker.is_bot then raise exception 'Nur menschliche Spieler können einen Bot provozieren.'; end if;
  select * into target_bot from public.game_players where game_id=p_game_id and player_index=p_target_bot and is_bot;
  if target_bot.player_index is null then raise exception 'Das Angriffsziel ist kein Bot.'; end if;

  streaks:=coalesce(g.state->'bot_attack_streaks','{}'::jsonb);
  previous_streak:=streaks->attacker.player_index::text;
  next_count:=case when coalesce((previous_streak->>'target')::integer,-1)=p_target_bot
    then coalesce((previous_streak->>'count')::integer,0)+1 else 1 end;
  streaks:=jsonb_set(streaks,array[attacker.player_index::text],jsonb_build_object('target',p_target_bot,'count',next_count),true);
  next_state:=jsonb_set(g.state,'{bot_attack_streaks}',streaks,true);
  if next_count>=3 then
    grudges:=coalesce(next_state->'bot_grudges','{}'::jsonb);
    grudges:=jsonb_set(grudges,array[p_target_bot::text],to_jsonb(attacker.player_index),true);
    next_state:=jsonb_set(next_state,'{bot_grudges}',grudges,true);
  end if;
  update public.games set state=next_state,version=version+1 where id=p_game_id returning * into g;
  return g;
end; $$;

create or replace function public.bot_revenge_target(p_game_id uuid,p_bot_index integer)
returns integer language plpgsql security definer set search_path=public
as $$
declare g public.games; target_index integer;
begin
  select * into g from public.games where id=p_game_id;
  target_index:=nullif(g.state->'bot_grudges'->>p_bot_index::text,'')::integer;
  if target_index is null then return null; end if;
  if not exists(select 1 from public.game_players where game_id=p_game_id and player_index=target_index and not is_bot)
     or coalesce(g.state->'eliminated_players','[]'::jsonb) @> jsonb_build_array(target_index) then
    return null;
  end if;
  return target_index;
end; $$;

-- Eine normale Bot-Straße wird nur gebaut, wenn ihr neues Ende bereits ein
-- legaler freier Siedlungsplatz ist. So werden keine Sackgassen gekauft.
create or replace function public.bot_best_settlement_road_edge(p_game_id uuid,p_bot_index integer)
returns integer language plpgsql security definer set search_path=public
as $$
declare g public.games; chosen integer;
begin
  select * into g from public.games where id=p_game_id;
  select e.edge_id into chosen
  from public.board_edges e
  cross join lateral (
    values (e.vertex_a,e.vertex_b),(e.vertex_b,e.vertex_a)
  ) direction(connection_vertex,settlement_vertex)
  where not exists(select 1 from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) r where (r->>'edge')::integer=e.edge_id)
    and exists(select 1 from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) r where (r->>'player')::integer=p_bot_index and ((r->>'a')::integer=direction.connection_vertex or (r->>'b')::integer=direction.connection_vertex))
    and not exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=direction.connection_vertex and (b->>'player')::integer<>p_bot_index)
    and not exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=direction.settlement_vertex)
    and not exists(
      select 1 from public.board_vertex_neighbors n
      cross join lateral unnest(n.neighbor_vertices) near(vertex_id)
      join jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b on (b->>'vertex')::integer=near.vertex_id
      where n.vertex_id=direction.settlement_vertex
    )
  order by public.bot_vertex_score(p_game_id,p_bot_index,direction.settlement_vertex) desc,e.edge_id
  limit 1;
  return chosen;
end; $$;

-- Waehlt das Feld mit dem groessten blockierten Produktionsertrag. Eine Stadt
-- zaehlt doppelt; 6/8 werden staerker bewertet als seltene Zahlen. Felder mit
-- einem eigenen Bot-Gebaeude sind immer ausgeschlossen.
create or replace function public.bot_best_robber_tile(p_game_id uuid,p_bot_index integer)
returns integer language plpgsql security definer set search_path=public
as $$
declare g public.games; chosen integer; revenge_target integer;
begin
  select * into g from public.games where id=p_game_id;
  revenge_target:=public.bot_revenge_target(p_game_id,p_bot_index);
  select candidate.tile_id into chosen
  from generate_series(0,jsonb_array_length(g.board_tiles)-1) candidate(tile_id)
  where candidate.tile_id<>coalesce((g.state->>'robber_tile')::integer,-1)
    and not exists (
      select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) own_building
      where (own_building->>'player')::integer=p_bot_index
        and exists (
          select 1 from public.board_vertex_tiles mapping
          cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
          where mapping.vertex_id=(own_building->>'vertex')::integer
            and adjacent.tile_id=candidate.tile_id
        )
    )
    and exists (
      select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) opponent_building
      where (opponent_building->>'player')::integer<>p_bot_index
        and (revenge_target is null or (opponent_building->>'player')::integer=revenge_target)
        and exists (
          select 1 from public.board_vertex_tiles mapping
          cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
          where mapping.vertex_id=(opponent_building->>'vertex')::integer
            and adjacent.tile_id=candidate.tile_id
        )
    )
  order by (
    select coalesce(sum(
      (case coalesce(opponent_building->>'building','settlement') when 'city' then 2 else 1 end)
      * (case coalesce((g.board_tiles->candidate.tile_id->>'number')::integer,0)
          when 6 then 5 when 8 then 5 when 5 then 4 when 9 then 4
          when 4 then 3 when 10 then 3 when 3 then 2 when 11 then 2
          when 2 then 1 when 12 then 1 else 0 end)
    ),0)
    from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) opponent_building
    where (opponent_building->>'player')::integer<>p_bot_index
      and (revenge_target is null or (opponent_building->>'player')::integer=revenge_target)
      and exists (
        select 1 from public.board_vertex_tiles mapping
        cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
        where mapping.vertex_id=(opponent_building->>'vertex')::integer
          and adjacent.tile_id=candidate.tile_id
      )
  ) desc,random()
  limit 1;
  return chosen;
end; $$;

create or replace function public.run_game_bot(p_game_id uuid)
returns public.games language plpgsql security definer set search_path=public
as $$
declare
  g public.games; bot public.game_players; phase text; bot_index integer; chosen_vertex integer; chosen_edge integer;
  latest_vertex integer; setup_step integer; setup_total integer; next_index integer; die1 integer; die2 integer; rolled integer;
  placed jsonb; tile_index integer; bot_resource_name text; multiplier integer; fish jsonb; reward integer;
  total_cards integer; discard_entry jsonb; discard_resource text; trade jsonb; accept_trade boolean; discard_queue jsonb:='[]'::jsonb;
  have_resource text; need_resource text; target_index integer; revenge_target integer; current_round integer; action_done boolean:=false;
  own_city_count integer; own_settlement_count integer; own_road_count integer; road_limit integer; settlement_limit integer;
  bot_card public.game_cards%rowtype; drawn_type text; strongest_resource text; card_roll double precision;
begin
  select * into g from public.games where id=p_game_id for update;
  if g.id is null then raise exception 'Spiel nicht gefunden'; end if;
  if not exists(select 1 from public.game_players where game_id=p_game_id and user_id=auth.uid()) then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  -- Repariert Räume, bei denen die letzte Aufbaustraße bereits zur normalen
  -- Phase gewechselt hat, der äußere Spielstatus aber noch auf setup steht.
  if g.status='setup' and coalesce(g.state->>'phase','') in ('turn','build','robber','discard','goldmine') then
    update public.games set status='playing',version=version+1 where id=p_game_id returning * into g;
  end if;
  -- Während der sichtbaren Karteneinblendung führt der Bot keine weitere
  -- Aktion aus. Nach drei Sekunden wird sie entfernt und normal fortgesetzt.
  if g.state ? 'bot_card_reveal' then
    if coalesce((g.state->'bot_card_reveal'->>'resolve_at')::timestamptz,clock_timestamp())>clock_timestamp() then
      return g;
    end if;
    update public.games set state=state-'bot_card_reveal',version=version+1
    where id=p_game_id returning * into g;
  end if;
  -- Ältere/abweichende Start-RPCs können die Setup-Phase bereits setzen,
  -- bevor der Status exakt auf "playing" steht. Das darf Bots während der
  -- Startaufstellung nicht blockieren.
  if g.status<>'playing' and coalesce(g.state->>'phase','') not in ('setup_settlement','setup_road') then
    return g;
  end if;

  -- Eingehende Angebote an Bots: selten, aber bei strategischem Vorteil öfter annehmen.
  trade:=g.state->'trade_offer';
  if trade is not null then
    select * into bot from public.game_players where game_id=p_game_id and player_index=(trade->>'to')::integer and is_bot for update;
    if bot.player_index is not null then
      accept_trade:=coalesce((bot.resources->>(trade->>'want'))::integer,0)>0
        and (random()<.10 or (coalesce((bot.resources->>(trade->>'want'))::integer,0)>=3 and coalesce((bot.resources->>(trade->>'give'))::integer,0)=0 and random()<.35));
      if accept_trade then
        update public.game_players set resources=jsonb_set(resources,array[trade->>'give'],to_jsonb(coalesce((resources->>(trade->>'give'))::integer,0)+1),true)
          where game_id=p_game_id and player_index=bot.player_index;
        update public.game_players set resources=jsonb_set(resources,array[trade->>'want'],to_jsonb((resources->>(trade->>'want'))::integer-1),true)
          where game_id=p_game_id and player_index=bot.player_index;
        update public.game_players set resources=jsonb_set(resources,array[trade->>'give'],to_jsonb((resources->>(trade->>'give'))::integer-1),true)
          where game_id=p_game_id and player_index=(trade->>'from')::integer;
        update public.game_players set resources=jsonb_set(resources,array[trade->>'want'],to_jsonb(coalesce((resources->>(trade->>'want'))::integer,0)+1),true)
          where game_id=p_game_id and player_index=(trade->>'from')::integer;
      end if;
      update public.games set version=version+1,state=state-'trade_offer' where id=p_game_id returning * into g; return g;
    end if;
    -- Ausgehende Bot-Angebote bleiben höchstens 30 Sekunden offen. Danach wird
    -- das Angebot entfernt und derselbe Bot setzt seinen Zug regulär fort.
    if coalesce((g.state->>'trade_expires_at')::timestamptz,clock_timestamp())>clock_timestamp() then
      return g;
    end if;
    update public.games
    set version=version+1,state=state-'trade_offer'-'trade_expires_at'
    where id=p_game_id returning * into g;
    trade:=null;
  end if;

  -- Bots geben bei einer 7 selbstständig die billigsten Überschüsse ab.
  select entry into discard_entry from jsonb_array_elements(coalesce(g.state->'discard_queue','[]'::jsonb)) entry
  where exists(select 1 from public.game_players where game_id=p_game_id and player_index=(entry->>'player')::integer and is_bot) limit 1;
  if discard_entry is not null then
    bot_index:=(discard_entry->>'player')::integer;
    for reward in 1..(discard_entry->>'remaining')::integer loop
      select key into discard_resource from jsonb_each_text((select resources from public.game_players where game_id=p_game_id and player_index=bot_index)) order by value::integer desc limit 1;
      update public.game_players set resources=jsonb_set(resources,array[discard_resource],to_jsonb(greatest(0,(resources->>discard_resource)::integer-1))) where game_id=p_game_id and player_index=bot_index;
    end loop;
    update public.games set version=version+1,state=jsonb_set(state,'{discard_queue}',coalesce((select jsonb_agg(e) from jsonb_array_elements(state->'discard_queue') e where (e->>'player')::integer<>bot_index),'[]'::jsonb)) where id=p_game_id returning * into g;
    if jsonb_array_length(g.state->'discard_queue')=0 then update public.games set state=jsonb_set(state-'discard_queue','{phase}','"robber"') where id=p_game_id returning * into g; end if;
    return g;
  end if;

  phase:=g.state->>'phase';
  -- In der Startaufstellung ist setup_order/setup_step die maßgebliche
  -- Zugreihenfolge. active_player kann nach einer menschlichen Setup-Aktion
  -- noch auf dem vorherigen Spieler stehen und darf den Bot nicht blockieren.
  if phase in ('setup_settlement','setup_road') then
    setup_step:=coalesce((g.state->>'setup_step')::integer,0);
    bot_index:=coalesce((g.state->'setup_order'->>setup_step)::integer,-1);
  else
    bot_index:=coalesce((g.state->>'active_player')::integer,-1);
  end if;
  select * into bot from public.game_players where game_id=p_game_id and player_index=bot_index and is_bot for update;
  if bot.player_index is null then return g; end if;
  revenge_target:=public.bot_revenge_target(p_game_id,bot_index);

  -- Mehrere geöffnete Browser dürfen den Bot anstoßen. Die gesperrte Spielzeile
  -- und dieser serverseitige Zeitstempel verhindern Doppelzüge und garantieren
  -- den gewünschten Abstand von mindestens drei Sekunden zwischen Bot-Aktionen.
  if g.state ? 'bot_last_action_at'
     and (g.state->>'bot_last_action_at')::timestamptz > clock_timestamp()-interval '3 seconds' then
    return g;
  end if;
  update public.games
  set state=jsonb_set(state,'{bot_last_action_at}',to_jsonb(clock_timestamp()),true)
  where id=p_game_id returning * into g;

  current_round:=coalesce((g.state->>'round')::integer,1);

  if phase='setup_settlement' then
    select candidate.vertex_id into chosen_vertex
    from (select vertex_id from public.board_vertex_tiles union select vertex_id from public.board_vertex_fish_slots) candidate
    where not exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=candidate.vertex_id)
      and not exists(select 1 from public.board_vertex_neighbors n join lateral unnest(n.neighbor_vertices) near(v) on true join jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b on (b->>'vertex')::integer=near.v where n.vertex_id=candidate.vertex_id)
    order by
      -- Bei der zweiten Startsiedlung zählt jede noch fehlende Rohstoffart
      -- stärker als ein einzelner Würfelwahrscheinlichkeits-Punkt.
      coalesce((
        select count(distinct public.board_tile_resource(g.board_tiles->candidate_tile.tile_id))*100
        from public.board_vertex_tiles candidate_mapping
        cross join lateral unnest(candidate_mapping.tile_indices) candidate_tile(tile_id)
        where candidate_mapping.vertex_id=candidate.vertex_id
          and public.board_tile_resource(g.board_tiles->candidate_tile.tile_id) in ('wood','brick','wool','grain','ore')
          and exists(
            select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) own_building
            where (own_building->>'player')::integer=bot_index
          )
          and not exists(
            select 1
            from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) own_building
            join public.board_vertex_tiles own_mapping on own_mapping.vertex_id=(own_building->>'vertex')::integer
            cross join lateral unnest(own_mapping.tile_indices) own_tile(tile_id)
            where (own_building->>'player')::integer=bot_index
              and public.board_tile_resource(g.board_tiles->own_tile.tile_id)=public.board_tile_resource(g.board_tiles->candidate_tile.tile_id)
          )
      ),0)
      +coalesce((
        select sum(case coalesce(((g.board_tiles->candidate_tile.tile_id)->>'number')::integer,0)
          when 6 then 5 when 8 then 5 when 5 then 4 when 9 then 4
          when 4 then 3 when 10 then 3 when 3 then 2 when 11 then 2
          when 2 then .3 when 12 then .3 else 0 end)
        from public.board_vertex_tiles candidate_mapping
        cross join lateral unnest(candidate_mapping.tile_indices) candidate_tile(tile_id)
        where candidate_mapping.vertex_id=candidate.vertex_id
      ),0) desc,
      candidate.vertex_id
    limit 1;
    if chosen_vertex is null then raise exception 'Bot findet keinen Bauplatz'; end if;
    update public.games set version=version+1,state=jsonb_set(jsonb_set(state,'{settlements}',coalesce(state->'settlements','[]'::jsonb)||jsonb_build_array(jsonb_build_object('vertex',chosen_vertex,'player',bot_index,'building','settlement'))),'{phase}','"setup_road"') where id=p_game_id returning * into g;
    perform public.record_bot_game_activity(p_game_id,bot_index,'settlement');
    return g;
  end if;

  if phase='setup_road' then
    select (entry.b->>'vertex')::integer into latest_vertex
    from jsonb_array_elements(g.state->'settlements') with ordinality as entry(b,position)
    where (entry.b->>'player')::integer=bot_index order by entry.position desc limit 1;
    select e.edge_id into chosen_edge from public.board_edges e where (e.vertex_a=latest_vertex or e.vertex_b=latest_vertex)
      and not exists(select 1 from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) r where (r->>'edge')::integer=e.edge_id)
      order by public.bot_vertex_score(p_game_id,bot_index,case when e.vertex_a=latest_vertex then e.vertex_b else e.vertex_a end) desc limit 1;
    update public.games set version=version+1,state=jsonb_set(state,'{roads}',coalesce(state->'roads','[]'::jsonb)||jsonb_build_array(jsonb_build_object('edge',chosen_edge,'a',(select vertex_a from public.board_edges where edge_id=chosen_edge),'b',(select vertex_b from public.board_edges where edge_id=chosen_edge),'player',bot_index))) where id=p_game_id returning * into g;
    perform public.record_bot_game_activity(p_game_id,bot_index,'road');
    setup_step:=coalesce((g.state->>'setup_step')::integer,0)+1; setup_total:=jsonb_array_length(g.state->'setup_order');
    if setup_step>=setup_total then
      update public.games set status='playing',state=(state||jsonb_build_object('setup_step',setup_step,'active_player',(state->'setup_order'->>0)::integer,'phase','turn')) where id=p_game_id returning * into g;
    else
      update public.games set state=(state||jsonb_build_object('setup_step',setup_step,'active_player',(state->'setup_order'->>setup_step)::integer,'phase','setup_settlement')) where id=p_game_id returning * into g;
    end if;
    return g;
  end if;

  if phase='turn' then
    die1:=floor(random()*6+1)::integer; die2:=floor(random()*6+1)::integer; rolled:=die1+die2;
    if rolled<>7 then
      for placed in select value from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) loop
        multiplier:=case when placed->>'building'='city' then 2 else 1 end;
        for tile_index in select unnest(tile_indices) from public.board_vertex_tiles where vertex_id=(placed->>'vertex')::integer loop
          if tile_index<>coalesce((g.state->>'robber_tile')::integer,9) and (g.board_tiles->tile_index->>'number')::integer=rolled then
            bot_resource_name:=public.board_tile_resource(g.board_tiles->tile_index);
            if bot_resource_name in ('wood','brick','wool','grain','ore') then update public.game_players set resources=jsonb_set(resources,array[bot_resource_name],to_jsonb(coalesce((resources->>bot_resource_name)::integer,0)+multiplier),true) where game_id=p_game_id and player_index=(placed->>'player')::integer; end if;
          end if;
        end loop;
        for fish in select value from jsonb_array_elements(coalesce(g.fish_tiles,'[]'::jsonb)) loop
          if (fish->>'number')::integer=rolled and exists(select 1 from public.board_vertex_fish_slots where vertex_id=(placed->>'vertex')::integer and fish_slot=(fish->>'slot')::integer) then
            for reward in 1..multiplier loop bot_resource_name:=(array['wood','brick','wool','grain','ore'])[floor(random()*5+1)::integer]; update public.game_players set resources=jsonb_set(resources,array[bot_resource_name],to_jsonb(coalesce((resources->>bot_resource_name)::integer,0)+1),true) where game_id=p_game_id and player_index=(placed->>'player')::integer; end loop;
          end if;
        end loop;
      end loop;
      phase:='build';
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'player',p.player_index,
        'remaining',floor((coalesce((p.resources->>'wood')::integer,0)+coalesce((p.resources->>'brick')::integer,0)+coalesce((p.resources->>'wool')::integer,0)+coalesce((p.resources->>'grain')::integer,0)+coalesce((p.resources->>'ore')::integer,0))/2.0)::integer
      ) order by p.player_index),'[]'::jsonb)
      into discard_queue
      from public.game_players p
      where p.game_id=p_game_id
        and coalesce((p.resources->>'wood')::integer,0)+coalesce((p.resources->>'brick')::integer,0)+coalesce((p.resources->>'wool')::integer,0)+coalesce((p.resources->>'grain')::integer,0)+coalesce((p.resources->>'ore')::integer,0)>7;
      phase:=case when jsonb_array_length(discard_queue)>0 then 'discard' else 'robber' end;
    end if;
    update public.games set version=version+1,state=(state-'trade_offer')||jsonb_build_object('dice',jsonb_build_array(die1,die2),'phase',phase,'robber_roller',bot_index,'dice_stats',jsonb_set(coalesce(state->'dice_stats','{}'::jsonb),array[rolled::text],to_jsonb(coalesce((state->'dice_stats'->>rolled::text)::integer,0)+1),true)) where id=p_game_id returning * into g;
    if rolled=7 and jsonb_array_length(discard_queue)>0 then
      update public.games set state=jsonb_set(state,'{discard_queue}',discard_queue) where id=p_game_id returning * into g;
    end if;
    perform public.record_bot_game_activity(p_game_id,bot_index,'dice',rolled::text);
    return g;
  end if;

  if phase='robber' then
    tile_index:=public.bot_best_robber_tile(p_game_id,bot_index);
    select p.player_index into target_index
    from public.game_players p
    join jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b on (b->>'player')::integer=p.player_index
    where p.game_id=p_game_id and p.player_index<>bot_index
      and (revenge_target is null or p.player_index=revenge_target)
      and exists (
        select 1 from public.board_vertex_tiles mapping
        cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
        where mapping.vertex_id=(b->>'vertex')::integer and adjacent.tile_id=tile_index
      )
    order by p.victory_points desc,p.player_index limit 1;
    if tile_index is null then
      select candidate into tile_index from generate_series(0,jsonb_array_length(g.board_tiles)-1) candidate
      where candidate<>coalesce((g.state->>'robber_tile')::integer,-1)
        and not exists (
          select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) own_building
          where (own_building->>'player')::integer=bot_index
            and exists (
              select 1 from public.board_vertex_tiles mapping
              cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
              where mapping.vertex_id=(own_building->>'vertex')::integer and adjacent.tile_id=candidate
            )
        )
      order by random() limit 1;
    end if;
    select key into bot_resource_name from jsonb_each_text((select resources from public.game_players where game_id=p_game_id and player_index=target_index)) where value::integer>0 order by random() limit 1;
    if bot_resource_name is not null then
      update public.game_players set resources=jsonb_set(resources,array[bot_resource_name],to_jsonb((resources->>bot_resource_name)::integer-1)) where game_id=p_game_id and player_index=target_index;
      update public.game_players set resources=jsonb_set(resources,array[bot_resource_name],to_jsonb(coalesce((resources->>bot_resource_name)::integer,0)+1),true) where game_id=p_game_id and player_index=bot_index;
    end if;
    -- Eine gewürfelte 7 versetzt nur den Räuber. Ritterpunkte gibt es
    -- ausschließlich durch die Klaus-Karte "Böser Klaus".
    update public.games set version=version+1,state=(state||jsonb_build_object('robber_tile',tile_index,'phase','build')) where id=p_game_id returning * into g;
    select * into g from public.refresh_largest_army(p_game_id);
    perform public.record_bot_game_activity(p_game_id,bot_index,'robber');
    return g;
  end if;

  if phase='build' then
    -- Eine ältere Bot-Karte wird vor dem Bauen ausgespielt (höchstens eine pro Runde).
    select * into bot_card from public.game_cards c
    where c.game_id=p_game_id and c.owner_player_index=bot_index and c.status='hand'
      and (coalesce(c.must_play,false) or coalesce(c.bought_round,0)<current_round)
      and (revenge_target is null or c.card_type<>'proud')
      and not exists(select 1 from public.game_cards used where used.game_id=p_game_id and used.owner_player_index=bot_index and used.played_round=current_round and used.status='played')
    order by coalesce(c.must_play,false) desc,c.created_at limit 1 for update;
    if bot_card.id is not null then
      if bot_card.card_type='disappointed' then
        select player_index into target_index from public.game_players
        where game_id=p_game_id and player_index<>bot_index
          and (revenge_target is null or player_index=revenge_target)
        order by victory_points desc,player_index limit 1;
        update public.game_players set victory_points=greatest(0,victory_points-1)
        where game_id=p_game_id and player_index=target_index;
        action_done:=target_index is not null;
      elsif bot_card.card_type='angry' then
        tile_index:=public.bot_best_robber_tile(p_game_id,bot_index);
        select p.player_index into target_index
        from public.game_players p
        join jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b on (b->>'player')::integer=p.player_index
        where p.game_id=p_game_id and p.player_index<>bot_index
          and (revenge_target is null or p.player_index=revenge_target)
          and exists (
            select 1 from public.board_vertex_tiles mapping
            cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
            where mapping.vertex_id=(b->>'vertex')::integer and adjacent.tile_id=tile_index
          )
        order by p.victory_points desc,p.player_index limit 1;
        if tile_index is null then
          select candidate into tile_index from generate_series(0,jsonb_array_length(g.board_tiles)-1) candidate
          where candidate<>coalesce((g.state->>'robber_tile')::integer,-1)
            and not exists (
              select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) own_building
              where (own_building->>'player')::integer=bot_index
                and exists (
                  select 1 from public.board_vertex_tiles mapping
                  cross join lateral unnest(mapping.tile_indices) adjacent(tile_id)
                  where mapping.vertex_id=(own_building->>'vertex')::integer and adjacent.tile_id=candidate
                )
            )
          order by random() limit 1;
        end if;
        select key into bot_resource_name from jsonb_each_text((select resources from public.game_players where game_id=p_game_id and player_index=target_index))
        where value::integer>0 order by random() limit 1;
        if bot_resource_name is not null then
          update public.game_players set resources=jsonb_set(resources,array[bot_resource_name],to_jsonb((resources->>bot_resource_name)::integer-1)) where game_id=p_game_id and player_index=target_index;
          update public.game_players set resources=jsonb_set(resources,array[bot_resource_name],to_jsonb(coalesce((resources->>bot_resource_name)::integer,0)+1),true) where game_id=p_game_id and player_index=bot_index;
        end if;
        update public.game_players set knight_points=coalesce(knight_points,0)+1 where game_id=p_game_id and player_index=bot_index;
        update public.games set state=state||jsonb_build_object('robber_tile',tile_index),version=version+1 where id=p_game_id returning * into g;
        action_done:=tile_index is not null;
      elsif bot_card.card_type='proud' then
        select key into strongest_resource from jsonb_each_text(bot.resources) order by value::integer asc,key limit 1;
        select coalesce(sum((resources->>strongest_resource)::integer),0)::integer into total_cards
        from public.game_players where game_id=p_game_id and player_index<>bot_index;
        update public.game_players set resources=jsonb_set(resources,array[strongest_resource],'0'::jsonb,true)
        where game_id=p_game_id and player_index<>bot_index;
        update public.game_players set resources=jsonb_set(resources,array[strongest_resource],to_jsonb(
          coalesce((resources->>strongest_resource)::integer,0)+total_cards
        ),true) where game_id=p_game_id and player_index=bot_index;
        action_done:=true;
      elsif bot_card.card_type='stupid' then
        select (r->>'edge')::integer into chosen_edge from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) r
        where (r->>'player')::integer=bot_index order by random() limit 1;
        if chosen_edge is not null then
          update public.games set state=jsonb_set(state,'{roads}',coalesce((select jsonb_agg(r) from jsonb_array_elements(state->'roads') r where (r->>'edge')::integer<>chosen_edge),'[]'::jsonb)),version=version+1 where id=p_game_id returning * into g;
          action_done:=true;
        end if;
      elsif bot_card.card_type='sneaky' then
        select candidate.vertex_id into chosen_vertex from public.board_vertex_neighbors candidate
        where exists(select 1 from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) r where (r->>'player')::integer=bot_index and ((r->>'a')::integer=candidate.vertex_id or (r->>'b')::integer=candidate.vertex_id))
          and not exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=candidate.vertex_id)
          and exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=any(candidate.neighbor_vertices))
        order by public.bot_vertex_score(p_game_id,bot_index,candidate.vertex_id) desc limit 1;
        select count(*) into own_settlement_count from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b
        where (b->>'player')::integer=bot_index and coalesce(b->>'building','settlement')='settlement';
        settlement_limit:=case when coalesce(g.victory_target,10)>=13 then 6 else 5 end+coalesce(bot.settlement_limit_bonus,0);
        if chosen_vertex is not null and own_settlement_count<settlement_limit
           and coalesce((bot.resources->>'wood')::integer,0)>=1 and coalesce((bot.resources->>'brick')::integer,0)>=1
           and coalesce((bot.resources->>'wool')::integer,0)>=1 and coalesce((bot.resources->>'grain')::integer,0)>=1 then
          update public.game_players set resources=resources||jsonb_build_object(
            'wood',(resources->>'wood')::integer-1,'brick',(resources->>'brick')::integer-1,
            'wool',(resources->>'wool')::integer-1,'grain',(resources->>'grain')::integer-1
          ),victory_points=victory_points+1 where game_id=p_game_id and player_index=bot_index;
          update public.games set version=version+1,state=jsonb_set(state,'{settlements}',coalesce(state->'settlements','[]'::jsonb)||jsonb_build_array(jsonb_build_object('vertex',chosen_vertex,'player',bot_index,'building','settlement'))) where id=p_game_id returning * into g;
          if (select victory_points from public.game_players where game_id=p_game_id and player_index=bot_index)>=coalesce(g.victory_target,10) then
            update public.games set status='finished',state=state||jsonb_build_object('phase','finished','winner_player',bot_index),version=version+1 where id=p_game_id returning * into g;
          end if;
          action_done:=true;
        end if;
      elsif bot_card.card_type='rich' then
        update public.game_players set road_limit_bonus=road_limit_bonus+2,settlement_limit_bonus=settlement_limit_bonus+1
        where game_id=p_game_id and player_index=bot_index;
        action_done:=true;
      end if;
      if action_done then
        update public.game_cards set status='played',must_play=false,played_round=current_round where id=bot_card.id;
        update public.games set version=version+1,state=jsonb_set(state,'{bot_card_reveal}',jsonb_build_object(
          'card_type',bot_card.card_type,'player',bot_index,'resolve_at',clock_timestamp()+interval '3 seconds'
        ),true) where id=p_game_id returning * into g;
        if bot_card.card_type='angry' then select * into g from public.refresh_largest_army(p_game_id); end if;
        perform public.record_bot_game_activity(p_game_id,bot_index,'klaus_card',case bot_card.card_type
          when 'disappointed' then 'Enttäuschter Klaus' when 'angry' then 'Böser Klaus'
          when 'proud' then 'Stolzer Klaus' when 'stupid' then 'Blöder Klaus'
          when 'sneaky' then 'Hinterlistiger Klaus' when 'desert' then 'Wüster Klaus'
          when 'rich' then 'Reicher Klaus' else 'Klaus-Karte' end);
        return g;
      end if;
    end if;

    -- Bots kaufen regelmäßig Klaus-Karten. In den ersten 20 Runden haben
    -- Siedlungen Vorrang: Wolle und Getreide dafür werden als Reserve behalten.
    if coalesce((bot.resources->>'ore')::integer,0)>=1 and coalesce((bot.resources->>'wool')::integer,0)>=1
       and coalesce((bot.resources->>'grain')::integer,0)>=1 and current_round%3=0
       and (current_round>20 or (
         coalesce((bot.resources->>'wool')::integer,0)>=2
         and coalesce((bot.resources->>'grain')::integer,0)>=2
       ))
       and not exists(select 1 from public.game_cards c where c.game_id=p_game_id and c.owner_player_index=bot_index and c.bought_round=current_round) then
      update public.game_players set resources=resources||jsonb_build_object(
        'ore',(resources->>'ore')::integer-1,'wool',(resources->>'wool')::integer-1,'grain',(resources->>'grain')::integer-1)
      where game_id=p_game_id and player_index=bot_index;
      card_roll:=random();
      drawn_type:=case when card_roll<.20 then 'disappointed' when card_roll<.60 then 'angry'
        when card_roll<.70 then 'proud' when card_roll<.80 then 'stupid' when card_roll<.90 then 'sneaky'
        when card_roll<.95 then 'desert' else 'rich' end;
      insert into public.game_cards(game_id,user_id,owner_player_index,card_type,must_play,bought_round,status)
      values(p_game_id,null,bot_index,drawn_type,drawn_type='stupid',current_round,'hand');
      update public.games set version=version+1 where id=p_game_id returning * into g;
      perform public.record_bot_game_activity(p_game_id,bot_index,'klaus_buy');
      return g;
    end if;

    select count(*) into own_city_count from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'player')::integer=bot_index and b->>'building'='city';
    if coalesce((bot.resources->>'ore')::integer,0)>=3 and coalesce((bot.resources->>'grain')::integer,0)>=2 and own_city_count<4 then
      select (b->>'vertex')::integer into chosen_vertex from jsonb_array_elements(g.state->'settlements') b where (b->>'player')::integer=bot_index and coalesce(b->>'building','settlement')='settlement' order by public.bot_vertex_score(p_game_id,bot_index,(b->>'vertex')::integer) desc limit 1;
      if chosen_vertex is not null then
        update public.game_players set resources=resources||jsonb_build_object('ore',(resources->>'ore')::integer-3,'grain',(resources->>'grain')::integer-2),victory_points=victory_points+1 where game_id=p_game_id and player_index=bot_index;
        update public.games set version=version+1,state=jsonb_set(state,'{settlements}',(select jsonb_agg(case when (b->>'vertex')::integer=chosen_vertex then b||jsonb_build_object('building','city') else b end) from jsonb_array_elements(state->'settlements') b)) where id=p_game_id returning * into g;
        if (select victory_points from public.game_players where game_id=p_game_id and player_index=bot_index)>=coalesce(g.victory_target,10) then
          update public.games set status='finished',state=state||jsonb_build_object('phase','finished','winner_player',bot_index),version=version+1 where id=p_game_id returning * into g;
        end if;
        perform public.record_bot_game_activity(p_game_id,bot_index,'city');
        return g;
      end if;
    end if;
    select count(*) into own_settlement_count from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'player')::integer=bot_index and coalesce(b->>'building','settlement')='settlement';
    settlement_limit:=case when coalesce(g.victory_target,10)>=13 then 6 else 5 end+coalesce(bot.settlement_limit_bonus,0);
    if (bot.resources->>'wood')::integer>=1 and (bot.resources->>'brick')::integer>=1 and (bot.resources->>'wool')::integer>=1 and (bot.resources->>'grain')::integer>=1 and own_settlement_count<settlement_limit then
      select candidate.vertex_id into chosen_vertex from public.board_vertex_neighbors candidate
      where exists(select 1 from jsonb_array_elements(g.state->'roads') r where (r->>'player')::integer=bot_index and ((r->>'a')::integer=candidate.vertex_id or (r->>'b')::integer=candidate.vertex_id))
       and not exists(select 1 from jsonb_array_elements(g.state->'settlements') b where (b->>'vertex')::integer=candidate.vertex_id or (b->>'vertex')::integer=any(candidate.neighbor_vertices))
      order by public.bot_vertex_score(p_game_id,bot_index,candidate.vertex_id) desc limit 1;
      if chosen_vertex is not null then
        update public.game_players set resources=resources||jsonb_build_object('wood',(resources->>'wood')::integer-1,'brick',(resources->>'brick')::integer-1,'wool',(resources->>'wool')::integer-1,'grain',(resources->>'grain')::integer-1),victory_points=victory_points+1 where game_id=p_game_id and player_index=bot_index;
        update public.games set version=version+1,state=jsonb_set(state,'{settlements}',state->'settlements'||jsonb_build_array(jsonb_build_object('vertex',chosen_vertex,'player',bot_index,'building','settlement'))) where id=p_game_id returning * into g;
        if (select victory_points from public.game_players where game_id=p_game_id and player_index=bot_index)>=coalesce(g.victory_target,10) then
          update public.games set status='finished',state=state||jsonb_build_object('phase','finished','winner_player',bot_index),version=version+1 where id=p_game_id returning * into g;
        end if;
        perform public.record_bot_game_activity(p_game_id,bot_index,'settlement');
        return g;
      end if;
    end if;
    select count(*) into own_road_count from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) r where (r->>'player')::integer=bot_index;
    road_limit:=case when coalesce(g.victory_target,10)>=13 then 17 else 15 end+coalesce(bot.road_limit_bonus,0);
    if (bot.resources->>'wood')::integer>=1 and (bot.resources->>'brick')::integer>=1 and own_road_count<road_limit then
      chosen_edge:=public.bot_best_settlement_road_edge(p_game_id,bot_index);
      if chosen_edge is not null then
        update public.game_players set resources=resources||jsonb_build_object('wood',(resources->>'wood')::integer-1,'brick',(resources->>'brick')::integer-1) where game_id=p_game_id and player_index=bot_index;
        update public.games set version=version+1,state=jsonb_set(state,'{roads}',state->'roads'||jsonb_build_array(jsonb_build_object('edge',chosen_edge,'a',(select vertex_a from public.board_edges where edge_id=chosen_edge),'b',(select vertex_b from public.board_edges where edge_id=chosen_edge),'player',bot_index))) where id=p_game_id returning * into g;
        -- refresh_longest_road liefert einen vollständigen games-Datensatz.
        -- SELECT * ist nötig, damit PostgreSQL dessen Spalten in die
        -- Composite-Variable g schreibt, statt den ganzen Datensatz als UUID
        -- für das erste Feld von g interpretieren zu wollen.
        select * into g from public.refresh_longest_road(p_game_id);
        perform public.record_bot_game_activity(p_game_id,bot_index,'road');
        return g;
      end if;
    end if;
    -- Wenn kein Bau möglich ist, nutzt der Bot einmal den normalen 4:1-Vorratstausch.
    select key into have_resource from jsonb_each_text(bot.resources) where value::integer>=4 order by value::integer desc limit 1;
    select key into need_resource from jsonb_each_text(bot.resources) where key<>have_resource order by value::integer asc limit 1;
    if have_resource is not null and need_resource is not null then
      update public.game_players
      set resources=jsonb_set(jsonb_set(resources,array[have_resource],to_jsonb((resources->>have_resource)::integer-4)),array[need_resource],to_jsonb(coalesce((resources->>need_resource)::integer,0)+1),true)
      where game_id=p_game_id and player_index=bot_index;
      update public.games set version=version+1 where id=p_game_id returning * into g;
      perform public.record_bot_game_activity(p_game_id,bot_index,'bank_trade');
      return g;
    end if;
    -- Alle drei Runden gelegentlich ein sinnvolles 1:1-Angebot an den stärksten Menschen.
    if current_round%3=0 and random()<.45 and coalesce((g.state->'bot_trade_rounds'->>bot_index::text)::integer,0)<>current_round then
      select key into have_resource from jsonb_each_text(bot.resources) where value::integer>=2 order by value::integer desc limit 1;
      select key into need_resource from jsonb_each_text(bot.resources) where key<>have_resource order by value::integer asc limit 1;
      select player_index into target_index from public.game_players where game_id=p_game_id and not is_bot order by victory_points desc limit 1;
      if have_resource is not null and need_resource is not null and target_index is not null then
        update public.games
        set version=version+1,
            state=jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(state,'{bot_trade_rounds}',coalesce(state->'bot_trade_rounds','{}'::jsonb),true),
                  '{trade_expires_at}',to_jsonb(clock_timestamp()+interval '30 seconds'),true
                ),
                array['bot_trade_rounds',bot_index::text],to_jsonb(current_round),true
              ),
              '{trade_offer}',jsonb_build_object('from',bot_index,'to',target_index,'give',have_resource,'want',need_resource),true
            )
        where id=p_game_id returning * into g;
        perform public.record_bot_game_activity(p_game_id,bot_index,'trade_offer');
        return g;
      end if;
    end if;
    select min(player_index) into next_index from public.game_players where game_id=p_game_id and player_index>bot_index;
    if next_index is null then select min(player_index) into next_index from public.game_players where game_id=p_game_id; end if;
    update public.games set version=version+1,state=(state-'dice'-'trade_offer')||jsonb_build_object('active_player',next_index,'phase','turn','round',current_round+case when next_index<=bot_index then 1 else 0 end) where id=p_game_id returning * into g;
    perform public.record_bot_game_activity(p_game_id,next_index,'turn');
    return g;
  end if;
  return g;
end; $$;

revoke all on function public.record_bot_attack(uuid,integer) from public;
revoke all on function public.bot_revenge_target(uuid,integer) from public;
revoke all on function public.bot_best_settlement_road_edge(uuid,integer) from public;
revoke all on function public.bot_best_robber_tile(uuid,integer) from public;
revoke all on function public.run_game_bot(uuid) from public;

grant execute on function public.record_bot_attack(uuid,integer) to authenticated;
grant execute on function public.run_game_bot(uuid) to authenticated;
