-- New Katan v42: Highscores aus beendeten Spielen und offene Spielerangebote.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

-- Die Rangliste wird aus den tatsächlich beendeten Spielen berechnet. Dadurch
-- kann ein Sieg weder durch einen fehlenden Zähler-Update verloren gehen noch
-- durch wiederholte Aufrufe doppelt gezählt werden.
drop function if exists public.get_katan_highscores();
create function public.get_katan_highscores()
returns table(rank integer, display_name text, wins integer)
language sql
security definer
set search_path = public
as $$
  with scores as (
    select
      pp.display_name,
      count(distinct g.id)::integer as wins
    from public.player_profiles pp
    left join public.game_players gp on gp.user_id = pp.user_id
    left join public.games g
      on g.id = gp.game_id
      and g.status = 'finished'
      and coalesce((g.state->>'winner_player')::integer, -1) = gp.player_index
    group by pp.user_id, pp.display_name
  )
  select
    dense_rank() over (order by scores.wins desc, scores.display_name asc)::integer,
    scores.display_name,
    scores.wins
  from scores
  where scores.wins > 0
  order by scores.wins desc, scores.display_name asc;
$$;

revoke all on function public.get_katan_highscores() from public;
grant execute on function public.get_katan_highscores() to authenticated;

-- Menschen erstellen immer ein offenes Angebot. p_target_player bleibt aus
-- Kompatibilitätsgründen Teil der Signatur, wird aber nicht mehr verwendet.
create or replace function public.offer_player_trade(
  p_game_id uuid,
  p_target_player integer,
  p_give text,
  p_want text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  me public.game_players%rowtype;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null or g.status <> 'playing' then raise exception 'Das Spiel ist nicht aktiv.'; end if;

  select * into me from public.game_players
  where game_id = p_game_id and user_id = auth.uid()
  for update;
  if me.player_index is null then raise exception 'Du bist kein Spieler in diesem Raum.'; end if;
  if coalesce((g.state->>'active_player')::integer, -1) <> me.player_index
     or coalesce(g.state->>'phase', '') <> 'build' then
    raise exception 'Handel ist nur in deiner Bauphase möglich.';
  end if;
  if g.state ? 'trade_offer' then raise exception 'Es ist bereits ein Handelsangebot offen.'; end if;
  if p_give not in ('wood','brick','wool','grain','ore')
     or p_want not in ('wood','brick','wool','grain','ore')
     or p_give = p_want then raise exception 'Ungültige Rohstoffauswahl.'; end if;
  if coalesce((me.resources->>p_give)::integer, 0) < 1 then
    raise exception 'Du besitzt den angebotenen Rohstoff nicht.';
  end if;
  if not exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game_id and gp.player_index <> me.player_index
  ) then raise exception 'Es gibt keinen möglichen Handelspartner.'; end if;

  update public.games
  set state = jsonb_set(
        state,
        '{trade_offer}',
        jsonb_build_object(
          'from', me.player_index,
          'to', null,
          'give', p_give,
          'want', p_want,
          'rejected_by', '[]'::jsonb
        ),
        true
      ),
      version = version + 1
  where id = p_game_id
  returning * into g;
  return g;
end;
$$;

