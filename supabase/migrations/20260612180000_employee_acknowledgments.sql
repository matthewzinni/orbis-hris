-- Employee acknowledgments (handbook, policy) + portal access to own signing requests.

create table if not exists public.employee_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  acknowledgment_type text not null check (
    acknowledgment_type in ('handbook', 'policy', 'other')
  ),
  document_library_id uuid,
  document_title text not null default '',
  notes text,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists employee_acknowledgments_handbook_uniq
  on public.employee_acknowledgments (employee_id, acknowledgment_type, coalesce(document_library_id::text, document_title))
  where acknowledgment_type = 'handbook';

create index if not exists employee_acknowledgments_employee_idx
  on public.employee_acknowledgments (employee_id);

alter table public.employee_acknowledgments enable row level security;

drop policy if exists orbis_employee_acknowledgments_select on public.employee_acknowledgments;
create policy orbis_employee_acknowledgments_select
  on public.employee_acknowledgments
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_is_employee()
      and employee_id = public.orbis_linked_employee_id()
    )
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  );

drop policy if exists orbis_employee_acknowledgments_insert on public.employee_acknowledgments;
create policy orbis_employee_acknowledgments_insert
  on public.employee_acknowledgments
  for insert
  to authenticated
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_employee()
      and employee_id = public.orbis_linked_employee_id()
    )
  );

drop policy if exists orbis_employee_acknowledgments_delete on public.employee_acknowledgments;
create policy orbis_employee_acknowledgments_delete
  on public.employee_acknowledgments
  for delete
  to authenticated
  using (public.orbis_is_admin());

-- Employees may read their own pending signature requests in the portal.
drop policy if exists signature_requests_select on public.signature_requests;
create policy signature_requests_select on public.signature_requests
  for select
  to authenticated
  using (
    public.orbis_is_admin()
    or public.orbis_current_role() = 'supervisor'
    or (
      public.orbis_is_employee()
      and employee_id = public.orbis_linked_employee_id()
    )
  );
