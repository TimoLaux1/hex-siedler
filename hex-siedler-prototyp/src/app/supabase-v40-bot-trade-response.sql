-- New Katan v40: Bots beantworten Handelsangebote sofort und nachvollziehbar.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

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
  accept_trade boolean := false;
  decision_message text;
begin
  select * into g from public.games where id = p_game_id for update;
  if g.id is null then raise exception 'Spiel nicht gefunden.'; end if;

  offer := g.state->'trade_offer';
  if offer is null then return g; end if;

  select * into source_player
  from public.game_players
  where game_id = p_game_id and player_index = (offer->>'from')::integer
  for update;

  if source_player.user_id is distinct from auth.uid() then
    raise exception 'Dieses Handelsangebot gehört nicht zu dir.';
  end if;

  select * into bot
  from public.game_players
  where game_id = p_game_id
    and player_index = (offer->>'to')::integer
    and is_bot
  for update;

  -- Angebote an Menschen bleiben offen und werden hier nicht verändert.
  if bot.player_index is null then return g; end if;

  give_resource := offer->>'give';
  want_resource := offer->>'want';
  source_give := coalesce((source_player.resources->>give_resource)::integer, 0);
  bot_give := coalesce((bot.resources->>give_resource)::integer, 0);
  bot_want := coalesce((bot.resources->>want_resource)::integer, 0);

  -- Zielbestände spiegeln die typischen Baukosten wider. Erz und Getreide
  -- sind langfristig wertvoller, Holz/Lehm werden für Straßen benötigt.
  give_target := case give_resource
    when 'wood' then 2 when 'brick' then 2 when 'wool' then 1
    when 'grain' then 2 when 'ore' then 3 else 1 end;
  want_target := case want_resource
    when 'wood' then 2 when 'brick' then 2 when 'wool' then 1
    when 'grain' then 2 when 'ore' then 3 else 1 end;
  give_need := greatest(give_target - bot_give, 0);
  want_need := greatest(want_target - bot_want, 0);

  -- Nur annehmen, wenn beide Seiten liefern können, der Bot mindestens eine
  -- Karte Reserve behält und der erhaltene Rohstoff aktuell nützlicher ist.
  accept_trade := source_give > 0
    and bot_want >= 2
    and give_resource <> want_resource
    and (give_need > want_need or (bot_give = 0 and bot_want >= 3));

  if accept_trade then
    update public.game_players
    set resources = jsonb_set(
      jsonb_set(resources, array[give_resource], to_jsonb(bot_give + 1), true),
      array[want_resource], to_jsonb(bot_want - 1), true
    )
    where game_id = p_game_id and player_index = bot.player_index;

    update public.game_players
    set resources = jsonb_set(
      jsonb_set(resources, array[give_resource], to_jsonb(source_give - 1), true),
      array[want_resource], to_jsonb(coalesce((resources->>want_resource)::integer, 0) + 1), true
    )
    where game_id = p_game_id and player_index = source_player.player_index;

    decision_message := bot.player_name || ' nimmt den Handel an.';
  else
    decision_message := bot.player_name || ' lehnt den Handel ab.';
  end if;

  update public.games
  set state = state - 'trade_offer' - 'trade_expires_at',
      version = version + 1
  where id = p_game_id
  returning * into g;

  insert into public.game_activity(game_id, message, kind, created_at)
  values (p_game_id, decision_message, 'trade', now())
  on conflict (game_id) do update
  set message = excluded.message,
      kind = excluded.kind,
      created_at = excluded.created_at;

  return g;
end;
$$;

revoke all on function public.resolve_bot_trade_offer(uuid) from public;
grant execute on function public.resolve_bot_trade_offer(uuid) to authenticated;
