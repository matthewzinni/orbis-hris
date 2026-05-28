-- AI-generated HR guidance (next steps + compliance checklist) for investigation cases.
-- Review and edit before relying on; not a substitute for employment counsel.

alter table public.investigations
  add column if not exists ai_guidance text;

comment on column public.investigations.ai_guidance is
  'Editable AI-assisted next steps and discipline/termination compliance notes for investigators.';
