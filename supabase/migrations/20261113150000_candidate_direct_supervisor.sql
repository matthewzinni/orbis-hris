-- Direct supervisor on candidate records (Hiring Checklist).
-- The person the candidate will report to, e.g. the supervisor who runs the supervisor interview.

alter table public.candidates
  add column if not exists direct_supervisor text;

comment on column public.candidates.direct_supervisor is
  'Direct supervisor the candidate will report to; runs the supervisor interview.';
