-- Fix: stay_interviews and onboarding_tasks each carry old, wide-open permissive policies
-- alongside the newer orbis_* restrictive ones (20261029163000 / 20261029164000). These legacy
-- policies don't exist in any migration file in this repo -- they were created out-of-band,
-- most likely directly in the Supabase dashboard -- and were never cleaned up when the tables
-- moved to the orbis_* convention used everywhere else.
--
-- Postgres ORs permissive policies for the same command together, so as long as a legacy
-- "allow everyone" policy exists for a command, it wins regardless of how restrictive the
-- orbis_* policy for that same command is. Confirmed live on production: any authenticated
-- user could still read/write both tables through these policies, fully bypassing the
-- HR-only scoping those two migrations were meant to add.
--
-- Exact names confirmed via pg_policies on production before writing this migration.

drop policy if exists "Allow authenticated users to delete stay interviews" on public.stay_interviews;
drop policy if exists "Allow authenticated users to insert stay interviews" on public.stay_interviews;
drop policy if exists "Allow authenticated users to select stay interviews" on public.stay_interviews;
drop policy if exists "Allow authenticated users to update stay interviews" on public.stay_interviews;
drop policy if exists "Only Matthew can delete stay interviews" on public.stay_interviews;
drop policy if exists "Scoped insert stay_interviews" on public.stay_interviews;
drop policy if exists "Scoped select stay_interviews" on public.stay_interviews;
drop policy if exists "Scoped update stay_interviews" on public.stay_interviews;

drop policy if exists "Allow delete for all" on public.onboarding_tasks;
drop policy if exists "Allow insert for all" on public.onboarding_tasks;
drop policy if exists "Allow read for all" on public.onboarding_tasks;
drop policy if exists "Allow update for all" on public.onboarding_tasks;
