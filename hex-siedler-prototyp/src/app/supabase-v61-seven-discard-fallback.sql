-- Zweite Absicherungsstufe für eine 7: Sobald die Abgabefrist abgelaufen ist,
-- darf jeder Spieler im Raum alle noch offenen Abgaben serverseitig abschließen.
-- Dadurch kann kein abwesender oder getrennter Client die Partie blockieren.

create or replace function public.complete_expired_seven_discard(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  queued_player public.game_players%rowtype;
  queue_entry jsonb;
  remaining_to_discard integer;
  discard_step integer;
  selected_resource text;
  deadline timestamptz;
begin
  select * into g
  from public.games
  where id = p_game_id
  for update;

  if g.id is null then
    raise exception 'Spiel nicht gefunden.';
  end if;

  if not exists (
    select 1
    from public.game_players
    where game_id = p_game_id and user_id = auth.uid()
  ) then
    raise exception 'Du bist kein Spieler in diesem Raum.';
  end if;

  if coalesce(g.state->>'phase', '') <> 'discard' then
    return g;
  end if;

  deadline := coalesce(
    nullif(g.state->>'discard_deadline', '')::timestamptz,
    now() - interval '2 seconds'
  );

  if now() < deadline + interval '1 second' then
    raise exception 'Die automatische Abschlussstufe ist noch nicht bereit.';
  end if;

  for queue_entry in
    select entry
    from jsonb_array_elements(coalesce(g.state->'discard_queue', '[]'::jsonb)) entry
  loop
    select * into queued_player
    from public.game_players
    where game_id = p_game_id
      and player_index = (queue_entry->>'player')::integer
    for update;

    if queued_player.player_index is null then
      continue;
    end if;

    remaining_to_discard := greatest(coalesce((queue_entry->>'remaining')::integer, 0), 0);

    for discard_step in 1..remaining_to_discard loop
      selected_resource := null;

      select resource.key into selected_resource
      from jsonb_each_text(queued_player.resources) resource
      where resource.key in ('wood','brick','wool','grain','ore')
        and resource.value::integer > 0
      order by random()
      limit 1;

      exit when selected_resource is null;

      queued_player.resources := jsonb_set(
        queued_player.resources,
        array[selected_resource],
        to_jsonb((queued_player.resources->>selected_resource)::integer - 1),
        true
      );
    end loop;

    update public.game_players
    set resources = queued_player.resources
    where game_id = p_game_id
      and player_index = queued_player.player_index;
  end loop;

  update public.games
  set state = jsonb_set(
        state - 'discard_queue' - 'discard_deadline',
        '{phase}',
        '"robber"'::jsonb,
        true
      ),
      version = version + 1
  where id = p_game_id
  returning * into g;

  return g;
end;
$$;

revoke all on function public.complete_expired_seven_discard(uuid) from public;
grant execute on function public.complete_expired_seven_discard(uuid) to authenticated;
