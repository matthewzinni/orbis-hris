-- Focus subjects + reported-by employee reference

alter table public.investigations
  add column if not exists reported_by_employee_id text;

alter table public.investigation_subjects
  drop constraint if exists investigation_subjects_role_check;

alter table public.investigation_subjects
  add constraint investigation_subjects_role_check check (
    subject_role in (
      'complainant', 'respondent', 'witness', 'supervisor', 'other', 'focus'
    )
  );
