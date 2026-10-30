-- Fix: stay_interviews RLS used orbis_employee_child_accessible, whose self-view branch lets
-- an employee read/write/delete their OWN stay interview rows. Stay interviews are a
-- confidential manager/HR retention tool (the drawer and summary fields are never shown in
-- any employee self-service view, and src/modules/stayInterviews.ts has no client-side role
-- gating because the RLS was assumed to already restrict this). AUD-006 already fixed the
-- same bug class for incident_reports by introducing orbis_hr_staff_child_accessible
-- (admin, or supervisor of that employee -- no self-view); this extends that fix to
-- stay_interviews. No legitimate behavior changes: employees never had a UI path to this
-- table and still won't.

drop policy if exists orbis_stay_interviews_select on public.stay_interviews;
create policy orbis_stay_interviews_select on public.stay_interviews for select to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_stay_interviews_insert on public.stay_interviews;
create policy orbis_stay_interviews_insert on public.stay_interviews for insert to authenticated
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_stay_interviews_update on public.stay_interviews;
create policy orbis_stay_interviews_update on public.stay_interviews for update to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text))
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_stay_interviews_delete on public.stay_interviews;
create policy orbis_stay_interviews_delete on public.stay_interviews for delete to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));
