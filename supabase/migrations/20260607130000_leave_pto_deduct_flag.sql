-- Only new Orbis leave requests reduce PTO remaining; QBT baseline already net of past approved PTO.

alter table public.leave_requests
  add column if not exists deduct_from_pto_balance boolean not null default true;

comment on column public.leave_requests.deduct_from_pto_balance is
  'When true, approved PTO hours subtract from employees.pto_balance_hours remaining. False for historical imports already reflected in the QBT baseline.';

update public.leave_requests
set deduct_from_pto_balance = false
where status = 'approved';
