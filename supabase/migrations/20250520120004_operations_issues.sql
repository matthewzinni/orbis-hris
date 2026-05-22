-- Operations Issues / Resolution Center

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.operations_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'other',
  system_affected text,
  description text not null,
  impact_level text not null default 'medium',
  priority text not null default 'normal',
  status text not null default 'open',
  is_recurring boolean not null default false,
  department text not null,
  reported_by_email text not null,
  reported_by_name text,
  assigned_to_email text,
  assigned_to_name text,
  related_employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_date date,
  resolved_at timestamptz,
  resolution_notes text,
  root_cause text,
  created_by uuid,
  updated_by uuid,
  constraint operations_issues_category_check check (
    category in (
      'software', 'equipment', 'workflow', 'fulfillment', 'production',
      'integration', 'communication', 'process_improvement', 'safety', 'other'
    )
  ),
  constraint operations_issues_impact_check check (
    impact_level in ('low', 'medium', 'high', 'critical')
  ),
  constraint operations_issues_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint operations_issues_status_check check (
    status in ('open', 'investigating', 'in_progress', 'waiting', 'resolved', 'closed')
  )
);

create index if not exists operations_issues_status_idx
  on public.operations_issues (status);
create index if not exists operations_issues_department_idx
  on public.operations_issues (department);
create index if not exists operations_issues_priority_idx
  on public.operations_issues (priority);
create index if not exists operations_issues_created_at_idx
  on public.operations_issues (created_at desc);

create table if not exists public.operations_issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.operations_issues(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  mime_type text,
  file_size bigint,
  uploaded_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists operations_issue_attachments_issue_idx
  on public.operations_issue_attachments (issue_id);

create table if not exists public.operations_issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.operations_issues(id) on delete cascade,
  event_type text not null,
  field_name text,
  old_value text,
  new_value text,
  note text,
  actor_email text not null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists operations_issue_events_issue_idx
  on public.operations_issue_events (issue_id, created_at desc);

create or replace function public.operations_issues_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operations_issues_updated_at on public.operations_issues;
create trigger operations_issues_updated_at
  before update on public.operations_issues
  for each row execute function public.operations_issues_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.orbis_supervisor_departments()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(trim(coalesce(e.department, '')))
  from public.employees e
  where public.orbis_is_supervisor()
    and trim(coalesce(e.department, '')) <> ''
    and public.orbis_supervisor_matches(
      coalesce(e.supervisor, ''),
      public.orbis_supervisor_scope_name()
    );
$$;

create or replace function public.orbis_operations_issue_visible(issue public.operations_issues)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and (
        lower(trim(issue.department)) in (select public.orbis_supervisor_departments())
        or lower(trim(issue.reported_by_email)) = public.orbis_auth_email()
        or lower(trim(coalesce(issue.assigned_to_email, ''))) = public.orbis_auth_email()
      )
    );
$$;

grant execute on function public.orbis_supervisor_departments() to authenticated;
grant execute on function public.orbis_operations_issue_visible(public.operations_issues) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.operations_issues enable row level security;
alter table public.operations_issue_attachments enable row level security;
alter table public.operations_issue_events enable row level security;

drop policy if exists orbis_operations_issues_select on public.operations_issues;
create policy orbis_operations_issues_select
  on public.operations_issues for select to authenticated
  using (public.orbis_operations_issue_visible(operations_issues));

drop policy if exists orbis_operations_issues_insert on public.operations_issues;
create policy orbis_operations_issues_insert
  on public.operations_issues for insert to authenticated
  with check (
    public.orbis_is_admin()
    or public.orbis_is_supervisor()
  );

drop policy if exists orbis_operations_issues_update on public.operations_issues;
create policy orbis_operations_issues_update
  on public.operations_issues for update to authenticated
  using (public.orbis_operations_issue_visible(operations_issues))
  with check (public.orbis_operations_issue_visible(operations_issues));

drop policy if exists orbis_operations_issues_delete on public.operations_issues;
create policy orbis_operations_issues_delete
  on public.operations_issues for delete to authenticated
  using (public.orbis_is_admin());

drop policy if exists orbis_operations_issue_attachments_select on public.operations_issue_attachments;
create policy orbis_operations_issue_attachments_select
  on public.operations_issue_attachments for select to authenticated
  using (
    exists (
      select 1 from public.operations_issues i
      where i.id = issue_id
      and public.orbis_operations_issue_visible(i)
    )
  );

drop policy if exists orbis_operations_issue_attachments_insert on public.operations_issue_attachments;
create policy orbis_operations_issue_attachments_insert
  on public.operations_issue_attachments for insert to authenticated
  with check (
    exists (
      select 1 from public.operations_issues i
      where i.id = issue_id
      and public.orbis_operations_issue_visible(i)
    )
  );

drop policy if exists orbis_operations_issue_attachments_delete on public.operations_issue_attachments;
create policy orbis_operations_issue_attachments_delete
  on public.operations_issue_attachments for delete to authenticated
  using (
    public.orbis_is_admin()
    or exists (
      select 1 from public.operations_issues i
      where i.id = issue_id
      and public.orbis_operations_issue_visible(i)
    )
  );

drop policy if exists orbis_operations_issue_events_select on public.operations_issue_events;
create policy orbis_operations_issue_events_select
  on public.operations_issue_events for select to authenticated
  using (
    exists (
      select 1 from public.operations_issues i
      where i.id = issue_id
      and public.orbis_operations_issue_visible(i)
    )
  );

drop policy if exists orbis_operations_issue_events_insert on public.operations_issue_events;
create policy orbis_operations_issue_events_insert
  on public.operations_issue_events for insert to authenticated
  with check (
    exists (
      select 1 from public.operations_issues i
      where i.id = issue_id
      and public.orbis_operations_issue_visible(i)
    )
  );
