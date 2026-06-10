-- Add NC-4 (North Carolina withholding) to the standard onboarding checklist.

update public.onboarding_tasks
set task_name = 'NC-4'
where trim(task_name) in ('Complete NC-4', 'NC 4', 'NC4');

insert into public.onboarding_tasks (employee_id, task_name, status, due_date, assigned_to, show_in_portal)
select
  e.id::text,
  'NC-4',
  'Pending',
  e.hire_date,
  'employee',
  true
from public.employees e
where e.hire_date is not null
  and not exists (
    select 1
    from public.onboarding_tasks ot
    where ot.employee_id = e.id::text
      and trim(ot.task_name) = 'NC-4'
  );

update public.onboarding_tasks ot
set
  due_date = coalesce(ot.due_date, e.hire_date),
  assigned_to = coalesce(nullif(trim(ot.assigned_to), ''), 'employee'),
  show_in_portal = coalesce(ot.show_in_portal, true)
from public.employees e
where e.id::text = ot.employee_id
  and trim(ot.task_name) = 'NC-4';
