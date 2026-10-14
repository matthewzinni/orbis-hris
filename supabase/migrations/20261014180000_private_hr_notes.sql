-- Employee HR Notes belong to Matthew's work auth account, not the admin role.
-- Operational risk/impact flags share this legacy table but are not HR Notes.
create table public.hr_notes_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id)
);
alter table public.hr_notes_owner enable row level security;
revoke all on public.hr_notes_owner from public, anon, authenticated;
insert into public.hr_notes_owner (user_id)
select id from auth.users where lower(trim(email)) = 'matthew.zinni@btwglobal.com';
-- Missing owner leaves notes inaccessible. Only a database operator can set it.

create or replace function public.orbis_can_access_hr_notes()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.orbis_is_admin()
    and exists (select 1 from public.hr_notes_owner where user_id = auth.uid());
$$;
revoke all on function public.orbis_can_access_hr_notes() from public, anon;
grant execute on function public.orbis_can_access_hr_notes() to authenticated;

create or replace function public.orbis_is_employee_flag(note_kind text)
returns boolean language sql immutable set search_path = public
as $$
  select coalesce(trim(note_kind) in (
    'At-Risk Flag', 'At-Risk Cleared', 'Impact Player Flag', 'Impact Player Cleared'
  ), false);
$$;
revoke all on function public.orbis_is_employee_flag(text) from public, anon;
grant execute on function public.orbis_is_employee_flag(text) to authenticated;

alter table public.employee_notes enable row level security;
revoke all on public.employee_notes from anon;
-- Restrictive policy also constrains any older permissive policies left in place.
create policy orbis_employee_notes_private_guard on public.employee_notes
as restrictive for all to authenticated
using (
  public.orbis_can_access_hr_notes()
  or (public.orbis_is_employee_flag(note_type)
      and public.orbis_hr_staff_child_accessible(employee_id::text))
)
with check (
  public.orbis_can_access_hr_notes()
  or (public.orbis_is_employee_flag(note_type)
      and public.orbis_hr_staff_child_accessible(employee_id::text))
);

-- Prevent relabeling a private note as a shared flag, including by its owner.
create or replace function public.orbis_keep_note_privacy_class()
returns trigger language plpgsql set search_path = public
as $$
begin
  if public.orbis_is_employee_flag(old.note_type) <> public.orbis_is_employee_flag(new.note_type) then
    raise exception 'HR notes and operational flags cannot be converted into each other.';
  end if;
  return new;
end;
$$;
revoke all on function public.orbis_keep_note_privacy_class() from public, anon;
create trigger orbis_employee_notes_privacy_class
before update on public.employee_notes for each row
execute function public.orbis_keep_note_privacy_class();
