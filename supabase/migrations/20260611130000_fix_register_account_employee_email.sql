-- employees has work_email + personal_email only (no email column).

create or replace function public.orbis_register_account_request(p_display_name text default null)
returns public.user_access
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
  existing public.user_access;
  display text;
  matched public.employees;
begin
  auth_email := public.orbis_auth_email();
  if auth_email = '' then
    raise exception 'Not signed in';
  end if;

  if auth_email in (
    'matthew.zinni@btwglobal.com',
    'trent.wynne@btwglobal.com',
    'brent.wynne@btwglobal.com'
  ) then
    raise exception 'This email is managed by HR. Use password sign-in.';
  end if;

  select ua.* into existing
  from public.user_access ua
  where lower(trim(ua.email)) = auth_email
  limit 1;

  if found then
    if existing.approval_status = 'approved' then
      raise exception 'An approved account already exists for this email.';
    end if;
    if existing.approval_status = 'rejected' then
      raise exception 'This account request was rejected. Contact HR.';
    end if;
    return existing;
  end if;

  display := nullif(trim(coalesce(p_display_name, '')), '');

  select e.* into matched
  from public.employees e
  where lower(trim(coalesce(e.work_email, ''))) = auth_email
     or lower(trim(coalesce(e.personal_email, ''))) = auth_email
  order by e.hire_date desc nulls last
  limit 1;

  insert into public.user_access (
    email,
    display_name,
    role,
    supervisor_name,
    linked_employee_id,
    approval_status,
    can_delete
  )
  values (
    auth_email,
    coalesce(display, nullif(trim(coalesce(matched.first_name, '') || ' ' || coalesce(matched.last_name, '')), '')),
    'user',
    '',
    case when matched.id is not null then matched.id::text else null end,
    'pending',
    false
  )
  returning * into existing;

  return existing;
end;
$$;
