-- Employee the allegation / wrongdoing is directed at

alter table public.investigations
  add column if not exists targeted_employee_id text;

create index if not exists investigations_targeted_employee_idx
  on public.investigations (targeted_employee_id)
  where targeted_employee_id is not null;
