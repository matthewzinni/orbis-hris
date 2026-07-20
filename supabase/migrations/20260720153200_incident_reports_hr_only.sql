-- Incident reports are HR/supervisor-only (same posture as employee_notes).

drop policy if exists orbis_incident_reports_select on public.incident_reports;
create policy orbis_incident_reports_select
  on public.incident_reports
  for select
  to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_incident_reports_insert on public.incident_reports;
create policy orbis_incident_reports_insert
  on public.incident_reports
  for insert
  to authenticated
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_incident_reports_update on public.incident_reports;
create policy orbis_incident_reports_update
  on public.incident_reports
  for update
  to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text))
  with check (public.orbis_hr_staff_child_accessible(employee_id::text));

drop policy if exists orbis_incident_reports_delete on public.incident_reports;
create policy orbis_incident_reports_delete
  on public.incident_reports
  for delete
  to authenticated
  using (public.orbis_hr_staff_child_accessible(employee_id::text));
