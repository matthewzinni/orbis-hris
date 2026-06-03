-- Time off / leave requests (approval workflow — not PTO accrual math)

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  leave_type text not null,
  start_date date not null,
  end_date date,
  hours numeric,
  status text not null default 'requested',
  intermittent boolean not null default false,
  notes text,
  approved_by text,
  approved_at timestamptz,
  payroll_notified boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists leave_requests_employee_id_idx
  on public.leave_requests (employee_id);

create index if not exists leave_requests_status_idx
  on public.leave_requests (status);

create index if not exists leave_requests_start_date_idx
  on public.leave_requests (start_date);

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (public.orbis_employee_child_accessible(employee_id::text));

drop policy if exists leave_requests_insert on public.leave_requests;
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
  );

drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests
  for update to authenticated
  using (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
  )
  with check (
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id::text)
    )
  );

drop policy if exists leave_requests_delete on public.leave_requests;
create policy leave_requests_delete on public.leave_requests
  for delete to authenticated
  using (public.orbis_is_admin());
