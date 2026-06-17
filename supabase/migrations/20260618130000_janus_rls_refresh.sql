-- Re-assert Janus CRM access helpers after out-of-order migration replays, then reload API schema.

create or replace function public.orbis_can_read_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_access_role() in ('janus', 'janus_readonly')
    or public.orbis_has_janus_access();
$$;

create or replace function public.orbis_can_write_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_access_role() = 'janus'
    or public.orbis_has_janus_access();
$$;

grant execute on function public.orbis_can_read_janus() to authenticated;
grant execute on function public.orbis_can_write_janus() to authenticated;

notify pgrst, 'reload schema';
