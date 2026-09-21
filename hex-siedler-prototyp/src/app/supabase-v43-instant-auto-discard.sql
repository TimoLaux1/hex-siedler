-- New Katan v43: Karten bei Ablauf des 7er-Timers in einem Aufruf abgeben.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

-- Neue 7er-Abgabephasen erhalten eine serverseitige, für alle Geräte identische
-- Frist. Beim Verlassen der Phase wird die Frist wieder entfernt.
create or replace function public.set_discard_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.state->>'phase', '') = 'discard'
     and coalesce(old.state->>'phase', '') <> 'discard'
     and not (new.state ? 'discard_deadline') then
    new.state := jsonb_set(
      new.state,
      '{discard_deadline}',
      to_jsonb(now() + interval '10 seconds'),
      true
    );
  elsif coalesce(new.state->>'phase', '') <> 'discard'
        and new.state ? 'discard_deadline' then
    new.state := new.state - 'discard_deadline';
  end if;
  return new;
end;
$$;

drop trigger if exists set_discard_deadline_trigger on public.games;
create trigger set_discard_deadline_trigger
before update on public.games
for each row execute function public.set_discard_deadline();

create or replace function public.auto_discard_seven_resources(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  me public.game_players%rowtype;
  queue_entry jsonb;
  remaining_to_discard integer;
  selected_resource text;
  updated_queue jsonb;
  deadline timestamptz;
begin
  select * into g
  from public.games
  where id = p_game_id
  for update;

  if g.id is null then raise exception 'Spiel nicht gefunden.'; end if;
  if coalesce(g.state->>'phase', '') <> 'discard' then return g; end if;

  select * into me
  from public.game_players
  where game_id = p_game_id and user_id = auth.uid()
  for update;

  if me.player_index is null then
    raise exception 'Du bist kein Spieler in diesem Raum.';
  end if;

  select entry into queue_entry
  from jsonb_array_elements(coalesce(g.state->'discard_queue', '[]'::jsonb)) entry
  where (entry->>'player')::integer = me.player_index
  limit 1;

  if queue_entry is null then return g; end if;

  deadline := coalesce(
    nullif(g.state->>'discard_deadline', '')::timestamptz,
    now() - interval '1 second'
  );
  if now() < deadline then
    raise exception 'Die Abgabezeit ist noch nicht abgelaufen.';
  end if;

  remaining_to_discard := greatest((queue_entry->>'remaining')::integer, 0);

  for discard_step in 1..remaining_to_discard loop
    select resource.key into selected_resource
    from jsonb_each_text(me.resources) resource
    where resource.key in ('wood','brick','wool','grain','ore')
      and resource.value::integer > 0
    order by random()
    limit 1;

    exit when selected_resource is null;

    me.resources := jsonb_set(
      me.resources,
      array[selected_resource],
      to_jsonb((me.resources->>selected_resource)::integer - 1),
      true
    );
  end loop;

  update public.game_players
  set resources = me.resources
  where game_id = p_game_id and player_index = me.player_index;

  select coalesce(jsonb_agg(entry order by position), '[]'::jsonb)
  into updated_queue
  from jsonb_array_elements(coalesce(g.state->'discard_queue', '[]'::jsonb))
       with ordinality as queued(entry, position)
  where (entry->>'player')::integer <> me.player_index;

  update public.games
  set state = case
        when jsonb_array_length(updated_queue) = 0 then
          jsonb_set(
            state - 'discard_queue' - 'discard_deadline',
            '{phase}',
            '"robber"'::jsonb,
            true
          )
        else
          jsonb_set(state, '{discard_queue}', updated_queue, true)
      end,
      version = version + 1
  where id = p_game_id
  returning * into g;

  return g;
end;
$$;

revoke all on function public.auto_discard_seven_resources(uuid) from public;
grant execute on function public.auto_discard_seven_resources(uuid) to authenticated;
