-- =============================================================================
-- Orbis: Leadership team — full admin access (Orbis + Janus + delete)
-- =============================================================================
-- Matches matthew.zinni@btwglobal.com: role admin, approved, can_delete true.
-- Admin role grants full HRIS, Janus CRM, investigations, reports, and settings.
--
-- Run in Supabase → SQL Editor as postgres (or service role).
-- =============================================================================

begin;

update public.user_access
set
  role = 'admin',
  approval_status = 'approved',
  can_delete = true,
  linked_employee_id = null,
  supervisor_name = ''
where lower(trim(email)) in (
  'brent.wynne@btwglobal.com',
  'colewoolard@gmail.com',
  'david.allewalt@btwglobal.com',
  'matthew.zinni@btwglobal.com',
  'orlando.gomez@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'willblake13@gmail.com'
);

commit;

-- Post-run check:
-- select email, role, approval_status, can_delete
-- from public.user_access
-- where lower(trim(email)) in (
--   'brent.wynne@btwglobal.com',
--   'colewoolard@gmail.com',
--   'david.allewalt@btwglobal.com',
--   'matthew.zinni@btwglobal.com',
--   'orlando.gomez@btwglobal.com',
--   'trent.wynne@btwglobal.com',
--   'willblake13@gmail.com'
-- )
-- order by email;
