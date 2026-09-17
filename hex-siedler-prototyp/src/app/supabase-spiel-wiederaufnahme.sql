create or replace function public.resume_my_game_room(p_join_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resumed_game jsonb;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  select to_jsonb(g)
  into resumed_game
  from public.games g
  inner join public.game_players gp on gp.game_id = g.id
  where gp.user_id = auth.uid()
    and g.status in ('waiting', 'playing')
    and (
      p_join_code is null
      or trim(p_join_code) = ''
      or g.join_code = upper(trim(p_join_code))
    )
  order by
    case when p_join_code is not null and g.join_code = upper(trim(p_join_code)) then 0 else 1 end,
    case when g.status = 'playing' then 0 else 1 end
  limit 1;

  return resumed_game;
end;
$$;

revoke all on function public.resume_my_game_room(text) from public;
grant execute on function public.resume_my_game_room(text) to authenticated;

-- Ein bereits eingetragener Spieler darf auch nach Spielstart wieder auf
-- seinen ursprünglichen Platz. Neue Spieler dürfen weiterhin nur der Lobby
-- beitreten, solange das Spiel auf "waiting" steht.
create or replace function public.join_game_room(p_join_code text, p_player_name text)
returns table(game_id uuid, player_index integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_game uuid;
  existing_index integer;
  next_index integer;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if char_length(trim(p_player_name)) not between 1 and 24 then raise exception 'Ungültiger Spielername'; end if;

  select g.id, gp.player_index
  into found_game, existing_index
  from public.games g
  inner join public.game_players gp on gp.game_id = g.id
  where g.join_code = upper(trim(p_join_code))
    and gp.user_id = auth.uid()
    and g.status in ('waiting', 'playing')
  limit 1;

  if found_game is not null then
    return query select found_game, existing_index;
    return;
  end if;

  select g.id
  into found_game
  from public.games g
  where g.join_code = upper(trim(p_join_code))
    and g.status = 'waiting'
  for update;

  if found_game is null then raise exception 'Spielraum nicht gefunden'; end if;

  select count(*)::integer
  into next_index
  from public.game_players gp
  where gp.game_id = found_game;

  if next_index >= 4 then raise exception 'Spielraum ist voll'; end if;

  insert into public.game_players(game_id, user_id, player_name, player_index, color)
  values (found_game, auth.uid(), trim(p_player_name), next_index, array['blue','coral','gold','green'][next_index + 1]);

  return query select found_game, next_index;
end;
$$;

revoke all on function public.join_game_room(text, text) from public;
grant execute on function public.join_game_room(text, text) to authenticated;
