-- =============================================================================
-- Orbis: April Deocampo — supervisor over Sarah Lopez (full drawer access)
-- =============================================================================
-- How Orbis works (after migration `20260527143000_supervisor_explicit_employee_ids.sql`):
--   • user_access.role = 'supervisor'.
--   • If user_access.supervised_employee_ids is set (non-empty): only those employees.id
--     UUIDs appear in roster + RLS (recommended when one supervisor must not see other names).
--   • If supervised_employee_ids is NULL or empty: legacy fuzzy match on employees.supervisor
--     vs user_access.supervisor_name (any employee whose supervisor text matches can appear).
--
-- This script sets BOTH: Sarah Lopez’s roster supervisor text AND an explicit UUID allowlist
-- so April only ever sees Sarah Lopez (and her meetings, stay interviews, performance reviews, etc.).
--
-- PREREQUISITES
--   1) Apply migration `supabase/migrations/20260527143000_supervisor_explicit_employee_ids.sql`
--      (adds user_access.supervised_employee_ids + RLS helpers), e.g. `npm run db:push`
--   2) Auth user: Dashboard → Authentication → Users → Add user
--      Email: april.deocampo@btwglobal.com  |  Auto-confirm  |  Set password
--
-- Run this in Supabase → SQL Editor as postgres (or service role context).
-- Preview section (3) targets Sarah Lopez by first + last name (case-insensitive).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Sanity: confirm auth user exists (create in Dashboard if this returns 0)
-- -----------------------------------------------------------------------------
-- select id, email, email_confirmed_at, created_at
-- from auth.users
-- where lower(email) = lower('april.deocampo@btwglobal.com');

-- -----------------------------------------------------------------------------
-- 2) user_access — April as supervisor, roster limited to Sarah Lopez by UUID
-- -----------------------------------------------------------------------------

delete from public.user_access
where lower(trim(email)) = lower(trim('april.deocampo@btwglobal.com'));

insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  supervised_employee_ids,
  can_delete
)
values (
  lower(trim('april.deocampo@btwglobal.com')),
  'April Deocampo',
  'supervisor',
  'April Deocampo',
  (
    select array_agg(s.id::text)
    from (
      select e.id
      from public.employees e
      where lower(trim(e.first_name)) = 'sarah'
        and lower(trim(e.last_name)) = 'lopez'
      limit 1
    ) s
  ),
  false
);

-- -----------------------------------------------------------------------------
-- 3) Sarah Lopez — supervisor on roster = April Deocampo (matches user_access above)
-- -----------------------------------------------------------------------------
-- Preview row (run uncommented if you want to verify before update):
-- select id, employee_id, first_name, last_name, supervisor
-- from public.employees
-- where lower(trim(first_name)) = 'sarah' and lower(trim(last_name)) = 'lopez';

update public.employees
set supervisor = 'April Deocampo'
where id in (
  select e.id
  from public.employees e
  where lower(trim(e.first_name)) = 'sarah'
    and lower(trim(e.last_name)) = 'lopez'
  limit 1
);

-- If 0 rows updated: check spelling or duplicate names, then tighten WHERE, e.g.:
--   and lower(trim(e.email)) = 'slopez@...'

-- -----------------------------------------------------------------------------
-- 4) Optional — profiles.hr_role (only if you use profiles without user_access)
-- -----------------------------------------------------------------------------
-- Orbis prefers user_access first; this is optional backup / display.
-- Uncomment and fix column names to match your public.profiles table.
--
-- insert into public.profiles (id, hr_role, full_name)
-- select u.id, 'supervisor', 'April Deocampo'
-- from auth.users u
-- where lower(u.email) = lower('april.deocampo@btwglobal.com')
-- on conflict (id) do update set
--   hr_role = excluded.hr_role,
--   full_name = excluded.full_name;

commit;
