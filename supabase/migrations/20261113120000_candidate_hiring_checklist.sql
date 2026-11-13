-- Hiring checklist on candidate records (BTW hiring process).
-- Flow: need or referral -> Cole approves budget -> HR screening -> supervisor interview
-- -> decision within 5 business days, with the department's C-Suite leader kept informed.

alter table public.candidates
  add column if not exists requested_by text,
  add column if not exists hire_approved_date date,
  add column if not exists csuite_leader text,
  add column if not exists csuite_notified_date date,
  add column if not exists screening_completed_date date,
  add column if not exists supervisor_interview_completed_date date;

comment on column public.candidates.requested_by is
  'Employee who referred the candidate, or the team lead who requested the hire.';
comment on column public.candidates.hire_approved_date is
  'Date Cole confirmed the company can afford this hire. Required before screening.';
comment on column public.candidates.csuite_leader is
  'C-Suite leader over the hiring department, kept informed throughout.';
comment on column public.candidates.csuite_notified_date is
  'Date the C-Suite leader was told about the candidate.';
comment on column public.candidates.screening_completed_date is
  'Date HR completed the initial screening interview.';
comment on column public.candidates.supervisor_interview_completed_date is
  'Date the department supervisor interview was completed. Decision is due 5 business days later.';

create index if not exists candidates_supervisor_interview_completed_date_idx
  on public.candidates (supervisor_interview_completed_date)
  where supervisor_interview_completed_date is not null;
