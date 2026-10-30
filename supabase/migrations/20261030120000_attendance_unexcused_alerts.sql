-- Unexcused absence alerts: one row per email sent by scripts/unexcused_absence_alert.py.
-- trigger_date is the newest unexcused absence that put the employee at or over the limit,
-- so each new unexcused absence while over the limit sends one alert, never a repeat.
-- Service role only (the alert job); no policies for signed-in users.

create table if not exists public.attendance_unexcused_alerts (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  trigger_date date not null,
  unexcused_count integer not null,
  window_days integer not null,
  absence_dates date[] not null default '{}',
  sent_to text[] not null default '{}',
  sent_at timestamptz not null default now(),
  unique (employee_id, trigger_date)
);

create index if not exists attendance_unexcused_alerts_employee_id_idx
  on public.attendance_unexcused_alerts (employee_id);

alter table public.attendance_unexcused_alerts enable row level security;
