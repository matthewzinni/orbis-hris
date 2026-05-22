-- Multiple targeted employees (subject_role = targeted)

alter table public.investigation_subjects
  drop constraint if exists investigation_subjects_role_check;

alter table public.investigation_subjects
  add constraint investigation_subjects_role_check check (
    subject_role in (
      'complainant', 'respondent', 'witness', 'supervisor', 'other', 'focus', 'targeted'
    )
  );
