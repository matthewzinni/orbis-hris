-- Janus CRM access grant on user_access (orthogonal to primary role: admin, supervisor, user).

alter table public.user_access
  add column if not exists janus_access boolean not null default false;

comment on column public.user_access.janus_access is
  'When true, user can view and edit Janus CRM regardless of primary role (supervisor, user, etc.).';

create or replace function public.orbis_has_janus_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ua.janus_access
      from public.user_access ua
      where lower(trim(ua.email)) = public.orbis_auth_email()
        and coalesce(lower(trim(ua.approval_status)), 'approved') = 'approved'
      limit 1
    ),
    false
  );
$$;

grant execute on function public.orbis_has_janus_access() to authenticated;

create or replace function public.orbis_can_read_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_access_role() in ('janus', 'janus_readonly')
    or public.orbis_has_janus_access();
$$;

create or replace function public.orbis_can_write_janus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_access_role() = 'janus'
    or public.orbis_has_janus_access();
$$;

-- Leadership / BD team — full Janus while keeping existing primary roles.
update public.user_access
set janus_access = true
where lower(trim(email)) in (
  lower(trim('kyle.hodges@btwglobal.com')),
  lower(trim('ryan.bird@btwglobal.com')),
  lower(trim('dean.mclean@btwglobal.com')),
  lower(trim('trent.wynne@btwglobal.com')),
  lower(trim('brent.wynne@btwglobal.com')),
  lower(trim('david.allewalt@btwglobal.com')),
  lower(trim('colewoolard@gmail.com')),
  lower(trim('danielc.btw@gmail.com')),
  lower(trim('teresagravel11@gmail.com'))
);
