-- David Allewalt: org-wide HR leadership (performance reviews, discipline, attendance).
-- Matches client orgWideScopeEmails + accessScopes leadership sets.

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
    'brent.wynne@btwglobal.com',
    'david.allewalt@btwglobal.com'
  );
$$;

create or replace function public.orbis_has_org_wide_discipline_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_access_is_approved()
    and lower(trim(public.orbis_auth_email())) in (
      'matthew.zinni@btwglobal.com',
      'david.allewalt@btwglobal.com'
    );
$$;

update public.user_access
set
  role = 'admin',
  approval_status = 'approved',
  can_delete = true,
  linked_employee_id = null,
  supervisor_name = ''
where lower(trim(email)) = 'david.allewalt@btwglobal.com';

grant execute on function public.orbis_has_hr_leadership_access() to authenticated;
