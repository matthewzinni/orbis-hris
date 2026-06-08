-- Create pending user_access when Supabase Auth user is created (covers email-confirm flow).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
  display text;
  matched public.employees;
begin
  auth_email := lower(trim(coalesce(new.email, '')));

  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  if auth_email = '' then
    return new;
  end if;

  if auth_email in (
    'matthew.zinni@btwglobal.com',
    'trent.wynne@btwglobal.com',
    'brent.wynne@btwglobal.com'
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.user_access ua
    where lower(trim(ua.email)) = auth_email
  ) then
    return new;
  end if;

  display := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

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
    coalesce(
      display,
      nullif(trim(coalesce(matched.first_name, '') || ' ' || coalesce(matched.last_name, '')), ''),
      auth_email
    ),
    'user',
    '',
    case when matched.id is not null then matched.id::text else null end,
    'pending',
    false
  )
  on conflict (email) do nothing;

  return new;
end;
$$;

-- Backfill orphaned auth users (signed up before pending row logic).
insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  linked_employee_id,
  approval_status,
  can_delete
)
select
  lower(trim(u.email)) as email,
  coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), ''),
    nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
    lower(trim(u.email))
  ) as display_name,
  'user' as role,
  '' as supervisor_name,
  e.id::text as linked_employee_id,
  'pending' as approval_status,
  false as can_delete
from auth.users u
left join lateral (
  select em.*
  from public.employees em
  where lower(trim(coalesce(em.work_email, ''))) = lower(trim(u.email))
     or lower(trim(coalesce(em.personal_email, ''))) = lower(trim(u.email))
  order by em.hire_date desc nulls last
  limit 1
) e on true
where lower(trim(u.email)) not in (
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com'
)
and not exists (
  select 1
  from public.user_access ua
  where lower(trim(ua.email)) = lower(trim(u.email))
);
