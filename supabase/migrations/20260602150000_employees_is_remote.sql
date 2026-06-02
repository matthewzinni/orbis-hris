-- Overseas / remote flag for attendance roll call and employee admin

alter table public.employees
  add column if not exists is_remote boolean not null default false;

comment on column public.employees.is_remote is
  'When true, employee appears in the overseas/remote section on Attendance roll call.';

-- Known remote staff (employee id = BTW number)
update public.employees
set is_remote = true
where upper(trim(id)) in (
  'BTW1801',
  'BTW2301',
  'BTW2401',
  'BTW2403',
  'BTW2404',
  'BTW2606',
  'BTW2610'
);
