-- Link a candidate record to an existing employee (internal mobility / promotion pipeline).

alter table public.candidates
  add column if not exists linked_employee_id text;

comment on column public.candidates.linked_employee_id is
  'When set, this candidate is an existing employee applying for another position (employees.id).';

create index if not exists candidates_linked_employee_id_idx
  on public.candidates (linked_employee_id)
  where linked_employee_id is not null and btrim(linked_employee_id) <> '';
