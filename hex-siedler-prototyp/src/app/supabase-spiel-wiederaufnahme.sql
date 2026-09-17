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
