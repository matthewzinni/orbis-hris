-- HR Investigations (Phase 1) — admin-only access

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  title text not null,
  allegation_summary text,
  category text not null default 'other',
  source_of_complaint text,
  reported_by_name text,
  reported_by_email text,
  status text not null default 'intake',
  severity text not null default 'medium',
  assigned_investigator_email text,
  assigned_investigator_name text,
  opened_at date not null default current_date,
  target_completion_date date,
  closed_at timestamptz,
  findings_summary text,
  outcome text,
  recommended_action text,
  follow_up_date date,
  confidential_notes text,
  witnesses text,
  primary_employee_id text,
  linked_incident_report_id uuid,
  linked_discipline_report_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text,
  updated_by_email text,
  constraint investigations_category_check check (
    category in (
      'harassment', 'discrimination', 'workplace_conflict', 'policy_violation',
      'safety', 'complaint', 'rumor', 'disciplinary', 'other'
    )
  ),
  constraint investigations_status_check check (
    status in (
      'intake', 'open', 'interviewing', 'evidence_review',
      'findings_drafted', 'action_pending', 'closed'
    )
  ),
  constraint investigations_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint investigations_outcome_check check (
    outcome is null or outcome in (
      'unsubstantiated', 'substantiated', 'inconclusive', 'policy_reminder',
      'coaching', 'corrective_action', 'termination_recommended',
      'process_improvement', 'referred_to_leadership'
    )
  )
);

create index if not exists investigations_status_idx on public.investigations (status);
create index if not exists investigations_severity_idx on public.investigations (severity);
create index if not exists investigations_opened_at_idx on public.investigations (opened_at desc);
create index if not exists investigations_assigned_idx on public.investigations (assigned_investigator_email);

create table if not exists public.investigation_subjects (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  employee_id text not null,
  subject_role text not null default 'other',
  display_name text,
  created_at timestamptz not null default now(),
  constraint investigation_subjects_role_check check (
    subject_role in ('complainant', 'respondent', 'witness', 'supervisor', 'other')
  )
);

create index if not exists investigation_subjects_investigation_idx
  on public.investigation_subjects (investigation_id);

create table if not exists public.investigation_interviews (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  interview_type text not null default 'other',
  interview_date date,
  interviewer_email text,
  interviewer_name text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investigation_interviews_type_check check (
    interview_type in ('complainant', 'respondent', 'witness', 'supervisor', 'other')
  )
);

create index if not exists investigation_interviews_investigation_idx
  on public.investigation_interviews (investigation_id, interview_date desc);

