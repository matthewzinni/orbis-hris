-- Ensure admins can insert/update/delete user_access rows from Admin & Settings.

grant select, insert, update, delete on table public.user_access to authenticated;

drop policy if exists orbis_user_access_write_admin on public.user_access;
drop policy if exists orbis_user_access_insert_admin on public.user_access;
drop policy if exists orbis_user_access_update_admin on public.user_access;
drop policy if exists orbis_user_access_delete_admin on public.user_access;

create policy orbis_user_access_insert_admin
  on public.user_access
  for insert
  to authenticated
  with check (public.orbis_is_admin());

create policy orbis_user_access_update_admin
  on public.user_access
  for update
  to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

create policy orbis_user_access_delete_admin
  on public.user_access
  for delete
  to authenticated
  using (public.orbis_is_admin());
