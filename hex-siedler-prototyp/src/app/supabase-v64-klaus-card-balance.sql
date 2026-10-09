-- Neue Klaus-Karten werden leicht zugunsten des Boesen Klaus gewichtet.
-- Die bisherige Ziehung liefert etwa 20 % Enttaeuschte und 40 % Boese Klaus.
-- Ein Viertel der gezogenen Enttaeuschten Klaus wird deshalb in einen Boesen
-- Klaus umgewandelt: effektiv etwa 15 % Enttaeuschte und 45 % Boese Klaus.
-- Das gilt einheitlich fuer menschliche Spieler und Bots.

create or replace function public.rebalance_new_klaus_card()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.card_type='disappointed' and random()<0.25 then
    new.card_type:='angry';
  end if;

  return new;
end;
$$;

drop trigger if exists rebalance_new_klaus_card on public.game_cards;
create trigger rebalance_new_klaus_card
before insert on public.game_cards
for each row execute function public.rebalance_new_klaus_card();
