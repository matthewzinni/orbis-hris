-- Fictional participant used to validate the Leadership Academy experience.
-- This record is intentionally labeled TEST so it cannot be confused with a
-- real BTW Global employee.

insert into public.employees (
  id,
  first_name,
  last_name,
  department,
  position,
  supervisor,
  hire_date,
  status,
  pay_type,
  standard_hours,
  benefits_status,
  work_email,
  notes,
  rehire_eligible,
  is_remote
)
values (
  'TEST-LDR-001',
  'Jordan',
  'Test',
  'Learning and Development',
  'Leadership Academy Test Participant',
  'Training Administrator',
  current_date,
  'Active',
  'Hourly',
  40,
  'Not Eligible...Fictional Test Record',
  'leadership.participant@northline-demo.local',
  'FICTIONAL TEST RECORD...Created only to validate the Orbis Leadership Academy participant experience.',
  false,
  false
)
on conflict (id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  department = excluded.department,
  position = excluded.position,
  supervisor = excluded.supervisor,
  status = excluded.status,
  work_email = excluded.work_email,
  notes = excluded.notes;

insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  linked_employee_id,
  approval_status,
  can_delete,
  janus_access
)
values (
  'leadership.participant@northline-demo.local',
  'Jordan Test...Fictional Leadership Participant',
  'user',
  'Training Administrator',
  'TEST-LDR-001',
  'approved',
  false,
  false
)
on conflict (email) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  supervisor_name = excluded.supervisor_name,
  linked_employee_id = excluded.linked_employee_id,
  approval_status = excluded.approval_status,
  can_delete = excluded.can_delete,
  janus_access = excluded.janus_access;

insert into public.leadership_enrollments (
  employee_id,
  tier_id,
  enrolled_by_email,
  assigned_at,
  due_date,
  status,
  completion_percent,
  notes
)
select
  'TEST-LDR-001',
  t.id,
  'matthew.zinni@btwglobal.com',
  now(),
  current_date + 30,
  'not_started',
  0,
  'FICTIONAL TEST ENROLLMENT...Leadership Academy participant validation.'
from public.leadership_program_tiers t
where t.name = 'Emerging Leader'
  and not exists (
    select 1
    from public.leadership_enrollments e
    where e.employee_id = 'TEST-LDR-001'
      and e.tier_id = t.id
      and e.status <> 'withdrawn'
  );
