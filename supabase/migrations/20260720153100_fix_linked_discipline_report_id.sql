-- Fix investigations.linked_discipline_report_id type (was uuid; discipline_reports.id is bigint).

alter table public.investigations
  drop column if exists linked_discipline_report_id;

alter table public.investigations
  add column linked_discipline_report_id bigint
    references public.discipline_reports(id)
    on delete set null;

comment on column public.investigations.linked_discipline_report_id is
  'Optional link to discipline_reports.id (bigint).';

create index if not exists investigations_linked_discipline_report_id_idx
  on public.investigations (linked_discipline_report_id)
  where linked_discipline_report_id is not null;
