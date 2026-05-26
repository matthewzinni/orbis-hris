-- Supervisors: read-only access to Care & Engagement aggregate tables (SELECT only).
-- Admins retain full CRUD via existing orbis_can_access_care_engagement().

create or replace function public.orbis_can_view_care_engagement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin() or public.orbis_is_supervisor();
$$;

grant execute on function public.orbis_can_view_care_engagement() to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'care_matrix_cells', 'care_items', 'care_recognition', 'care_employee_notes',
    'care_follow_ups', 'care_resources_shared', 'care_wellness_check_ins', 'care_pulse_snapshots'
  ]
  loop
    execute format('drop policy if exists orbis_%s_select on public.%I', tbl, tbl);
    execute format(
      'create policy orbis_%s_select on public.%I for select to authenticated using (public.orbis_can_view_care_engagement())',
      tbl, tbl
    );
  end loop;
end $$;
