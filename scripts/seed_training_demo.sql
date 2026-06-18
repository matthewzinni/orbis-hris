-- =============================================================================
-- Northline Manufacturing — training / demo seed data (fictional only).
--
-- ⚠️  NEVER run on BTW Global production. Aborts if BTW#### employee IDs exist.
--
-- Prerequisites:
--   1. Fresh training Supabase project with npm run db:push
--   2. scripts/bootstrap_new_instance.sql (training project only)
--   3. Auth users created for demo emails (see docs/TRAINING_DEMO.md)
--
-- Safe to re-run: removes prior NLM% roster and re-seeds.
-- =============================================================================

begin;

-- Production guard
do $$
begin
  if exists (select 1 from public.employees where id like 'BTW%' limit 1) then
    raise exception
      'seed_training_demo.sql must not run on BTW production (BTW#### ids found).';
  end if;
end $$;

-- Remove prior demo roster (child tables first)
delete from public.payroll_handoffs where employee_id like 'NLM%';
delete from public.leave_requests where employee_id like 'NLM%';
delete from public.onboarding_tasks where employee_id like 'NLM%';
delete from public.employee_notes where employee_id like 'NLM%';
delete from public.employee_meetings where employee_id like 'NLM%';
delete from public.incident_reports where employee_id like 'NLM%';
delete from public.discipline_reports where employee_id like 'NLM%';
delete from public.employee_reviews where employee_id like 'NLM%';
delete from public.stay_interviews where employee_id like 'NLM%';
delete from public.emergency_contacts where employee_id like 'NLM%';
delete from public.operations_issues where related_employee_id like 'NLM%';
delete from public.employees where id like 'NLM%';

