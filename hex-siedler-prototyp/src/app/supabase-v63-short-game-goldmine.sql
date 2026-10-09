-- Goldminen-Freischaltung passend zur Spiellaenge:
--   7-10 SP: ab 5 Siegpunkten
--   11-15 SP: weiterhin ab 8 Siegpunkten
--
-- Die Freischaltung wird dauerhaft im Spielzustand gespeichert. Zwei Trigger
-- decken sowohl direkte Punkte-Aenderungen als auch nachfolgende State-Updates
-- in Spieler- und Bot-RPCs ab.

create or replace function public.ensure_game_goldmine_unlock()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  unlock_at integer:=case
    when coalesce(new.victory_target,10) between 7 and 10 then 5
    else 8
  end;
begin
  if coalesce((new.state->>'goldmine_unlocked')::boolean,false) then
    return new;
  end if;

  if exists(
    select 1
    from public.game_players
    where game_id=new.id
      and coalesce(victory_points,0)>=unlock_at
  ) then
    new.state:=jsonb_set(
      coalesce(new.state,'{}'::jsonb),
      '{goldmine_unlocked}',
      'true'::jsonb,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_game_goldmine_unlock on public.games;
create trigger ensure_game_goldmine_unlock
before insert or update of state,victory_target on public.games
for each row execute function public.ensure_game_goldmine_unlock();

create or replace function public.unlock_goldmine_after_points_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target integer;
  unlock_at integer;
begin
  select coalesce(victory_target,10)
  into target
  from public.games
  where id=new.game_id;

  unlock_at:=case when target between 7 and 10 then 5 else 8 end;

  if coalesce(new.victory_points,0)>=unlock_at then
    update public.games
    set state=jsonb_set(
          coalesce(state,'{}'::jsonb),
          '{goldmine_unlocked}',
          'true'::jsonb,
          true
        ),
        version=coalesce(version,0)+1
    where id=new.game_id
      and not coalesce((state->>'goldmine_unlocked')::boolean,false);
  end if;

  return new;
end;
$$;

drop trigger if exists unlock_goldmine_after_points_change on public.game_players;
create trigger unlock_goldmine_after_points_change
after insert or update of victory_points on public.game_players
for each row execute function public.unlock_goldmine_after_points_change();

-- Bereits laufende Partien werden ebenfalls korrigiert.
update public.games game
set state=jsonb_set(
      coalesce(game.state,'{}'::jsonb),
      '{goldmine_unlocked}',
      'true'::jsonb,
      true
    ),
    version=coalesce(game.version,0)+1
where not coalesce((game.state->>'goldmine_unlocked')::boolean,false)
  and exists(
    select 1
    from public.game_players player
    where player.game_id=game.id
      and coalesce(player.victory_points,0)>=case
        when coalesce(game.victory_target,10) between 7 and 10 then 5
        else 8
      end
  );
