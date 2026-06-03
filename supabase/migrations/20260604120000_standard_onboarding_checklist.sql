-- Standard onboarding checklist: W-4, I-9, Standalone Form Packet

update public.onboarding_tasks
set task_name = 'W-4'
where trim(task_name) in ('Complete W-4', 'W 4');

update public.onboarding_tasks
set task_name = 'I-9'
where trim(task_name) in ('Complete I-9', 'I 9');

delete from public.onboarding_tasks
where trim(task_name) in (
  'Sign Employee Handbook',
  'Safety Training',
  'Set Up System Access'
);

delete from public.onboarding_tasks
where trim(task_name) not in ('W-4', 'I-9', 'Standalone Form Packet');

with ranked as (
  select
    id,
    row_number() over (
      partition by employee_id, trim(task_name)
      order by
        case when lower(coalesce(status, '')) = 'completed' then 0 else 1 end,
        id
    ) as rn
  from public.onboarding_tasks
  where trim(task_name) in ('W-4', 'I-9', 'Standalone Form Packet')
)
delete from public.onboarding_tasks
where id in (select id from ranked where rn > 1);

insert into public.onboarding_tasks (employee_id, task_name, status)
select e.id, t.task_name, 'Pending'
from public.employees e
cross join (
  values
    ('W-4'),
    ('I-9'),
    ('Standalone Form Packet')
) as t(task_name)
where not exists (
  select 1
  from public.onboarding_tasks ot
  where ot.employee_id = e.id
    and trim(ot.task_name) = t.task_name
);
