-- =============================================================================
-- Orbis: Justin Powell — supervisor over all direct reports
-- =============================================================================
-- Grants supervisor role + roster/RLS access to every employee whose
-- employees.supervisor field matches "Justin Powell" (same fuzzy rules as the app).
--
-- PREREQUISITES
--   1) Migration `20260527143000_supervisor_explicit_employee_ids.sql` applied
--      (user_access.supervised_employee_ids + RLS helpers), e.g. `npm run db:push`
--   2) Auth user exists: justin.powell@btwglobal.com
--      Supabase → Authentication → Users → Add user | Auto-confirm | Set password
--
-- Run in Supabase → SQL Editor as postgres (or service role).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Preview — auth user and direct reports (run uncommented before commit)
-- -----------------------------------------------------------------------------
-- select id, email, email_confirmed_at
-- from auth.users
-- where lower(trim(email)) = lower(trim('justin.powell@btwglobal.com'));

-- select id, employee_id, first_name, last_name, supervisor
-- from public.employees e
-- where public.orbis_supervisor_matches(
--   coalesce(e.supervisor, ''),
--   'justin powell'
-- )
-- order by last_name, first_name;

-- -----------------------------------------------------------------------------
-- 1) user_access — Justin as supervisor, explicit roster = all direct reports
-- -----------------------------------------------------------------------------
-- supervised_employee_ids: every employees.id whose supervisor text matches.
-- If the list is empty, legacy fuzzy match on supervisor_name still applies.

delete from public.user_access
where lower(trim(email)) = lower(trim('justin.powell@btwglobal.com'));

insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  supervised_employee_ids,
  can_delete
)
values (
  lower(trim('justin.powell@btwglobal.com')),
  'Justin Powell',
  'supervisor',
  'Justin Powell',
  (
    select array_agg(e.id::text)
    from public.employees e
    where public.orbis_supervisor_matches(
      coalesce(e.supervisor, ''),
      'justin powell'
    )
  ),
  false
);

-- -----------------------------------------------------------------------------
-- 2) Optional — normalize supervisor text on direct reports (only if mismatched)
-- -----------------------------------------------------------------------------
-- Uncomment if some rows use variants (e.g. "Justin P.") and you want a single label.
--
-- update public.employees e
-- set supervisor = 'Justin Powell'
-- where public.orbis_supervisor_matches(
--   coalesce(e.supervisor, ''),
--   'justin powell'
-- )
--   and trim(coalesce(e.supervisor, '')) <> 'Justin Powell';

-- -----------------------------------------------------------------------------
-- 3) Optional — profiles.hr_role (backup if user_access fails to load in app)
-- -----------------------------------------------------------------------------
-- Orbis prefers user_access. Do NOT leave hr_role = 'admin' for this user.
--
-- insert into public.profiles (id, hr_role, full_name)
-- select u.id, 'supervisor', 'Justin Powell'
-- from auth.users u
-- where lower(trim(u.email)) = lower(trim('justin.powell@btwglobal.com'))
-- on conflict (id) do update set
--   hr_role = excluded.hr_role,
--   full_name = excluded.full_name;

commit;

-- -----------------------------------------------------------------------------
-- 4) Post-run check (run after commit)
-- -----------------------------------------------------------------------------
-- select email, role, supervisor_name, supervised_employee_ids
-- from public.user_access
-- where lower(trim(email)) = lower(trim('justin.powell@btwglobal.com'));
