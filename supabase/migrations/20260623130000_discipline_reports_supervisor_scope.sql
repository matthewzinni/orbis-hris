-- Matthew: org-wide discipline. Supervisors and scoped admins: direct reports only.

create or replace function public.orbis_has_org_wide_discipline_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and lower(trim(public.orbis_auth_email())) = 'matthew.zinni@btwglobal.com';
$$;

create or replace function public.orbis_can_view_discipline_reports()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_has_org_wide_discipline_access();
$$;

create or replace function public.orbis_discipline_report_accessible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.id::text = emp_key
      and (
        public.orbis_has_org_wide_discipline_access()
        or (
          (public.orbis_is_supervisor() or public.orbis_is_admin())
          and public.orbis_supervisor_sees_employee(e)
        )
      )
  );
$$;

grant execute on function public.orbis_has_org_wide_discipline_access() to authenticated;
