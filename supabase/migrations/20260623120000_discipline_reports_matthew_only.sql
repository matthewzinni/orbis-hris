-- Discipline reports are confidential to Matthew Zinni (HR).

create or replace function public.orbis_can_view_discipline_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and lower(trim(public.orbis_auth_email())) = 'matthew.zinni@btwglobal.com';
$$;

create or replace function public.orbis_discipline_report_accessible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_can_view_discipline_reports()
    and public.orbis_employee_child_accessible(emp_key);
$$;

drop policy if exists orbis_discipline_reports_select on public.discipline_reports;
create policy orbis_discipline_reports_select
  on public.discipline_reports
  for select
  to authenticated
  using (public.orbis_discipline_report_accessible(employee_id::text));

drop policy if exists orbis_discipline_reports_insert on public.discipline_reports;
create policy orbis_discipline_reports_insert
  on public.discipline_reports
  for insert
  to authenticated
  with check (public.orbis_discipline_report_accessible(employee_id::text));

drop policy if exists orbis_discipline_reports_update on public.discipline_reports;
create policy orbis_discipline_reports_update
  on public.discipline_reports
  for update
  to authenticated
  using (public.orbis_discipline_report_accessible(employee_id::text))
  with check (public.orbis_discipline_report_accessible(employee_id::text));

drop policy if exists orbis_discipline_reports_delete on public.discipline_reports;
create policy orbis_discipline_reports_delete
  on public.discipline_reports
  for delete
  to authenticated
  using (public.orbis_discipline_report_accessible(employee_id::text));

grant execute on function public.orbis_can_view_discipline_reports() to authenticated;
grant execute on function public.orbis_discipline_report_accessible(text) to authenticated;
