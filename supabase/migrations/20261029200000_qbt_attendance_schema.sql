-- Live attendance sync from QuickBooks Time: schema.
--
-- Adds an explicit QuickBooks Time user-id mapping column (never match by name -- that's the
-- exact bug class already found in the PTO sync's fuzzy matching) and a per-employee scheduled
-- start time, plus a new table holding today's live clock status per employee. This is
-- additive: the existing manual roll-call feature (attendance_manual_snapshots) is untouched.

alter table public.employees
  add column if not exists qbt_user_id text,
  add column if not exists scheduled_start_time time;

comment on column public.employees.qbt_user_id is
  'QuickBooks Time (TSheets) user id. Explicit mapping only -- set via the admin QBT attendance mapping screen, never inferred from name matching.';
comment on column public.employees.scheduled_start_time is
  'Employee''s scheduled shift start time, interpreted in America/New_York. Used only to decide when a missed punch should display as "absent" rather than "not started yet."';

create unique index if not exists employees_qbt_user_id_unique_idx
  on public.employees (qbt_user_id)
  where qbt_user_id is not null;

create table if not exists public.attendance_live_status (
  employee_id text primary key references public.employees(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('on_clock', 'worked_clocked_out', 'manual_entry', 'no_punch')),
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create index if not exists attendance_live_status_date_idx
  on public.attendance_live_status (attendance_date);

alter table public.attendance_live_status enable row level security;

-- Read access matches the existing manual attendance feature's scoping exactly:
-- org-wide leadership sees everyone, other admins/supervisors see their own direct reports.
drop policy if exists orbis_attendance_live_status_select on public.attendance_live_status;
create policy orbis_attendance_live_status_select
  on public.attendance_live_status
  for select
  to authenticated
  using (
    public.orbis_has_org_wide_attendance_access()
    or public.orbis_attendance_employee_accessible(employee_id)
  );

-- Only the sync edge function (service_role) writes to this table -- it's a pure sync target,
-- not something any interactive user (including admins) edits directly.
drop policy if exists orbis_attendance_live_status_service_write on public.attendance_live_status;
create policy orbis_attendance_live_status_service_write
  on public.attendance_live_status
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.attendance_live_status to authenticated;
grant all on public.attendance_live_status to service_role;
