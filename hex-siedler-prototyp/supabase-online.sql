create or replace function public.create_game_room(p_player_name text)
returns table(game_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_game_id uuid;
  new_code text;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if char_length(trim(p_player_name)) not between 1 and 24 then raise exception 'Ungültiger Spielername'; end if;
  loop
    new_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from public.games where games.join_code = new_code);
  end loop;
  insert into public.games(join_code, created_by, state)
  values (new_code, auth.uid(), jsonb_build_object('round', 1, 'active_player', 0))
  returning id into new_game_id;
  insert into public.game_players(game_id, user_id, player_name, player_index, color)
  values (new_game_id, auth.uid(), trim(p_player_name), 0, 'blue');
  return query select new_game_id, new_code;
end;
$$;

create or replace function public.join_game_room(p_join_code text, p_player_name text)
returns table(game_id uuid, player_index integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_game uuid;
  next_index integer;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if char_length(trim(p_player_name)) not between 1 and 24 then raise exception 'Ungültiger Spielername'; end if;
  select id into found_game from public.games
  where join_code = upper(trim(p_join_code)) and status = 'waiting'
  for update;
  if found_game is null then raise exception 'Spielraum nicht gefunden'; end if;
  select game_players.player_index into next_index from public.game_players
  where game_players.game_id = found_game and user_id = auth.uid();
  if next_index is null then
    select count(*)::integer into next_index from public.game_players where game_players.game_id = found_game;
    if next_index >= 4 then raise exception 'Spielraum ist voll'; end if;
    insert into public.game_players(game_id, user_id, player_name, player_index, color)
    values (found_game, auth.uid(), trim(p_player_name), next_index, array['blue','coral','gold','green'][next_index + 1]);
  end if;
  return query select found_game, next_index;
end;
$$;

grant execute on function public.create_game_room(text) to authenticated;
grant execute on function public.join_game_room(text, text) to authenticated;
alter publication supabase_realtime add table public.game_players;
