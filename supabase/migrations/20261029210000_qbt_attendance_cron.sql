-- Live attendance sync from QuickBooks Time: scheduling.
--
-- First use of pg_cron/pg_net in this project -- every other scheduled job runs via GitHub
-- Actions. This one needs a true 5-minute cadence, which pg_cron (native to Postgres) suits
-- better than GitHub Actions' cron.
--
-- IMPORTANT -- one-time manual step required after this migration is applied (per environment,
-- training and production separately -- never commit the actual values):
--
--   select vault.create_secret('<the sync-qbt-attendance function''s full HTTPS URL>', 'qbt_attendance_function_url');
--   select vault.create_secret('<a random, dedicated secret -- NOT the service role key>', 'attendance_sync_secret');
--
-- Then set the same secret value as the edge function's own secret:
--   npx supabase secrets set ATTENDANCE_SYNC_SECRET=<the same random value>
--
-- The cron job calls the edge function over HTTPS with that secret as a bearer token; the
-- function checks it against its own ATTENDANCE_SYNC_SECRET env var before doing anything.
-- This deliberately avoids putting the powerful service-role key in the cron job body at all.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('sync-qbt-attendance-5min');
exception when others then
  null; -- no prior job with this name; nothing to unschedule
end $$;

select cron.schedule(
  'sync-qbt-attendance-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'qbt_attendance_function_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'attendance_sync_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
