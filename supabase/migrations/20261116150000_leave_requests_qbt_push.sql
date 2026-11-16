-- Approved PTO in Orbis → time-off request in QuickBooks Time (push-leave-to-qbt Edge Function).
--
-- qbt_time_off_request_id   QuickBooks Time time_off_request id created for this Orbis request
-- qbt_sync_status           null      = not processed yet
--                           sending   = push in progress (claimed by one function call)
--                           synced    = approved request exists in QuickBooks Time
--                           canceled  = Orbis request no longer approved; QBT request canceled
--                           skipped   = intentionally not sent (legacy approval, or QBT already
--                                       had PTO on those dates)
--                           failed    = last attempt failed; see qbt_sync_error
-- qbt_sync_signature        dates + hours last sent, so edits re-send (cancel + recreate)

alter table public.leave_requests
  add column if not exists qbt_time_off_request_id bigint,
  add column if not exists qbt_sync_status text,
  add column if not exists qbt_sync_error text,
  add column if not exists qbt_sync_signature text,
  add column if not exists qbt_sync_attempted_at timestamptz,
  add column if not exists qbt_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_qbt_sync_status_check'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_qbt_sync_status_check
      check (
        qbt_sync_status is null
        or qbt_sync_status in ('sending', 'synced', 'canceled', 'skipped', 'failed')
      );
  end if;
end $$;

comment on column public.leave_requests.qbt_sync_status is
  'QuickBooks Time push state for approved PTO: null, sending, synced, canceled, skipped, failed.';

-- PTO approved before this feature was entered in QuickBooks Time by hand; never re-send it.
update public.leave_requests
set qbt_sync_status = 'skipped',
    qbt_sync_error = 'Approved before Orbis sent PTO to QuickBooks Time.'
where status = 'approved'
  and qbt_sync_status is null;
