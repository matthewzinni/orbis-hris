-- =============================================================================
-- Bootstrap a NEW dedicated Orbis instance (empty or freshly migrated database).
--
-- ⚠️  NEVER run this on BTW Global production (orbis-btw.com / fxljbnyarfwnqgheywgw).
--     It removes BTW-specific user_access rows seeded by historical migrations.
--
-- When to run:
--   1. Create new Supabase project
--   2. npm run db:push   (applies full migration chain)
--   3. Run this script in Supabase SQL Editor (or psql)
--   4. Create first Auth user in Supabase Dashboard
--   5. Insert first admin row (see bottom) and approve
--   6. Deploy Vercel with customer env vars — see docs/INSTANCE_DEPLOY.md
-- =============================================================================

begin;

-- Leadership rows inserted by 20260610120000_role_access_hardening (no Auth users yet).
delete from public.user_access
where lower(trim(email)) in (
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com'
);

-- Janus grants seeded by 20260616120000_user_access_janus_grant (BTW BD team).
update public.user_access
set janus_access = false
where lower(trim(email)) in (
  'kyle.hodges@btwglobal.com',
  'ryan.bird@btwglobal.com',
  'dean.mclean@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
  'david.allewalt@btwglobal.com',
  'colewoolard@gmail.com',
  'danielc.btw@gmail.com',
  'teresagravel11@gmail.com'
);

-- Supervisor scope backfill targets from BTW-specific migrations (harmless if rows absent).
delete from public.user_access
where lower(trim(email)) in (
  'kyle.hodges@btwglobal.com'
)
and not exists (
  select 1 from auth.users u where lower(trim(u.email)) = lower(trim(public.user_access.email))
);

commit;

-- -----------------------------------------------------------------------------
-- After running the above, create your first customer admin:
--
-- 1. Supabase → Authentication → Users → Add user (email + password)
-- 2. Replace placeholders and run:
--
-- insert into public.user_access (
--   email,
--   display_name,
--   role,
--   supervisor_name,
--   linked_employee_id,
--   approval_status,
--   can_delete,
--   janus_access
-- )
-- values (
--   'admin@customer.com',
--   'Customer Admin',
--   'admin',
--   '',
--   null,
--   'approved',
--   true,
--   false   -- set true if this customer licenses Janus CRM
-- )
-- on conflict (email) do update
-- set
--   role = excluded.role,
--   display_name = excluded.display_name,
--   approval_status = 'approved',
--   can_delete = excluded.can_delete,
--   janus_access = excluded.janus_access;
--
-- Note: SQL functions for org-wide attendance/reviews still embed BTW leadership
-- emails until orbis_instance_settings is added (Month 2 sprint). Set matching
-- VITE_ORG_WIDE_SCOPE_EMAILS on Vercel for client-side scope; plan SQL settings
-- before go-live for server-side parity.
