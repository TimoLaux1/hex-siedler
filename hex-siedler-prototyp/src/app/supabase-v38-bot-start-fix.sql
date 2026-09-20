-- New Katan v38: Bot startet auch mit aelteren run_game_bot-Versionen.
-- Diese Datei EINMAL komplett im Supabase SQL Editor ausfuehren.

create or replace function public.run_game_bot_until_human(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games;
  previous_version bigint;
  acting_player integer;
  acting_is_bot boolean;
  bot_must_discard boolean;
  bot_receives_trade boolean;
  bot_sent_trade boolean;
  step integer;
begin
  if not exists (
    select 1
    from public.game_players
    where game_id = p_game_id
      and user_id = auth.uid()
  ) then
    raise exception 'Du gehoerst nicht zu diesem Spiel';
  end if;

  for step in 1..64 loop
    select * into g
    from public.games
    where id = p_game_id;

    exit when g.id is null;
    exit when g.status not in ('setup', 'playing');

    if coalesce(g.state->>'phase', '') in ('setup_settlement', 'setup_road') then
      acting_player := coalesce(
        (g.state->'setup_order'->>coalesce((g.state->>'setup_step')::integer, 0))::integer,
        -1
      );

      -- Kompatibilitaet mit alten Bot-RPCs: Dort wurde in der Aufbauphase
      -- irrtuemlich active_player verwendet und status='playing' verlangt.
      update public.games
      set status = 'playing',
          state = jsonb_set(state, '{active_player}', to_jsonb(acting_player), true)
      where id = p_game_id
        and (
          status is distinct from 'playing'
          or coalesce((state->>'active_player')::integer, -1) <> acting_player
        )
      returning * into g;
    else
      acting_player := coalesce((g.state->>'active_player')::integer, -1);
    end if;

    select exists (
      select 1 from public.game_players
      where game_id = p_game_id
        and player_index = acting_player
        and is_bot
    ) into acting_is_bot;

    select exists (
      select 1
      from jsonb_array_elements(coalesce(g.state->'discard_queue', '[]'::jsonb)) q
      join public.game_players p
        on p.game_id = p_game_id
       and p.player_index = (q->>'player')::integer
       and p.is_bot
    ) into bot_must_discard;

    select exists (
      select 1 from public.game_players p
      where p.game_id = p_game_id
        and p.is_bot
        and p.player_index = coalesce((g.state->'trade_offer'->>'to')::integer, -1)
    ) into bot_receives_trade;

    select exists (
      select 1 from public.game_players p
      where p.game_id = p_game_id
        and p.is_bot
        and p.player_index = coalesce((g.state->'trade_offer'->>'from')::integer, -1)
    ) into bot_sent_trade;

    exit when bot_sent_trade;
    exit when not acting_is_bot and not bot_must_discard and not bot_receives_trade;

    previous_version := g.version;
    select * into g from public.run_game_bot(p_game_id);
    exit when g.version = previous_version;
  end loop;

  select * into g from public.games where id = p_game_id;
  return g;
end;
$$;

revoke all on function public.run_game_bot_until_human(uuid) from public;
grant execute on function public.run_game_bot_until_human(uuid) to authenticated;

-- Kontrolle: muss genau eine Zeile mit dem Funktionsnamen liefern.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'run_game_bot_until_human';
