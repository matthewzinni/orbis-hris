-- Migration: candidate_notes table + RLS enabled (policies in 20250520120002)

create table if not exists public.candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  note_date date,
  note_type text,
  note_text text,
  created_at timestamptz not null default now()
);

create index if not exists candidate_notes_candidate_id_idx
  on public.candidate_notes (candidate_id);

create index if not exists candidate_notes_note_date_idx
  on public.candidate_notes (note_date desc);

alter table public.candidate_notes enable row level security;

-- Policies: run supabase/orbis_rls_helpers.sql then orbis_rls_policies.sql
-- (candidate_notes are admin-only via orbis_candidate_notes_admin)