-- -----------------------------------------------------------------------------
-- Employees (~28 fictional roster)
-- -----------------------------------------------------------------------------
insert into public.employees (
  id, first_name, last_name, department, position, supervisor, status,
  hire_date, pay_type, benefits_status, next_review_date, work_email, phone,
  is_remote, pto_balance_hours, pto_balance_as_of, standard_hours
) values
  ('NLM3000', 'Jordan', 'North', 'Office', 'Chief Executive Officer', null, 'ACTIVE',
    '2018-03-01', 'Salary', 'Enrolled', '2026-12-01', 'jordan.north@northline-demo.local', '555-0100',
    false, 80, '2026-06-01', 40),
  ('NLM3001', 'Alex', 'Kim', 'Office', 'HR Director', 'Jordan North', 'ACTIVE',
    '2019-06-15', 'Salary', 'Enrolled', '2026-11-01', 'alex.kim@northline-demo.local', '555-0101',
    false, 96, '2026-06-01', 40),
  ('NLM1000', 'Sam', 'Ortiz', 'Production', 'Production Supervisor', 'Alex Kim', 'ACTIVE',
    '2017-01-10', 'Salary', 'Enrolled', '2026-10-01', 'sam.ortiz@northline-demo.local', '555-0200',
    false, 72, '2026-06-01', 40),
  ('NLM2000', 'Dana', 'Chen', 'Fulfillment', 'Fulfillment Supervisor', 'Alex Kim', 'ACTIVE',
    '2018-08-20', 'Salary', 'Enrolled', '2026-10-15', 'dana.chen@northline-demo.local', '555-0300',
    false, 88, '2026-06-01', 40),
  ('NLM1001', 'Jordan', 'Lee', 'Production', 'CNC Operator', 'Sam Ortiz', 'ACTIVE',
    '2022-04-11', 'Hourly', 'Enrolled', '2025-01-15', 'jordan.lee@northline-demo.local', '555-1001',
    false, 40, '2026-06-01', 40),
  ('NLM1002', 'Casey', 'Brooks', 'Production', 'Assembly Technician', 'Sam Ortiz', 'ACTIVE',
    '2023-02-01', 'Hourly', 'Enrolled', '2026-08-01', 'casey.brooks@northline-demo.local', '555-1002',
    false, 56, '2026-06-01', 40),
  ('NLM1003', 'Riley', 'Adams', 'Production', 'Machine Operator', 'Sam Ortiz', 'ACTIVE',
    '2021-09-14', 'Hourly', 'Enrolled', '2026-09-01', 'riley.adams@northline-demo.local', '555-1003',
    false, 32, '2026-06-01', 40),
  ('NLM1004', 'Morgan', 'Tate', 'Production', 'Lead Assembler', 'Sam Ortiz', 'ACTIVE',
    '2020-05-18', 'Hourly', 'Enrolled', '2026-07-01', 'morgan.tate@northline-demo.local', '555-1004',
    false, 64, '2026-06-01', 40),
  ('NLM1005', 'Alex', 'Rivera', 'Production', 'Quality Inspector', 'Sam Ortiz', 'ACTIVE',
    '2019-11-04', 'Hourly', 'Enrolled', '2026-09-15', 'alex.rivera@northline-demo.local', '555-1005',
    false, 48, '2026-06-01', 40),
  ('NLM1006', 'Jamie', 'Cook', 'Production', 'Fabricator', 'Sam Ortiz', 'ACTIVE',
    '2022-07-25', 'Hourly', 'Enrolled', '2026-08-15', 'jamie.cook@northline-demo.local', '555-1006',
    false, 24, '2026-06-01', 40),
  ('NLM1007', 'Taylor', 'Reed', 'Production', 'CNC Operator', 'Sam Ortiz', 'ACTIVE',
    '2023-10-02', 'Hourly', 'Enrolled', '2026-10-01', 'taylor.reed@northline-demo.local', '555-1007',
    false, 36, '2026-06-01', 40),
  ('NLM1008', 'Avery', 'Kim', 'Production', 'Maintenance Tech', 'Sam Ortiz', 'ACTIVE',
    '2018-12-03', 'Hourly', 'Enrolled', '2026-11-01', 'avery.kim@northline-demo.local', '555-1008',
    false, 52, '2026-06-01', 40),
  ('NLM1010', 'Parker', 'Ellis', 'Production', 'Assembler Trainee', 'Sam Ortiz', 'ACTIVE',
    '2026-05-20', 'Hourly', 'Pending', '2026-12-01', 'parker.ellis@northline-demo.local', '555-1010',
    false, 0, '2026-06-01', 40),
  ('NLM1101', 'Blake', 'Hayes', 'Production', 'CNC Operator II', 'Sam Ortiz', 'ACTIVE',
    '2020-01-13', 'Hourly', 'Enrolled', '2026-09-01', 'blake.hayes@northline-demo.local', '555-1101',
    false, 44, '2026-06-01', 40),
  ('NLM1102', 'Quinn', 'Walsh', 'Production', 'Welder', 'Sam Ortiz', 'ACTIVE',
    '2021-03-22', 'Hourly', 'Enrolled', '2026-09-01', 'quinn.walsh@northline-demo.local', '555-1102',
    false, 28, '2026-06-01', 40),
  ('NLM1103', 'Reese', 'Nguyen', 'Production', 'Painter', 'Sam Ortiz', 'ACTIVE',
    '2022-08-08', 'Hourly', 'Enrolled', '2026-10-01', 'reese.nguyen@northline-demo.local', '555-1103',
    false, 40, '2026-06-01', 40),
  ('NLM1104', 'Drew', 'Patel', 'Production', 'Shipping Clerk', 'Sam Ortiz', 'ACTIVE',
    '2023-04-17', 'Hourly', 'Enrolled', '2026-11-01', 'drew.patel@northline-demo.local', '555-1104',
    false, 32, '2026-06-01', 40),
  ('NLM1105', 'Skyler', 'Moore', 'Production', 'Inventory Clerk', 'Sam Ortiz', 'ACTIVE',
    '2024-01-29', 'Hourly', 'Enrolled', '2026-12-01', 'skyler.moore@northline-demo.local', '555-1105',
    false, 20, '2026-06-01', 40),
  ('NLM2001', 'Cameron', 'Lopez', 'Fulfillment', 'Picker', 'Dana Chen', 'ACTIVE',
    '2022-06-06', 'Hourly', 'Enrolled', '2026-08-01', 'cameron.lopez@northline-demo.local', '555-2001',
    false, 48, '2026-06-01', 40),
  ('NLM2002', 'Jordan', 'Price', 'Fulfillment', 'Packer', 'Dana Chen', 'ACTIVE',
    '2023-01-09', 'Hourly', 'Enrolled', '2026-09-01', 'jordan.price@northline-demo.local', '555-2002',
    false, 36, '2026-06-01', 40),
  ('NLM2003', 'Emery', 'Scott', 'Fulfillment', 'Forklift Operator', 'Dana Chen', 'ACTIVE',
    '2021-11-15', 'Hourly', 'Enrolled', '2026-09-15', 'emery.scott@northline-demo.local', '555-2003',
    false, 52, '2026-06-01', 40),
  ('NLM2004', 'Finley', 'Baker', 'Fulfillment', 'Receiving Clerk', 'Dana Chen', 'ACTIVE',
    '2020-07-27', 'Hourly', 'Enrolled', '2026-10-01', 'finley.baker@northline-demo.local', '555-2004',
    false, 44, '2026-06-01', 40),
  ('NLM2005', 'Harper', 'Ward', 'Fulfillment', 'Shift Lead', 'Dana Chen', 'ACTIVE',
    '2019-04-02', 'Hourly', 'Enrolled', '2026-10-15', 'harper.ward@northline-demo.local', '555-2005',
    false, 60, '2026-06-01', 40),
  ('NLM2006', 'Logan', 'Gray', 'Fulfillment', 'Inventory Analyst', 'Dana Chen', 'ACTIVE',
    '2022-12-12', 'Hourly', 'Enrolled', '2026-11-01', 'logan.gray@northline-demo.local', '555-2006',
    false, 40, '2026-06-01', 40),
  ('NLM4001', 'Rowan', 'Foster', 'Production', 'Remote CAD Designer', 'Sam Ortiz', 'ACTIVE',
    '2021-02-14', 'Salary', 'Enrolled', '2026-09-01', 'rowan.foster@northline-demo.local', '555-4001',
    true, 80, '2026-06-01', 40),
  ('NLM4002', 'Sage', 'Bennett', 'Production', 'Remote Planner', 'Sam Ortiz', 'ACTIVE',
    '2022-10-03', 'Salary', 'Enrolled', '2026-10-01', 'sage.bennett@northline-demo.local', '555-4002',
    true, 72, '2026-06-01', 40),
  ('NLM4003', 'River', 'Cole', 'Production', 'Remote Support Specialist', 'Sam Ortiz', 'ACTIVE',
    '2023-06-19', 'Hourly', 'Enrolled', '2026-11-01', 'river.cole@northline-demo.local', '555-4003',
    true, 56, '2026-06-01', 40),
  ('NLM9001', 'Former', 'Employee', 'Production', 'Assembler', 'Sam Ortiz', 'TERMINATED',
    '2019-01-07', 'Hourly', 'Terminated', null, null, null,
    false, 0, '2026-06-01', 40)