create table if not exists public.investigation_timeline (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  event_type text not null,
  note text,
  actor_email text not null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists investigation_timeline_investigation_idx
  on public.investigation_timeline (investigation_id, created_at desc);

create table if not exists public.investigation_evidence (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  evidence_type text not null default 'file',
  title text not null,
  file_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  linked_record_id text,
  linked_record_type text,
  external_url text,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  constraint investigation_evidence_type_check check (
    evidence_type in (
      'file', 'link', 'incident_report', 'discipline_report',
      'meeting_note', 'email', 'statement', 'other'
    )
  )
);

create index if not exists investigation_evidence_investigation_idx
  on public.investigation_evidence (investigation_id);

create or replace function public.investigations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists investigations_updated_at on public.investigations;
create trigger investigations_updated_at
  before update on public.investigations
  for each row execute function public.investigations_set_updated_at();

create or replace function public.investigation_interviews_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists investigation_interviews_updated_at on public.investigation_interviews;
create trigger investigation_interviews_updated_at
  before update on public.investigation_interviews
  for each row execute function public.investigation_interviews_set_updated_at();

create or replace function public.next_investigation_case_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yr text := to_char(current_date, 'YYYY');
  seq int;
begin
  select coalesce(
    max(
      nullif(
        regexp_replace(case_number, '^INV-' || yr || '-', ''),
        ''
      )::int
    ),
    0
  ) + 1
  into seq
  from public.investigations
  where case_number like 'INV-' || yr || '-%';

  return 'INV-' || yr || '-' || lpad(seq::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.orbis_can_access_investigations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin();
$$;

create or replace function public.orbis_investigation_visible(inv public.investigations)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin();
$$;

grant execute on function public.next_investigation_case_number() to authenticated;
grant execute on function public.orbis_can_access_investigations() to authenticated;
grant execute on function public.orbis_investigation_visible(public.investigations) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies (admin only — Phase 1)
-- ---------------------------------------------------------------------------

alter table public.investigations enable row level security;
alter table public.investigation_subjects enable row level security;
alter table public.investigation_interviews enable row level security;
alter table public.investigation_timeline enable row level security;
alter table public.investigation_evidence enable row level security;

grant select, insert, update, delete on table public.investigations to authenticated;
grant select, insert, update, delete on table public.investigation_subjects to authenticated;
grant select, insert, update, delete on table public.investigation_interviews to authenticated;
grant select, insert, update, delete on table public.investigation_timeline to authenticated;
grant select, insert, update, delete on table public.investigation_evidence to authenticated;

drop policy if exists orbis_investigations_select on public.investigations;
create policy orbis_investigations_select
  on public.investigations for select to authenticated
  using (public.orbis_investigation_visible(investigations));

drop policy if exists orbis_investigations_insert on public.investigations;
create policy orbis_investigations_insert
  on public.investigations for insert to authenticated
  with check (public.orbis_is_admin());

drop policy if exists orbis_investigations_update on public.investigations;
create policy orbis_investigations_update
  on public.investigations for update to authenticated
  using (public.orbis_investigation_visible(investigations))
  with check (public.orbis_is_admin());

drop policy if exists orbis_investigations_delete on public.investigations;
create policy orbis_investigations_delete
  on public.investigations for delete to authenticated
  using (public.orbis_is_admin());

drop policy if exists orbis_investigation_subjects_all on public.investigation_subjects;
create policy orbis_investigation_subjects_all
  on public.investigation_subjects for all to authenticated
  using (
    exists (
      select 1 from public.investigations i
      where i.id = investigation_id and public.orbis_investigation_visible(i)
    )
  )
  with check (public.orbis_is_admin());

drop policy if exists orbis_investigation_interviews_all on public.investigation_interviews;
create policy orbis_investigation_interviews_all
  on public.investigation_interviews for all to authenticated
  using (
    exists (
      select 1 from public.investigations i
      where i.id = investigation_id and public.orbis_investigation_visible(i)
    )
  )
  with check (public.orbis_is_admin());

drop policy if exists orbis_investigation_timeline_all on public.investigation_timeline;
create policy orbis_investigation_timeline_all
  on public.investigation_timeline for all to authenticated
  using (
    exists (
      select 1 from public.investigations i
      where i.id = investigation_id and public.orbis_investigation_visible(i)
    )
  )
  with check (public.orbis_is_admin());

drop policy if exists orbis_investigation_evidence_all on public.investigation_evidence;
create policy orbis_investigation_evidence_all
  on public.investigation_evidence for all to authenticated
  using (
    exists (
      select 1 from public.investigations i
      where i.id = investigation_id and public.orbis_investigation_visible(i)
    )
  )
  with check (public.orbis_is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'investigations-evidence',
  'investigations-evidence',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'message/rfc822'
  ]
)
on conflict (id) do nothing;

drop policy if exists orbis_investigations_storage_select on storage.objects;
create policy orbis_investigations_storage_select
  on storage.objects for select to authenticated
  using (bucket_id = 'investigations-evidence' and public.orbis_is_admin());

drop policy if exists orbis_investigations_storage_insert on storage.objects;
create policy orbis_investigations_storage_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'investigations-evidence' and public.orbis_is_admin());

drop policy if exists orbis_investigations_storage_delete on storage.objects;
create policy orbis_investigations_storage_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'investigations-evidence' and public.orbis_is_admin());
