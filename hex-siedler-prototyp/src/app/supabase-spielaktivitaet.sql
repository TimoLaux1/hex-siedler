-- Synchronisierte Meldungen für die obere Spielleiste.
-- Diese Datei einmal vollständig im Supabase SQL Editor ausführen.

create table if not exists public.game_activity (
  game_id uuid primary key references public.games(id) on delete cascade,
  message text not null,
  kind text not null default 'info' check (kind in ('info','turn','dice','build','trade','klaus','win')),
  created_at timestamptz not null default now()
);

alter table public.game_activity enable row level security;

drop policy if exists "Players can read their game activity" on public.game_activity;
create policy "Players can read their game activity"
on public.game_activity for select
to authenticated
using (
  exists (
    select 1 from public.game_players gp
    where gp.game_id = game_activity.game_id
      and gp.user_id = auth.uid()
  )
);

create or replace function public.record_game_activity(
  p_game_id uuid,
  p_action text,
  p_detail text default null
)
returns table(message text, kind text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_message text;
  v_kind text;
  v_created_at timestamptz := now();
begin
  select gp.player_name into v_name
  from public.game_players gp
  where gp.game_id = p_game_id and gp.user_id = auth.uid();

  if v_name is null then
    raise exception 'Du bist kein Spieler in diesem Raum.';
  end if;

  v_kind := case
    when p_action = 'dice' then 'dice'
    when p_action in ('road','settlement','city','goldmine','goldmine_resource') then 'build'
    when p_action in ('bank_trade','trade_offer','trade_accept','trade_reject') then 'trade'
    when p_action in ('klaus','klaus_card','robber','discard') then 'klaus'
    when p_action = 'win' then 'win'
    when p_action in ('start','turn','end_turn') then 'turn'
    else 'info'
  end;

  v_message := case p_action
    when 'start' then v_name || ' startet das Spiel.'
    when 'turn' then coalesce(nullif(p_detail,''),v_name) || ' ist am Zug.'
    when 'dice' then v_name || ' würfelt' || case when p_detail is not null then ' eine ' || p_detail else '' end || '.'
    when 'road' then v_name || ' baut eine Straße.'
    when 'settlement' then v_name || ' baut eine Siedlung.'
    when 'city' then v_name || ' baut eine Stadt.'
    when 'goldmine' then v_name || ' baut eine Goldmine.'
    when 'goldmine_resource' then v_name || ' wählt einen Goldminen-Rohstoff.'
    when 'robber' then v_name || ' versetzt den Ritter.'
    when 'bank_trade' then v_name || ' handelt mit dem Vorrat.'
    when 'trade_offer' then v_name || ' bietet einen Handel an.'
    when 'trade_accept' then v_name || ' nimmt den Handel an.'
    when 'trade_reject' then v_name || ' lehnt den Handel ab.'
    when 'discard' then v_name || ' gibt einen Rohstoff ab.'
    when 'end_turn' then v_name || ' beendet den Zug.'
    when 'klaus' then v_name || ' ruft Klaus.'
    when 'klaus_card' then v_name || ' spielt „' || coalesce(nullif(p_detail,''),'eine Klaus-Karte') || '“.'
    when 'win' then v_name || ' gewinnt das Spiel.'
    else v_name || ' ist am Zug.'
  end;

  insert into public.game_activity(game_id,message,kind,created_at)
  values (p_game_id,v_message,v_kind,v_created_at)
  on conflict (game_id) do update
    set message = excluded.message,
        kind = excluded.kind,
        created_at = excluded.created_at;

  return query select v_message,v_kind,v_created_at;
end;
$$;

revoke all on function public.record_game_activity(uuid,text,text) from public;
grant execute on function public.record_game_activity(uuid,text,text) to authenticated;
grant select on public.game_activity to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_activity'
  ) then
    alter publication supabase_realtime add table public.game_activity;
  end if;
end $$;
