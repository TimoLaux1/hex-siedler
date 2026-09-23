-- New Katan v54: Bots nutzen Sneaky Klaus nur fuer eine Siedlung,
-- die genau eine Strasse von einer vorhandenen Siedlung entfernt liegt.
-- Einmal vollstaendig im Supabase SQL Editor ausfuehren.

do $migration$
declare
  function_definition text;
  old_condition text := $old$
          and not exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=candidate.vertex_id or (b->>'vertex')::integer=any(candidate.neighbor_vertices))
$old$;
  new_condition text := $new$
          and not exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=candidate.vertex_id)
          and exists(select 1 from jsonb_array_elements(coalesce(g.state->'settlements','[]'::jsonb)) b where (b->>'vertex')::integer=any(candidate.neighbor_vertices))
$new$;
begin
  select pg_get_functiondef('public.run_game_bot(uuid)'::regprocedure)
  into function_definition;

  if position(old_condition in function_definition)=0 then
    raise exception 'Die erwartete Sneaky-Klaus-Bedingung wurde in run_game_bot(uuid) nicht gefunden.';
  end if;

  function_definition:=replace(function_definition,old_condition,new_condition);
  execute function_definition;
end;
$migration$;
