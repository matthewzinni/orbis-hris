-- Return the current auth user's user_access row by matching auth.users.email,
-- so supervisors still resolve even if user_access.email casing/spacing differs from JWT text.
-- SECURITY DEFINER reads auth.users (not available to plain authenticated SELECT).

create or replace function public.orbis_get_my_user_access()
returns public.user_access
language sql
stable
security definer
set search_path = public
as $$
  select ua.*
  from public.user_access ua
  inner join auth.users au on au.id = auth.uid()
  where lower(trim(au.email)) = lower(trim(ua.email))
  limit 1;
$$;

revoke all on function public.orbis_get_my_user_access() from public;
grant execute on function public.orbis_get_my_user_access() to authenticated;
