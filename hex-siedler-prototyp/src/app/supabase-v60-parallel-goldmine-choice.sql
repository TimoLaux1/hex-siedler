-- Goldminen-Auswahlen nach einer 7 laufen parallel.
-- Jeder Spieler mit mindestens einem offenen Eintrag darf sofort wählen;
-- pro Auswahl wird genau ein eigener Queue-Eintrag verbraucht.

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
  my_first_queue_position bigint;
  remaining_queue jsonb;
  new_state jsonb;
begin
  select * into game_row
  from public.games
  where id = p_game_id
  for update;

  select player_index into my_index
  from public.game_players
  where game_id = p_game_id and user_id = auth.uid();

  if my_index is null then
    raise exception 'Du gehörst nicht zu diesem Spiel';
  end if;
  if game_row.state->>'phase' <> 'goldmine' then
    raise exception 'Keine Goldmine wartet auf eine Auswahl';
  end if;
  if p_resource not in ('wood','brick','wool','grain','ore') then
    raise exception 'Wähle einen gültigen Rohstoff';
  end if;

  select min(queue_item.ordinality)
  into my_first_queue_position
  from jsonb_array_elements(coalesce(game_row.state->'goldmine_queue','[]'::jsonb))
    with ordinality as queue_item(value, ordinality)
  where queue_item.value::text::integer = my_index;

  if my_first_queue_position is null then
    raise exception 'Für deine Goldmine ist keine Auswahl offen';
  end if;

  update public.game_players
  set resources = jsonb_set(
    resources,
    array[p_resource],
    to_jsonb(coalesce((resources->>p_resource)::integer,0)+1)
  )
  where game_id = p_game_id and player_index = my_index;

  select coalesce(jsonb_agg(queue_item.value order by queue_item.ordinality),'[]'::jsonb)
  into remaining_queue
  from jsonb_array_elements(coalesce(game_row.state->'goldmine_queue','[]'::jsonb))
    with ordinality as queue_item(value, ordinality)
  where queue_item.ordinality <> my_first_queue_position;

  new_state := game_row.state;
  if jsonb_array_length(remaining_queue) > 0 then
    new_state := jsonb_set(new_state,'{goldmine_queue}',remaining_queue);
  else
    -- Erst wenn alle betroffenen Spieler gewählt haben, geht der Zug weiter.
    new_state := jsonb_set(
      new_state - 'robber_roller' - 'goldmine_queue',
      '{phase}',
      '"build"'::jsonb
    );
  end if;

  update public.games
  set state = new_state, version = version + 1
  where id = p_game_id
  returning * into game_row;

  return game_row;
end;
$$;

revoke all on function public.choose_goldmine_resource(uuid,text) from public;
grant execute on function public.choose_goldmine_resource(uuid,text) to authenticated;
