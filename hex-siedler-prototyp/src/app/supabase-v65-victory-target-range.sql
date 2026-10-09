-- Allow the full victory target cycle offered by the lobby (7 through 15).
alter table public.games
  drop constraint if exists games_victory_target_check;

alter table public.games
  add constraint games_victory_target_check
  check (victory_target between 7 and 15);
