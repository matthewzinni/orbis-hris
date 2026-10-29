-- Fix: care_follow_ups, care_resources_shared, care_wellness_check_ins, and care_recognition
-- SELECT policies grant any supervisor org-wide read access (orbis_can_view_care_engagement())
-- with no per-employee scoping, unlike care_items/care_employee_notes which were already
-- tightened to respect confidentiality + the employee's own supervisor scope. These four
-- tables have no confidentiality tier, so this scopes them the same way ordinary employee
-- child records are scoped elsewhere: admin sees everything, a supervisor only sees records
-- for employees in their own scope. Aggregate tables without an employee_id
-- (care_matrix_cells, care_pulse_snapshots) are intentionally left as organization-wide
-- supervisor-readable -- they aren't per-employee confidential records.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'care_follow_ups', 'care_resources_shared', 'care_wellness_check_ins', 'care_recognition'
  ]
  loop
    execute format('drop policy if exists orbis_%s_select on public.%I', tbl, tbl);
    execute format(
      $policy$
      create policy orbis_%1$s_select on public.%1$I
        for select
        to authenticated
        using (
          public.orbis_can_access_care_engagement()
          or (
            public.orbis_can_view_care_engagement()
            and public.orbis_employee_child_accessible(employee_id)
          )
        )
      $policy$,
      tbl
    );
  end loop;
end $$;
