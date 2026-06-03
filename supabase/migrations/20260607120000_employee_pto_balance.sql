-- Baseline PTO hours from payroll / QuickBooks Time snapshot.
-- Remaining hours are computed in the app: baseline minus approved PTO requests
-- with start_date on or after 2026-06-04.

alter table public.employees
  add column if not exists pto_balance_hours numeric,
  add column if not exists pto_balance_as_of date;

comment on column public.employees.pto_balance_hours is
  'Imported PTO balance (hours). App subtracts approved PTO leave from 2026-06-04 onward.';

comment on column public.employees.pto_balance_as_of is
  'Date of the baseline import (e.g. QBT balance report as-of date).';