on conflict (id) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  department = excluded.department,
  position = excluded.position,
  supervisor = excluded.supervisor,
  status = excluded.status,
  hire_date = excluded.hire_date,
  work_email = excluded.work_email,
  is_remote = excluded.is_remote,
  next_review_date = excluded.next_review_date;

update public.employees
set termination_date = '2025-11-30'
where id = 'NLM9001';

-- -----------------------------------------------------------------------------
-- Flags, notes, HR records
-- -----------------------------------------------------------------------------
insert into public.employee_notes (employee_id, note_date, note_type, note_text) values
  ('NLM1001', '2026-05-10', 'At-Risk Flag', 'Attendance pattern and missed follow-ups after verbal coaching.'),
  ('NLM1004', '2026-04-22', 'Impact Player Flag', 'Consistently mentors new hires and exceeds production targets.'),
  ('NLM1002', '2026-06-01', 'General', 'Completed safety refresher — no issues noted.'),
  ('NLM1006', '2026-05-28', 'Coaching', 'Discussed quality checklist adherence; follow up in 30 days.');

insert into public.employee_reviews (
  employee_id, review_date, review_type,
  quality_score, attendance_score, reliability_score, communication_score,
  judgement_score, initiative_score, teamwork_score, knowledge_score, training_score,
  strengths, improvements, manager_comments
) values
  ('NLM1003', '2025-11-15', 'Annual', 4, 4, 3, 4, 4, 3, 4, 4, 3,
    'Reliable operator with strong technical skills.',
    'Continue developing proactive communication on shift handoffs.',
    'Solid performer — on track for lead role discussion next cycle.'),
  ('NLM1004', '2026-03-01', 'Annual', 5, 5, 5, 5, 4, 5, 5, 5, 4,
    'Top performer; mentors peers and drives quality improvements.',
    'Delegate more to avoid single-point dependency on the line.',
    'Impact player — recommend retention bonus consideration.');

