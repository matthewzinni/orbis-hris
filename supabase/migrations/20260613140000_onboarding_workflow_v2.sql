-- Onboarding workflow v2: due dates, assignees, portal visibility, completion tracking.

create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  task_name text not null,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.onboarding_tasks
  add column if not exists due_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists show_in_portal boolean not null default true,
  add column if not exists assigned_to text not null default 'hr',
  add column if not exists reminder_sent_at timestamptz;

comment on column public.onboarding_tasks.due_date is
  'Task deadline. I-9 defaults to hire_date + 3 business days.';
comment on column public.onboarding_tasks.assigned_to is
  'employee | hr | supervisor — who owns completing this step.';
comment on column public.onboarding_tasks.show_in_portal is
  'When false, task is HR-only and hidden from My Tasks portal.';
comment on column public.onboarding_tasks.reminder_sent_at is
  'Last automated reminder email timestamp (future scheduled jobs).';

create index if not exists onboarding_tasks_employee_due_idx
  on public.onboarding_tasks (employee_id, due_date);

create index if not exists onboarding_tasks_pending_due_idx
  on public.onboarding_tasks (due_date)
  where lower(trim(status)) <> 'completed';

-- Backfill due dates from hire_date where missing.
update public.onboarding_tasks ot
set
  due_date = case trim(ot.task_name)
    when 'W-4' then e.hire_date
    when 'I-9' then (
      select d::date
      from generate_series(e.hire_date + 1, e.hire_date + 14, '1 day'::interval) gs(d)
      where extract(isodow from gs.d) < 6
      order by gs.d
      offset 2
      limit 1
    )
    when 'Standalone Form Packet' then e.hire_date + 7
    else coalesce(ot.due_date, e.hire_date)
  end,
  assigned_to = case trim(ot.task_name)
    when 'W-4' then 'employee'
    when 'I-9' then 'hr'
    when 'Standalone Form Packet' then 'employee'
    else coalesce(nullif(trim(ot.assigned_to), ''), 'hr')
  end,
  show_in_portal = coalesce(ot.show_in_portal, true)
from public.employees e
where e.id::text = ot.employee_id
  and ot.due_date is null
  and e.hire_date is not null;

update public.onboarding_tasks
set assigned_to = 'hr'
where assigned_to is null or trim(assigned_to) = '';

update public.onboarding_tasks
set show_in_portal = true
where show_in_portal is null;

update public.onboarding_tasks
set completed_at = created_at
where lower(trim(status)) = 'completed'
  and completed_at is null
  and created_at is not null;
