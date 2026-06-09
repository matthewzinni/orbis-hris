-- Employee self-service: view own profile and update contact fields + emergency contacts.

-- ---------------------------------------------------------------------------
-- Safe profile updates (personal email + phone only)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_update_my_profile(
  p_personal_email text default null,
  p_phone text default null
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id text;
  updated public.employees;
begin
  if not public.orbis_access_is_approved() then
    raise exception 'Access not approved';
  end if;

  if not public.orbis_is_employee() then
    raise exception 'Not authorized';
  end if;

  linked_id := public.orbis_linked_employee_id();
  if linked_id is null or btrim(linked_id) = '' then
    raise exception 'No linked employee record';
  end if;

  update public.employees e
  set
    personal_email = case
      when p_personal_email is not null then nullif(btrim(p_personal_email), '')
      else e.personal_email
    end,
    phone = case
      when p_phone is not null then nullif(btrim(p_phone), '')
      else e.phone
    end
  where e.id::text = linked_id
  returning e.* into updated;

  if not found then
    raise exception 'Employee record not found';
  end if;

  return updated;
end;
$$;

revoke all on function public.orbis_update_my_profile(text, text) from public;
grant execute on function public.orbis_update_my_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- emergency_contacts (scoped like other employee child tables)
-- ---------------------------------------------------------------------------

alter table if exists public.emergency_contacts enable row level security;

drop policy if exists orbis_emergency_contacts_select on public.emergency_contacts;
create policy orbis_emergency_contacts_select
  on public.emergency_contacts
  for select
  to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

drop policy if exists orbis_emergency_contacts_insert on public.emergency_contacts;
create policy orbis_emergency_contacts_insert
  on public.emergency_contacts
  for insert
  to authenticated
  with check (public.orbis_employee_child_accessible(employee_id::text));

drop policy if exists orbis_emergency_contacts_update on public.emergency_contacts;
create policy orbis_emergency_contacts_update
  on public.emergency_contacts
  for update
  to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text))
  with check (public.orbis_employee_child_accessible(employee_id::text));

drop policy if exists orbis_emergency_contacts_delete on public.emergency_contacts;
create policy orbis_emergency_contacts_delete
  on public.emergency_contacts
  for delete
  to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));