insert into public.stay_interviews (
  employee_id, interview_date, interview_type,
  q1, q2, q3, q4, q5, q6, q7,
  manager_summary
) values (
  'NLM1004', '2026-04-10', 'Stay Interview',
  'I enjoy the team culture and clear expectations from Sam.',
  'More cross-training on the second CNC line would help my growth.',
  'Compensation is fair; I value predictable schedules most.',
  'Communication from leadership has improved this year.',
  'I would recommend Northline to a friend looking for stable manufacturing work.',
  'Nothing urgent — occasional overtime notice could be earlier.',
  'Still engaged; wants development path toward lead assembler.',
  'Morgan remains highly engaged. Schedule development check-in in Q3.'
);

insert into public.discipline_reports (
  employee_id, incident_date, issue_type, discipline_level, description, action_taken, report_status
) values (
  'NLM1006', '2026-05-20', 'Performance', 'Level 2 - Written Warning',
  'Repeated missed quality checkpoints on line 3 despite prior verbal coaching.',
  'Written warning issued; weekly quality sign-off with supervisor for 30 days.',
  'Open'
);

insert into public.incident_reports (
  employee_id, incident_date, incident_type, location, description, follow_up, status
) values (
  'NLM1005', '2026-05-15', 'Safety', 'Production Floor — Bay 2',
  'Minor near-miss: operator stepped into forklift lane without checking mirror.',
  'Refresher on pedestrian pathways scheduled; no injury.',
  'Closed'
);

insert into public.employee_meetings (
  employee_id, meeting_date, meeting_type, subject, notes, follow_up_date
) values (
  'NLM1001', '2026-05-12', 'Coaching', 'Attendance improvement plan',
  'Reviewed attendance expectations and documented mutual action items.',
  '2026-06-12'
);

insert into public.emergency_contacts (
  employee_id, contact_name, relationship, phone, alternate_phone, notes, priority_order
) values (
  'NLM1002', 'Robin Brooks', 'Spouse', '555-9002', '555-9003', 'Primary contact — weekdays after 5pm.', 1
);

insert into public.leave_requests (
  employee_id, leave_type, start_date, end_date, hours, status, notes, created_by
) values
  ('NLM1001', 'PTO', '2026-06-24', '2026-06-25', 16, 'requested',
    'Family event — pending supervisor approval.', 'jordan.lee@northline-demo.local'),
  ('NLM2002', 'PTO', '2026-05-30', '2026-05-30', 8, 'approved',
    'Approved by Dana Chen.', 'dana.chen@northline-demo.local');

update public.leave_requests
set approved_by = 'dana.chen@northline-demo.local',
    approved_at = now() - interval '7 days'
where employee_id = 'NLM2002' and status = 'approved';

insert into public.onboarding_tasks (employee_id, task_name, status) values
  ('NLM1010', 'W-4', 'Completed'),
  ('NLM1010', 'I-9', 'Pending'),
  ('NLM1010', 'Standalone Form Packet', 'Pending');

