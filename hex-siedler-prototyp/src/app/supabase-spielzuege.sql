alter table public.game_players
  add column if not exists resources jsonb not null default
    '{"wood":0,"brick":0,"wool":0,"grain":0,"ore":0}'::jsonb,
  add column if not exists victory_points integer not null default 2;

create table if not exists public.board_vertex_tiles (
  vertex_id integer primary key,
  tile_indices integer[] not null
);

insert into public.board_vertex_tiles(vertex_id, tile_indices) values
(0,array[0]),(1,array[0,1]),(2,array[0,1,4]),(3,array[0,3,4]),(4,array[0,3]),(5,array[0]),
(6,array[1]),(7,array[1,2]),(8,array[1,2,5]),(9,array[1,4,5]),(10,array[2]),(11,array[2]),
(12,array[2,6]),(13,array[2,5,6]),(14,array[3,4,8]),(15,array[3,7,8]),(16,array[3,7]),(17,array[3]),
(18,array[4,5,9]),(19,array[4,8,9]),(20,array[5,6,10]),(21,array[5,9,10]),(22,array[6]),
(23,array[6,11]),(24,array[6,10,11]),(25,array[7,8,12]),(26,array[7,12]),(27,array[7]),(28,array[7]),
(29,array[8,9,13]),(30,array[8,12,13]),(31,array[9,10,14]),(32,array[9,13,14]),
(33,array[10,11,15]),(34,array[10,14,15]),(35,array[11]),(36,array[11]),(37,array[11,15]),
(38,array[12,13,16]),(39,array[12,16]),(40,array[12]),(41,array[13,14,17]),(42,array[13,16,17]),
(43,array[14,15,18]),(44,array[14,17,18]),(45,array[15]),(46,array[15,18]),(47,array[16,17]),
(48,array[16]),(49,array[16]),(50,array[17,18]),(51,array[17]),(52,array[18]),(53,array[18])
on conflict (vertex_id) do update set tile_indices = excluded.tile_indices;

create or replace function public.roll_turn_dice(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  my_index integer;
  die_one integer;
  die_two integer;
  rolled integer;
  placed jsonb;
  tile_index integer;
  resource_name text;
  tile_numbers integer[] := array[10,2,9,12,6,4,10,9,11,0,3,8,8,3,4,5,5,6,11];
  tile_resources text[] := array['ore','wool','wood','grain','brick','wool','brick','wood','ore','none','wood','grain','wood','grain','wool','ore','grain','wool','brick'];
begin
  select * into game_row from public.games where id = p_game_id for update;
  select player_index into my_index from public.game_players
    where game_id = p_game_id and user_id = auth.uid();
  if my_index is null then raise exception 'Du gehörst nicht zu diesem Spiel'; end if;
  if game_row.status <> 'playing' or game_row.state->>'phase' <> 'turn'
    then raise exception 'Die reguläre Spielrunde ist noch nicht bereit'; end if;
  if (game_row.state->>'active_player')::integer <> my_index
    then raise exception 'Ein anderer Spieler ist am Zug'; end if;
  if game_row.state ? 'dice' then raise exception 'Du hast in diesem Zug bereits gewürfelt'; end if;

  die_one := floor(random() * 6 + 1)::integer;
  die_two := floor(random() * 6 + 1)::integer;
  rolled := die_one + die_two;

  if rolled <> 7 then
    for placed in select value from jsonb_array_elements(game_row.state->'settlements') loop
      for tile_index in
        select unnest(tile_indices) from public.board_vertex_tiles
        where vertex_id = (placed->>'vertex')::integer
      loop
        if tile_numbers[tile_index + 1] = rolled then
          resource_name := tile_resources[tile_index + 1];
          if resource_name <> 'none' then
            update public.game_players
            set resources = jsonb_set(
              resources,
              array[resource_name],
              to_jsonb(coalesce((resources->>resource_name)::integer, 0) + 1)
            )
            where game_id = p_game_id and player_index = (placed->>'player')::integer;
          end if;
        end if;
      end loop;
    end loop;
  end if;

  update public.games
  set version = version + 1,
      state = jsonb_set(
        jsonb_set(state, '{dice}', jsonb_build_array(die_one, die_two)),
        '{phase}', to_jsonb(case when rolled = 7 then 'robber' else 'build' end)
      )
  where id = p_game_id returning * into game_row;
  return game_row;
end;
$$;

create or replace function public.end_player_turn(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  game_row public.games;
  my_index integer;
  next_index integer;
begin
  select * into game_row from public.games where id = p_game_id for update;
  select player_index into my_index from public.game_players
    where game_id = p_game_id and user_id = auth.uid();
  if my_index is null or (game_row.state->>'active_player')::integer <> my_index
    then raise exception 'Du bist nicht am Zug'; end if;
  if game_row.state->>'phase' not in ('build','robber')
    then raise exception 'Du musst zuerst würfeln'; end if;

  select min(player_index) into next_index from public.game_players
    where game_id = p_game_id and player_index > my_index;
  if next_index is null then
    select min(player_index) into next_index from public.game_players where game_id = p_game_id;
  end if;

  update public.games
  set version = version + 1,
      state = jsonb_set(
        jsonb_set(state - 'dice', '{active_player}', to_jsonb(next_index)),
        '{phase}', '"turn"'::jsonb
      ) || case when next_index <= my_index
           then jsonb_build_object('round', coalesce((state->>'round')::integer, 1) + 1)
           else '{}'::jsonb end
  where id = p_game_id returning * into game_row;
  return game_row;
end;
$$;

grant execute on function public.roll_turn_dice(uuid) to authenticated;
grant execute on function public.end_player_turn(uuid) to authenticated;
