-- Offboarding checklist (mirror of onboarding_tasks)

create table if not exists public.offboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  task_name text not null,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create index if not exists offboarding_tasks_employee_id_idx
  on public.offboarding_tasks (employee_id);

alter table public.offboarding_tasks enable row level security;

drop policy if exists orbis_offboarding_tasks_select on public.offboarding_tasks;
create policy orbis_offboarding_tasks_select on public.offboarding_tasks
  for select to authenticated
  using (public.orbis_is_admin());

drop policy if exists orbis_offboarding_tasks_insert on public.offboarding_tasks;
create policy orbis_offboarding_tasks_insert on public.offboarding_tasks
  for insert to authenticated
  with check (public.orbis_is_admin());

drop policy if exists orbis_offboarding_tasks_update on public.offboarding_tasks;
create policy orbis_offboarding_tasks_update on public.offboarding_tasks
  for update to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_offboarding_tasks_delete on public.offboarding_tasks;
create policy orbis_offboarding_tasks_delete on public.offboarding_tasks
  for delete to authenticated
  using (public.orbis_is_admin());

-- Seed standard checklist for employees already terminated
insert into public.offboarding_tasks (employee_id, task_name, status)
select e.id, t.task_name, 'Pending'
from public.employees e
cross join (
  values
    ('Exit interview'),
    ('Payroll notified (final pay)'),
    ('Equipment returned'),
    ('System access revoked'),
    ('COBRA / benefits separation'),
    ('Final attendance to payroll')
) as t(task_name)
where upper(trim(coalesce(e.status, ''))) = 'TERMINATED'
  and not exists (
    select 1
    from public.offboarding_tasks ot
    where ot.employee_id = e.id
      and trim(ot.task_name) = t.task_name
  );