-- Menschen können ein offenes Angebot annehmen oder nur für sich ablehnen.
-- Das Sperren der Spielzeile garantiert: Bei paralleler Annahme gewinnt exakt
-- die erste Transaktion; alle späteren sehen kein gültiges Angebot mehr.
create or replace function public.respond_player_trade(
  p_game_id uuid,
  p_accept boolean
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  offer jsonb;
  source_player public.game_players%rowtype;
  responder public.game_players%rowtype;
  give_resource text;
  want_resource text;
  rejected jsonb;
  nobody_left boolean;
begin
  select * into g from public.games where id = p_game_id for update;
  offer := g.state->'trade_offer';
  if offer is null then raise exception 'Dieses Angebot ist nicht mehr gültig.'; end if;

  select * into responder from public.game_players
  where game_id = p_game_id and user_id = auth.uid()
  for update;
  if responder.player_index is null then raise exception 'Du bist kein Spieler in diesem Raum.'; end if;
  if responder.player_index = (offer->>'from')::integer then raise exception 'Du kannst dein eigenes Angebot nicht annehmen.'; end if;
  if offer->>'to' is not null and (offer->>'to')::integer <> responder.player_index then
    raise exception 'Dieses Angebot richtet sich an einen anderen Spieler.';
  end if;
  if coalesce(offer->'rejected_by', '[]'::jsonb) @> jsonb_build_array(responder.player_index) then
    raise exception 'Du hast dieses Angebot bereits abgelehnt.';
  end if;

  give_resource := offer->>'give';
  want_resource := offer->>'want';

  if p_accept then
    select * into source_player from public.game_players
    where game_id = p_game_id and player_index = (offer->>'from')::integer
    for update;
    if coalesce((source_player.resources->>give_resource)::integer, 0) < 1 then
      raise exception 'Der angebotene Rohstoff ist nicht mehr verfügbar.';
    end if;
    if coalesce((responder.resources->>want_resource)::integer, 0) < 1 then
      raise exception 'Du besitzt den gewünschten Rohstoff nicht.';
    end if;

    update public.game_players
    set resources = jsonb_set(
      jsonb_set(resources, array[give_resource], to_jsonb((resources->>give_resource)::integer - 1), true),
      array[want_resource], to_jsonb(coalesce((resources->>want_resource)::integer, 0) + 1), true
    ) where game_id = p_game_id and player_index = source_player.player_index;

    update public.game_players
    set resources = jsonb_set(
      jsonb_set(resources, array[want_resource], to_jsonb((resources->>want_resource)::integer - 1), true),
      array[give_resource], to_jsonb(coalesce((resources->>give_resource)::integer, 0) + 1), true
    ) where game_id = p_game_id and player_index = responder.player_index;

    update public.games
    set state = state - 'trade_offer' - 'trade_expires_at', version = version + 1
    where id = p_game_id returning * into g;
  else
    rejected := coalesce(offer->'rejected_by', '[]'::jsonb) || jsonb_build_array(responder.player_index);
    offer := jsonb_set(offer, '{rejected_by}', rejected, true);
    if offer->>'to' is not null then
      nobody_left := true;
    else
      select not exists (
        select 1 from public.game_players gp
        where gp.game_id = p_game_id
          and gp.player_index <> (offer->>'from')::integer
          and not (rejected @> jsonb_build_array(gp.player_index))
      ) into nobody_left;
    end if;

    update public.games
    set state = case when nobody_left
          then state - 'trade_offer' - 'trade_expires_at'
          else jsonb_set(state, '{trade_offer}', offer, true)
        end,
        version = version + 1
    where id = p_game_id returning * into g;
  end if;
  return g;
end;
$$;

-- Alle Bots prüfen ein offenes Angebot der Reihe nach. Der erste strategisch
-- interessierte Bot nimmt an; Ablehnungen werden wie bei Menschen gespeichert.
create or replace function public.resolve_bot_trade_offer(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  offer jsonb;
  source_player public.game_players%rowtype;
  bot public.game_players%rowtype;
  give_resource text;
  want_resource text;
  source_give integer;
  bot_give integer;
  bot_want integer;
  give_target integer;
  want_target integer;
  give_need integer;
  want_need integer;
  accept_trade boolean;
  rejected jsonb;
  decision_message text;
begin
  select * into g from public.games where id = p_game_id for update;
  offer := g.state->'trade_offer';
  if offer is null or offer->>'to' is not null then return g; end if;

  select * into source_player from public.game_players
  where game_id = p_game_id and player_index = (offer->>'from')::integer
  for update;
  if source_player.user_id is distinct from auth.uid() then
    raise exception 'Dieses Handelsangebot gehört nicht zu dir.';
  end if;

  give_resource := offer->>'give';
  want_resource := offer->>'want';
  rejected := coalesce(offer->'rejected_by', '[]'::jsonb);

  for bot in
    select * from public.game_players gp
    where gp.game_id = p_game_id and gp.is_bot
      and gp.player_index <> source_player.player_index
      and not (rejected @> jsonb_build_array(gp.player_index))
    order by gp.player_index
    for update
  loop
    source_give := coalesce((source_player.resources->>give_resource)::integer, 0);
    bot_give := coalesce((bot.resources->>give_resource)::integer, 0);
    bot_want := coalesce((bot.resources->>want_resource)::integer, 0);
    give_target := case give_resource when 'wood' then 2 when 'brick' then 2 when 'wool' then 1 when 'grain' then 2 when 'ore' then 3 else 1 end;
    want_target := case want_resource when 'wood' then 2 when 'brick' then 2 when 'wool' then 1 when 'grain' then 2 when 'ore' then 3 else 1 end;
    give_need := greatest(give_target - bot_give, 0);
    want_need := greatest(want_target - bot_want, 0);
    accept_trade := source_give > 0 and bot_want >= 2 and give_resource <> want_resource
      and (give_need > want_need or (bot_give = 0 and bot_want >= 3));

    if accept_trade then
      update public.game_players set resources = jsonb_set(
        jsonb_set(resources, array[give_resource], to_jsonb(bot_give + 1), true),
        array[want_resource], to_jsonb(bot_want - 1), true
      ) where game_id = p_game_id and player_index = bot.player_index;
      update public.game_players set resources = jsonb_set(
        jsonb_set(resources, array[give_resource], to_jsonb(source_give - 1), true),
        array[want_resource], to_jsonb(coalesce((resources->>want_resource)::integer, 0) + 1), true
      ) where game_id = p_game_id and player_index = source_player.player_index;
      update public.games set state = state - 'trade_offer' - 'trade_expires_at', version = version + 1
      where id = p_game_id returning * into g;
      decision_message := bot.player_name || ' nimmt den Handel an.';
      insert into public.game_activity(game_id,message,kind,created_at)
      values(p_game_id,decision_message,'trade',now())
      on conflict(game_id) do update set message=excluded.message,kind=excluded.kind,created_at=excluded.created_at;
      return g;
    end if;

    rejected := rejected || jsonb_build_array(bot.player_index);
    decision_message := bot.player_name || ' lehnt den Handel ab.';
  end loop;

  offer := jsonb_set(offer, '{rejected_by}', rejected, true);
  update public.games set state = jsonb_set(state, '{trade_offer}', offer, true), version = version + 1
  where id = p_game_id returning * into g;
  if decision_message is not null then
    insert into public.game_activity(game_id,message,kind,created_at)
    values(p_game_id,decision_message,'trade',now())
    on conflict(game_id) do update set message=excluded.message,kind=excluded.kind,created_at=excluded.created_at;
  end if;
  return g;
end;
$$;

revoke all on function public.offer_player_trade(uuid,integer,text,text) from public;
revoke all on function public.respond_player_trade(uuid,boolean) from public;
revoke all on function public.resolve_bot_trade_offer(uuid) from public;
grant execute on function public.offer_player_trade(uuid,integer,text,text) to authenticated;
grant execute on function public.respond_player_trade(uuid,boolean) to authenticated;
grant execute on function public.resolve_bot_trade_offer(uuid) to authenticated;
