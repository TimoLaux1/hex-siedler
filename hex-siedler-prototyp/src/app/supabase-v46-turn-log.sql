-- New Katan v46: Zuverlaessiges Zugprotokoll fuer Menschen und Bots.
-- Diese Datei einmal vollstaendig im Supabase SQL Editor ausfuehren.

create or replace function public.append_game_turn_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_log jsonb := coalesce(new.state->'turn_log', '[]'::jsonb);
  v_entry jsonb;
begin
  -- Nur der Beginn eines regulaeren Zuges wird protokolliert. Einzelne
  -- Aktionen eines Bots (Wuerfeln, Bauen, Handeln) erzeugen keinen Doppelzug.
  if new.status in ('playing', 'finished')
     and coalesce(new.state->>'phase', '') = 'turn'
     and new.state ? 'active_player'
     and (
       old.state->>'active_player' is distinct from new.state->>'active_player'
       or coalesce(old.state->>'phase', '') <> 'turn'
     ) then
    if jsonb_array_length(v_log) >= 20 then
      v_log := v_log - 0;
    end if;

    v_entry := jsonb_build_object(
      'player', (new.state->>'active_player')::integer,
      'round', coalesce((new.state->>'round')::integer, 1),
      'at', clock_timestamp()
    );
    new.state := jsonb_set(new.state, '{turn_log}', v_log || jsonb_build_array(v_entry), true);
  end if;

  return new;
end;
$$;

drop trigger if exists games_append_turn_log on public.games;
create trigger games_append_turn_log
before update of state, status on public.games
for each row execute function public.append_game_turn_log();

-- Den aktuell laufenden Zug beim Installieren einmalig aufnehmen.
update public.games
set state = jsonb_set(
  state,
  '{turn_log}',
  jsonb_build_array(jsonb_build_object(
    'player', (state->>'active_player')::integer,
    'round', coalesce((state->>'round')::integer, 1),
    'at', clock_timestamp()
  )),
  true
)
where status = 'playing'
  and state ? 'active_player'
  and not (state ? 'turn_log');

revoke all on function public.append_game_turn_log() from public;
