-- Training-safe companion to 20261014190000_shared_hr_notes_leadership.sql.
--
-- That migration hard-fails (raise exception) unless it finds exactly three auth accounts
-- matching matthew.zinni/brent.wynne/trent.wynne@btwglobal.com -- correct for the real BTW
-- tenant (production), where those three accounts exist, but it blocks `db push` entirely on
-- the training project, which only has fictional Northline Manufacturing demo accounts and
-- was never marked as having applied that migration (training had drifted ~40 migrations
-- behind main before this pass).
--
-- Per instruction, the original migration file is left untouched -- it's marked "applied" in
-- training's migration history via `supabase migration repair --status applied 20261014190000`
-- instead of being run there. This migration recreates the same end state, but only enforces
-- the exact-three-accounts invariant when the tenant actually has any @btwglobal.com accounts
-- at all. On production (already has exactly those three), this is a no-op: the check still
-- passes, same as before. On training (zero @btwglobal.com accounts), it skips the check
-- entirely rather than raising.
--
-- Written so it's safe to run on every environment, including production once this branch
-- merges -- `if not exists` / `on conflict do nothing` / `create or replace` make every
-- statement idempotent.

create table if not exists public.hr_notes_access (
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
)
on conflict (user_id) do nothing;

do $$
declare
  has_btw_accounts boolean;
  matched_count integer;
begin
  select exists (
    select 1 from auth.users where lower(trim(email)) like '%@btwglobal.com'
  ) into has_btw_accounts;

  select count(*) into matched_count from public.hr_notes_access;

  -- Only enforce the exact-three invariant when this tenant actually has BTW accounts at all
  -- (i.e. it looks like the real production tenant, not a demo/training environment).
  if has_btw_accounts and matched_count <> 3 then
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
