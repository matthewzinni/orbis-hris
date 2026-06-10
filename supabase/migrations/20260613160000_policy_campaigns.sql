-- Policy acknowledgment campaigns: assign documents by department/position, track completion.

create table if not exists public.policy_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  document_library_id uuid,
  document_title text not null default '',
  due_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  target_all_active boolean not null default false,
  target_departments text[] not null default '{}',
  target_positions text[] not null default '{}',
  created_by_email text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_campaign_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.policy_campaigns(id) on delete cascade,
  employee_id text not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'overdue')),
  completed_at timestamptz,
  acknowledgment_id uuid references public.employee_acknowledgments(id) on delete set null,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, employee_id)
);

create index if not exists policy_campaigns_status_due_idx
  on public.policy_campaigns (status, due_date);

create index if not exists policy_campaign_assignments_campaign_idx
  on public.policy_campaign_assignments (campaign_id);

create index if not exists policy_campaign_assignments_employee_idx
  on public.policy_campaign_assignments (employee_id);

create index if not exists policy_campaign_assignments_overdue_idx
  on public.policy_campaign_assignments (due_date, status)
  where status in ('pending', 'overdue');

alter table public.policy_campaigns enable row level security;
alter table public.policy_campaign_assignments enable row level security;

drop policy if exists orbis_policy_campaigns_select on public.policy_campaigns;
create policy orbis_policy_campaigns_select
  on public.policy_campaigns
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or public.orbis_is_supervisor()
    or public.orbis_has_personal_portal()
  );

drop policy if exists orbis_policy_campaigns_insert on public.policy_campaigns;
create policy orbis_policy_campaigns_insert
  on public.policy_campaigns
  for insert
  to authenticated
  with check (public.orbis_is_admin());

drop policy if exists orbis_policy_campaigns_update on public.policy_campaigns;
create policy orbis_policy_campaigns_update
  on public.policy_campaigns
  for update
  to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists orbis_policy_campaigns_delete on public.policy_campaigns;
create policy orbis_policy_campaigns_delete
  on public.policy_campaigns
  for delete
  to authenticated
  using (public.orbis_is_admin());

drop policy if exists orbis_policy_campaign_assignments_select on public.policy_campaign_assignments;
create policy orbis_policy_campaign_assignments_select
  on public.policy_campaign_assignments
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  );

drop policy if exists orbis_policy_campaign_assignments_insert on public.policy_campaign_assignments;
create policy orbis_policy_campaign_assignments_insert
  on public.policy_campaign_assignments
  for insert
  to authenticated
  with check (public.orbis_is_admin());

drop policy if exists orbis_policy_campaign_assignments_update on public.policy_campaign_assignments;
create policy orbis_policy_campaign_assignments_update
  on public.policy_campaign_assignments
  for update
  to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
  )
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
  );

drop policy if exists orbis_policy_campaign_assignments_delete on public.policy_campaign_assignments;
create policy orbis_policy_campaign_assignments_delete
  on public.policy_campaign_assignments
  for delete
  to authenticated
  using (public.orbis_is_admin());

grant select, insert, update, delete on public.policy_campaigns to authenticated;
grant select, insert, update, delete on public.policy_campaign_assignments to authenticated;
