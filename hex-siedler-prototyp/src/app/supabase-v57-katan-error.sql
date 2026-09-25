-- New Katan v57: Rename the second bot consistently in existing rooms and
-- in the server-side bot creation function.

update public.game_players
set player_name = 'Katan.error'
where is_bot and player_name in ('CatanGPT', 'KatanGPT');

create or replace function public.add_game_bot(p_game_id uuid)
returns public.games language plpgsql security definer set search_path=public
as $$
declare g public.games; next_index integer; bot_number integer;
begin
  select * into g from public.games where id=p_game_id for update;
  if g.id is null or g.created_by<>auth.uid() then raise exception 'Nur der Host kann Bots hinzufügen'; end if;
  if g.status<>'waiting' then raise exception 'Bots können nur in der Lobby hinzugefügt werden'; end if;
  if (select count(*) from public.game_players where game_id=p_game_id)>=4 then raise exception 'Spielraum ist voll'; end if;
  select count(*)::integer into bot_number from public.game_players where game_id=p_game_id and is_bot;
  if bot_number>=2 then raise exception 'Maximal zwei Bots sind erlaubt'; end if;
  select slot into next_index
  from generate_series(0,3) slot
  where not exists(select 1 from public.game_players p where p.game_id=p_game_id and p.player_index=slot)
  order by slot limit 1;
  insert into public.game_players(game_id,user_id,player_name,player_index,color,is_bot)
  values(
    p_game_id,
    null,
    (array['Settler.exe','Katan.error'])[bot_number+1],
    next_index,
    (array['blue','coral','gold','green'])[next_index+1],
    true
  );
  return g;
end; $$;
