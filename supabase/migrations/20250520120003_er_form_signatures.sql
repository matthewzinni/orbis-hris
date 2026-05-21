-- Signature fields for incident reports and performance reviews (parity with discipline_reports)

alter table if exists public.incident_reports
  add column if not exists refused_to_sign boolean default false,
  add column if not exists employee_signature text,
  add column if not exists manager_signature text,
  add column if not exists witness_signature text;

alter table if exists public.employee_reviews
  add column if not exists refused_to_sign boolean default false,
  add column if not exists employee_signature text,
  add column if not exists manager_signature text,
  add column if not exists witness_signature text;
