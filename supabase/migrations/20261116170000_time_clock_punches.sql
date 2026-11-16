-- Clock-in / clock-out punches made in Orbis (qbt-clock Edge Function), with the phone's GPS
-- location at the moment of the punch. Location is required to punch in Orbis.
--
-- Written only by the qbt-clock Edge Function (service role). Readable by admins (everyone) and
-- supervisors (their team) via orbis_employee_child_accessible -- the same rule as leave requests.

create table if not exists public.time_clock_punches (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  qbt_user_id text,
  qbt_timesheet_id bigint,
  action text not null check (action in ('clock_in', 'clock_out')),
  punched_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  created_at timestamptz not null default now()
);

create index if not exists time_clock_punches_employee_time_idx
  on public.time_clock_punches (employee_id, punched_at desc);

create index if not exists time_clock_punches_time_idx
  on public.time_clock_punches (punched_at desc);

alter table public.time_clock_punches enable row level security;

drop policy if exists time_clock_punches_select on public.time_clock_punches;
create policy time_clock_punches_select on public.time_clock_punches
  for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id));

-- No insert / update / delete policies: only the service role (qbt-clock) writes punches.
revoke insert, update, delete on public.time_clock_punches from authenticated, anon;

comment on table public.time_clock_punches is
  'Orbis time clock punches with GPS location at punch time. Written by qbt-clock only.';
