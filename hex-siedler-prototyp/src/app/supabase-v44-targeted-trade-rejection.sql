-- New Katan v44: Gezielte Angebote nach einer Ablehnung sofort schließen.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

create or replace function public.respond_player_trade(p_game_id uuid, p_accept boolean)
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
  if coalesce(offer->'rejected_by','[]'::jsonb) @> jsonb_build_array(responder.player_index) then
    raise exception 'Du hast dieses Angebot bereits abgelehnt.';
  end if;

  give_resource := offer->>'give';
  want_resource := offer->>'want';

  if p_accept then
    select * into source_player from public.game_players
    where game_id = p_game_id and player_index = (offer->>'from')::integer
    for update;
    if coalesce((source_player.resources->>give_resource)::integer,0) < 1 then
      raise exception 'Der angebotene Rohstoff ist nicht mehr verfügbar.';
    end if;
    if coalesce((responder.resources->>want_resource)::integer,0) < 1 then
      raise exception 'Du besitzt den gewünschten Rohstoff nicht.';
    end if;

    update public.game_players set resources = jsonb_set(
      jsonb_set(resources,array[give_resource],to_jsonb((resources->>give_resource)::integer-1),true),
      array[want_resource],to_jsonb(coalesce((resources->>want_resource)::integer,0)+1),true
    ) where game_id=p_game_id and player_index=source_player.player_index;

    update public.game_players set resources = jsonb_set(
      jsonb_set(resources,array[want_resource],to_jsonb((resources->>want_resource)::integer-1),true),
      array[give_resource],to_jsonb(coalesce((resources->>give_resource)::integer,0)+1),true
    ) where game_id=p_game_id and player_index=responder.player_index;

    update public.games
    set state=state-'trade_offer'-'trade_expires_at',version=version+1
    where id=p_game_id returning * into g;
  else
    rejected := coalesce(offer->'rejected_by','[]'::jsonb)||jsonb_build_array(responder.player_index);
    offer := jsonb_set(offer,'{rejected_by}',rejected,true);

    -- Ein gezieltes Angebot kann nach Ablehnung niemand anderes annehmen.
    if offer->>'to' is not null then
      nobody_left := true;
    else
      select not exists(
        select 1 from public.game_players gp
        where gp.game_id=p_game_id
          and gp.player_index<>(offer->>'from')::integer
          and not(rejected @> jsonb_build_array(gp.player_index))
      ) into nobody_left;
    end if;

    update public.games
    set state=case when nobody_left
          then state-'trade_offer'-'trade_expires_at'
          else jsonb_set(state,'{trade_offer}',offer,true)
        end,
        version=version+1
    where id=p_game_id returning * into g;
  end if;
  return g;
end;
$$;

revoke all on function public.respond_player_trade(uuid,boolean) from public;
grant execute on function public.respond_player_trade(uuid,boolean) to authenticated;

-- Bereits festhängende gezielte Angebote, die abgelehnt wurden, aufräumen.
update public.games g
set state=g.state-'trade_offer'-'trade_expires_at',version=g.version+1
where g.state ? 'trade_offer'
  and g.state->'trade_offer'->>'to' is not null
  and coalesce(g.state->'trade_offer'->'rejected_by','[]'::jsonb)
      @> jsonb_build_array((g.state->'trade_offer'->>'to')::integer);
