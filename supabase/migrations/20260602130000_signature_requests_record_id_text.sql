-- Discipline/incident/review primary keys are not always UUIDs (e.g. serial ids).

alter table public.signature_requests
  alter column record_id type text using record_id::text;
