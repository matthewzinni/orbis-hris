-- Payroll handoff log (changes sent to external payroll — not pay calculation)

create table if not exists public.payroll_handoffs (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  change_type text not null,
  effective_date date not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  sent_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by text,
  notes text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists payroll_handoffs_employee_id_idx
  on public.payroll_handoffs (employee_id);

create index if not exists payroll_handoffs_status_idx
  on public.payroll_handoffs (status);

alter table public.payroll_handoffs enable row level security;

drop policy if exists payroll_handoffs_select on public.payroll_handoffs;
create policy payroll_handoffs_select on public.payroll_handoffs
  for select to authenticated
  using (public.orbis_is_admin());

drop policy if exists payroll_handoffs_insert on public.payroll_handoffs;
create policy payroll_handoffs_insert on public.payroll_handoffs
  for insert to authenticated
  with check (public.orbis_is_admin());

drop policy if exists payroll_handoffs_update on public.payroll_handoffs;
create policy payroll_handoffs_update on public.payroll_handoffs
  for update to authenticated
  using (public.orbis_is_admin())
  with check (public.orbis_is_admin());

drop policy if exists payroll_handoffs_delete on public.payroll_handoffs;
create policy payroll_handoffs_delete on public.payroll_handoffs
  for delete to authenticated
  using (public.orbis_is_admin());
