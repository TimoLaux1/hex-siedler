-- v55: Eine normale 7 vergibt keinen Ritterpunkt.
-- Nach dem Versetzen des Räubers bleibt die Phase "build", sodass der
-- aktive Spieler seinen Zug wie gewohnt fortsetzen kann.
-- "Böser Klaus" behält seine Rittervergabe unverändert.

do $$
declare
  function_definition text;
  corrected_definition text;
  regular_knight_update text :=
    'update[[:space:]]+public\.game_players[[:space:]]+set[[:space:]]+knight_points[[:space:]]*=[[:space:]]*coalesce\(knight_points[[:space:]]*,[[:space:]]*0\)[[:space:]]*\+[[:space:]]*1[[:space:]]+where[[:space:]]+game_id[[:space:]]*=[[:space:]]*p_game_id[[:space:]]+and[[:space:]]+player_index[[:space:]]*=[[:space:]]*(my_index|bot_index)[[:space:]]*;';
begin
  if to_regprocedure('public.move_turn_robber(uuid,integer,integer)') is null then
    raise exception 'move_turn_robber(uuid,integer,integer) wurde nicht gefunden';
  end if;

  select pg_get_functiondef(to_regprocedure('public.move_turn_robber(uuid,integer,integer)'))
  into function_definition;
  corrected_definition := regexp_replace(function_definition, regular_knight_update, '', 'i');
  if corrected_definition = function_definition then
    raise exception 'Die Rittervergabe in move_turn_robber konnte nicht eindeutig entfernt werden';
  end if;
  execute corrected_definition;

  if to_regprocedure('public.run_game_bot(uuid)') is null then
    raise exception 'run_game_bot(uuid) wurde nicht gefunden';
  end if;

  select pg_get_functiondef(to_regprocedure('public.run_game_bot(uuid)'))
  into function_definition;
  -- Der erste Treffer gehört zum normalen Räuberschritt nach einer 7.
  -- Der zweite Treffer in der Funktion gehört zu "Böser Klaus" und bleibt bestehen.
  corrected_definition := regexp_replace(function_definition, regular_knight_update, '', 'i');
  if corrected_definition = function_definition then
    raise exception 'Die reguläre Rittervergabe in run_game_bot konnte nicht eindeutig entfernt werden';
  end if;
  execute corrected_definition;
end;
$$;
