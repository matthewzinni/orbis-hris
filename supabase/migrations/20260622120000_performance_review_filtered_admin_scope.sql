-- HR leadership (Matthew, Trent, Brent) org-wide; filtered admins and supervisors direct reports only.
-- btw-instance-config: leadership emails in SQL functions; externalize via orbis_instance_settings (future).

create or replace function public.orbis_has_hr_leadership_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(public.orbis_auth_email())) in (
    'matthew.zinni@btwglobal.com',
    'trent.wynne@btwglobal.com',
    'brent.wynne@btwglobal.com'
  );
$$;

-- Keep attendance helper aligned with leadership list.
create or replace function public.orbis_has_org_wide_attendance_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_has_hr_leadership_access();
$$;

create or replace function public.orbis_has_org_wide_performance_review_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_has_hr_leadership_access();
$$;

create or replace function public.orbis_performance_review_employee_visible(emp_key text)
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
        public.orbis_has_org_wide_performance_review_access()
        or (
          (public.orbis_is_admin() or public.orbis_is_supervisor())
          and public.orbis_supervisor_sees_employee(e)
        )
      )
  );
$$;

create or replace function public.orbis_performance_review_visible(emp_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_performance_review_employee_visible(emp_key);
$$;

-- Edge function gates
create or replace function public.orbis_can_access_stay_interview_ai()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and (public.orbis_is_admin() or public.orbis_is_supervisor());
$$;

create or replace function public.orbis_can_access_stay_org_themes_ai()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_has_hr_leadership_access();
$$;

grant execute on function public.orbis_has_hr_leadership_access() to authenticated;
grant execute on function public.orbis_has_org_wide_performance_review_access() to authenticated;
grant execute on function public.orbis_performance_review_employee_visible(text) to authenticated;
grant execute on function public.orbis_can_access_stay_interview_ai() to authenticated;
grant execute on function public.orbis_can_access_stay_org_themes_ai() to authenticated;
