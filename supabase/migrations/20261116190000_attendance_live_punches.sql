-- Live attendance: keep the whole day, not one timesheet. People clock out for lunch and back in,
-- so clock_in_at = first clock-in, clock_out_at = last clock-out, and every in/out pair is stored.
--
-- punches        [{"in": "<iso>", "out": "<iso>" | null}, ...] earliest first (out = null while on the clock)
-- worked_seconds total worked today as of the last sync

alter table public.attendance_live_status
  add column if not exists punches jsonb not null default '[]'::jsonb,
  add column if not exists worked_seconds integer;

comment on column public.attendance_live_status.punches is
  'All clock-in/out pairs today from QuickBooks Time, earliest first; out is null for the open entry.';
comment on column public.attendance_live_status.worked_seconds is
  'Seconds worked today as of synced_at, including the open entry.';
