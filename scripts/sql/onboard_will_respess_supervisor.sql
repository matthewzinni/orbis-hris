-- =============================================================================
-- Orbis: Will Respess — supervisor over all direct reports
-- =============================================================================
-- Grants supervisor role + roster/RLS access to every employee whose
-- employees.supervisor field matches "Will Respess" (same fuzzy rules as the app).
--
-- PREREQUISITES
--   1) Migration `20260527143000_supervisor_explicit_employee_ids.sql` applied
--      (user_access.supervised_employee_ids + RLS helpers), e.g. `npm run db:push`
--   2) Auth user exists: will.respess@btwglobal.com
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
-- where lower(trim(email)) = lower(trim('will.respess@btwglobal.com'));

-- select id, employee_id, first_name, last_name, supervisor
-- from public.employees e
-- where public.orbis_supervisor_matches(
--   coalesce(e.supervisor, ''),
--   'will respess'
-- )
-- order by last_name, first_name;

-- -----------------------------------------------------------------------------
-- 1) user_access — Will as supervisor, explicit roster = all direct reports
-- -----------------------------------------------------------------------------
-- supervised_employee_ids: every employees.id whose supervisor text matches.
-- If the list is empty, legacy fuzzy match on supervisor_name still applies.

delete from public.user_access
where lower(trim(email)) = lower(trim('will.respess@btwglobal.com'));

insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  supervised_employee_ids,
  can_delete
)
values (
  lower(trim('will.respess@btwglobal.com')),
  'Will Respess',
  'supervisor',
  'Will Respess',
  (
    select array_agg(e.id::text)
    from public.employees e
    where public.orbis_supervisor_matches(
      coalesce(e.supervisor, ''),
      'will respess'
    )
  ),
  false
);

-- -----------------------------------------------------------------------------
-- 2) Optional — normalize supervisor text on direct reports (only if mismatched)
-- -----------------------------------------------------------------------------
-- Uncomment if some rows use variants (e.g. "Will R.") and you want a single label.
--
-- update public.employees e
-- set supervisor = 'Will Respess'
-- where public.orbis_supervisor_matches(
--   coalesce(e.supervisor, ''),
--   'will respess'
-- )
--   and trim(coalesce(e.supervisor, '')) <> 'Will Respess';

-- -----------------------------------------------------------------------------
-- 3) Optional — profiles.hr_role (backup if user_access fails to load in app)
-- -----------------------------------------------------------------------------
-- Orbis prefers user_access. Do NOT leave hr_role = 'admin' for this user.
--
-- insert into public.profiles (id, hr_role, full_name)
-- select u.id, 'supervisor', 'Will Respess'
-- from auth.users u
-- where lower(trim(u.email)) = lower(trim('will.respess@btwglobal.com'))
-- on conflict (id) do update set
--   hr_role = excluded.hr_role,
--   full_name = excluded.full_name;

commit;

-- -----------------------------------------------------------------------------
-- 4) Post-run check (run after commit)
-- -----------------------------------------------------------------------------
-- select email, role, supervisor_name, supervised_employee_ids
-- from public.user_access
-- where lower(trim(email)) = lower(trim('will.respess@btwglobal.com'));
