-- Share existing and future HR notes with the three named leadership work accounts.
-- Keep identity membership protected from normal application users, including admins.
create table public.hr_notes_access (
  user_id uuid primary key references auth.users(id)
);
alter table public.hr_notes_access enable row level security;
revoke all on public.hr_notes_access from public, anon, authenticated;
insert into public.hr_notes_access (user_id)
select id from auth.users
where lower(trim(email)) in (
  'matthew.zinni@btwglobal.com',
  'brent.wynne@btwglobal.com',
  'trent.wynne@btwglobal.com'
);
do $$ begin
  -- Supabase preview branches contain no Auth users; leave their notes inaccessible.
  if exists (select 1 from auth.users)
    and (select count(*) from public.hr_notes_access) <> 3 then
    raise exception 'Expected exactly three existing leadership work auth accounts for HR notes.';
  end if;
end $$;

create or replace function public.orbis_can_access_hr_notes()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.orbis_is_admin()
    and exists (select 1 from public.hr_notes_access where user_id = auth.uid());
$$;
revoke all on function public.orbis_can_access_hr_notes() from public, anon;
grant execute on function public.orbis_can_access_hr_notes() to authenticated;
-- The existing restrictive employee_notes policy and privacy-class trigger remain.
-- No note content is copied, deleted, or relabeled.
