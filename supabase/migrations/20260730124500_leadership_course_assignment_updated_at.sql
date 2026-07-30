-- The core Leadership Academy migration attaches the shared updated_at
-- trigger to course assignments. Add the matching column so progress
-- recalculation can update assignments successfully.

alter table public.leadership_course_assignments
  add column if not exists updated_at timestamptz not null default now();
