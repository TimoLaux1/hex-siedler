-- New Katan v56: Katan.error, verständlichere Ereignisse und das einmalige
-- Straßen-Abrissereignis für erfahrene Spieler.

create table if not exists public.player_special_events (
  user_id uuid not null,
  event_key text not null,
  game_id uuid references public.games(id) on delete set null,
  triggered_at timestamptz not null default now(),
  primary key (user_id,event_key)
);

alter table public.player_special_events enable row level security;

-- Bereits angelegte zweite Bots und künftige Bots tragen denselben Namen.
update public.game_players
set player_name = 'Katan.error'
where is_bot and player_name in ('CatanGPT','KatanGPT');

create or replace function public.trigger_marode_roads(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  affected public.game_players%rowtype;
  win_count integer;
  event_id text;
  remaining_roads jsonb;
begin
  select * into g from public.games where id=p_game_id for update;
  if g.id is null or g.status<>'playing' or coalesce((g.state->>'round')::integer,0)<=10 then
    return g;
  end if;

  select * into affected
  from public.game_players
  where game_id=p_game_id and user_id=auth.uid() and not coalesce(is_bot,false)
  for update;
  if affected.player_index is null then return g; end if;

  select count(distinct won_game.id)::integer into win_count
  from public.game_players historic_player
  join public.games won_game on won_game.id=historic_player.game_id
  where historic_player.user_id=auth.uid()
    and won_game.status='finished'
    and coalesce((won_game.state->>'winner_player')::integer,-1)=historic_player.player_index;
  if coalesce(win_count,0)<5 then return g; end if;

  insert into public.player_special_events(user_id,event_key,game_id)
  values(auth.uid(),'marode_roads',p_game_id)
  on conflict (user_id,event_key) do nothing;
  if not found then return g; end if;

  select coalesce(jsonb_agg(road),'[]'::jsonb) into remaining_roads
  from jsonb_array_elements(coalesce(g.state->'roads','[]'::jsonb)) road
  where (road->>'player')::integer<>affected.player_index;

  event_id := p_game_id::text || '-' || affected.user_id::text;
  update public.games
  set state=jsonb_set(
        jsonb_set(state,'{roads}',remaining_roads,true),
        '{road_decay_event}',
        jsonb_build_object(
          'id',event_id,
          'player',affected.player_index,
          'player_name',affected.player_name,
          'occurred_at',clock_timestamp()
        ),
        true
      ),
      version=version+1
  where id=p_game_id returning * into g;

  select * into g from public.refresh_longest_road(p_game_id);

  insert into public.game_activity(game_id,message,kind,created_at)
  values(p_game_id,'Alle Straßen von '||affected.player_name||' wurden wegen Baufälligkeit abgerissen.','build',now())
  on conflict (game_id) do update
    set message=excluded.message,kind=excluded.kind,created_at=excluded.created_at;

  return g;
end;
$$;

create or replace function public.record_game_activity(
  p_game_id uuid,
  p_action text,
  p_detail text default null
)
returns table(message text, kind text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_message text;
  v_kind text;
  v_created_at timestamptz := now();
begin
  select gp.player_name into v_name
  from public.game_players gp
  where gp.game_id=p_game_id and gp.user_id=auth.uid();
  if v_name is null then raise exception 'Du bist kein Spieler in diesem Raum.'; end if;

  v_kind := case
    when p_action='dice' then 'dice'
    when p_action in ('road','settlement','city','goldmine','goldmine_resource') then 'build'
    when p_action in ('bank_trade','trade_offer','trade_accept','trade_reject') then 'trade'
    when p_action in ('klaus','klaus_buy','klaus_card','robber','discard') then 'klaus'
    when p_action='win' then 'win'
    when p_action in ('start','turn','end_turn') then 'turn'
    else 'info'
  end;
  v_message := case p_action
    when 'start' then v_name||' startet das Spiel.'
    when 'turn' then coalesce(nullif(p_detail,''),v_name)||' ist am Zug.'
    when 'dice' then v_name||' würfelt'||case when p_detail is not null then ' eine '||p_detail else '' end||'.'
    when 'road' then v_name||' baut eine Straße.'
    when 'settlement' then v_name||' baut eine Siedlung.'
    when 'city' then v_name||' baut eine Stadt.'
    when 'goldmine' then v_name||' baut eine Goldmine.'
    when 'goldmine_resource' then v_name||' wählt einen Goldminen-Rohstoff.'
    when 'robber' then case when nullif(p_detail,'') is not null then v_name||' hat '||p_detail||' beklaut.' else v_name||' versetzt den Räuber.' end
    when 'bank_trade' then v_name||' handelt mit dem Vorrat.'
    when 'trade_offer' then v_name||' bietet einen Handel an.'
    when 'trade_accept' then v_name||' nimmt den Handel an.'
    when 'trade_reject' then v_name||' lehnt den Handel ab.'
    when 'discard' then v_name||' hat '||coalesce(nullif(p_detail,''),'1')||' Rohstoff'||case when coalesce(nullif(p_detail,''),'1')='1' then '' else 'e' end||' abgegeben.'
    when 'end_turn' then v_name||' beendet den Zug.'
    when 'klaus' then v_name||' ruft Klaus.'
    when 'klaus_buy' then v_name||' kauft eine Klaus-Karte.'
    when 'klaus_card' then v_name||' spielt „'||coalesce(nullif(p_detail,''),'eine Klaus-Karte')||'“.'
    when 'win' then v_name||' gewinnt das Spiel.'
    else v_name||' ist am Zug.'
  end;

  insert into public.game_activity(game_id,message,kind,created_at)
  values(p_game_id,v_message,v_kind,v_created_at)
  on conflict (game_id) do update
    set message=excluded.message,kind=excluded.kind,created_at=excluded.created_at;
  return query select v_message,v_kind,v_created_at;
end;
$$;

revoke all on function public.trigger_marode_roads(uuid) from public;
grant execute on function public.trigger_marode_roads(uuid) to authenticated;
revoke all on function public.record_game_activity(uuid,text,text) from public;
grant execute on function public.record_game_activity(uuid,text,text) to authenticated;