insert into public.payroll_handoffs (
  employee_id, change_type, effective_date, summary, payload, status, created_by
) values (
  'NLM1010', 'New Hire', '2026-05-20',
  'New hire Parker Ellis — hourly assembler trainee.',
  '{"department":"Production","pay_type":"Hourly"}'::jsonb,
  'pending',
  'trainer@northline-demo.local'
);

insert into public.operations_issues (
  title, category, description, impact_level, priority, status,
  department, reported_by_email, reported_by_name, related_employee_id
) values
  (
    'Label printer jamming on fulfillment line',
    'equipment',
    'Zebra printer at pack station 4 jams after ~50 labels. Slowing outbound SLA.',
    'medium', 'high', 'open',
    'Fulfillment', 'dana.chen@northline-demo.local', 'Dana Chen', null
  ),
  (
    'CNC coolant leak — Bay 1',
    'safety',
    'Small coolant leak observed near machine 12. Maintenance notified.',
    'high', 'urgent', 'investigating',
    'Production', 'sam.ortiz@northline-demo.local', 'Sam Ortiz', 'NLM1008'
  );

-- Today's attendance roll call (production team sample)
insert into public.attendance_manual_snapshots (
  attendance_date, present, absent, timezone, source, updated_by
) values (
  current_date,
  '["NLM1002","NLM1003","NLM1004","NLM1005","NLM1007","NLM1101","NLM1102","NLM2001","NLM2003"]'::jsonb,
  '["NLM1001","NLM1006","NLM1010"]'::jsonb,
  'America/Chicago',
  'manual',
  'trainer@northline-demo.local'
)
on conflict (attendance_date) do update set
  present = excluded.present,
  absent = excluded.absent,
  updated_by = excluded.updated_by,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Demo user_access (Auth users must exist first)
-- -----------------------------------------------------------------------------
insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  supervised_employee_ids,
  linked_employee_id,
  approval_status,
  can_delete,
  janus_access
) values
  (
    'trainer@northline-demo.local',
    'Training HR Admin',
    'admin',
    '',
    null,
    null,
    'approved',
    true,
    false
  ),
  (
    'supervisor@northline-demo.local',
    'Sam Ortiz (Supervisor)',
    'supervisor',
    'Sam Ortiz',
    array[
      'NLM1001','NLM1002','NLM1003','NLM1004','NLM1005','NLM1006','NLM1007','NLM1008','NLM1010',
      'NLM1101','NLM1102','NLM1103','NLM1104','NLM1105','NLM4001','NLM4002','NLM4003'
    ],
    'NLM1000',
    'approved',
    false,
    false
  ),
  (
    'lead@northline-demo.local',
    'Dana Chen (Filtered Admin)',
    'admin',
    'Dana Chen',
    array['NLM2001','NLM2002','NLM2003','NLM2004','NLM2005','NLM2006'],
    'NLM2000',
    'approved',
    false,
    false
  ),
  (
    'employee@northline-demo.local',
    'Casey Brooks (Employee)',
    'user',
    '',
    null,
    'NLM1002',
    'approved',
    false,
    false
  )
on conflict (email) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  supervisor_name = excluded.supervisor_name,
  supervised_employee_ids = excluded.supervised_employee_ids,
  linked_employee_id = excluded.linked_employee_id,
  approval_status = excluded.approval_status,
  can_delete = excluded.can_delete,
  janus_access = excluded.janus_access;

commit;

-- -----------------------------------------------------------------------------
-- Training-only: org-wide scope for trainer (this database only — not a migration)
-- -----------------------------------------------------------------------------
create or replace function public.orbis_has_hr_leadership_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(public.orbis_auth_email())) in (
    'trainer@northline-demo.local'
  );
$$;

create or replace function public.orbis_has_org_wide_attendance_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_has_hr_leadership_access();
$$;

create or replace function public.orbis_has_org_wide_performance_review_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_has_hr_leadership_access();
$$;
