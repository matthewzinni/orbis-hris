-- Discipline level column used for at-risk / turnover risk (Final Warning+).
alter table public.discipline_reports
  add column if not exists discipline_level text;

comment on column public.discipline_reports.discipline_level is
  'Progressive discipline level (e.g. Level 4 - Final Warning). Drives at-risk and turnover risk KPIs.';
