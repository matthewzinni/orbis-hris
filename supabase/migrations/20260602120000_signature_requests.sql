-- Remote e-sign requests (public completion via edge function + token)

create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  form_type text not null check (form_type in ('discipline', 'incident', 'review')),
  record_id text not null,
  employee_id text not null,
  signer_role text not null check (signer_role in ('employee', 'manager', 'witness')),
  signer_name text,
  signer_email text,
  status text not null default 'pending' check (status in ('pending', 'signed', 'expired', 'cancelled')),
  signature_data text,
  signed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists signature_requests_token_idx on public.signature_requests (token);
create index if not exists signature_requests_record_idx on public.signature_requests (form_type, record_id);

alter table public.signature_requests enable row level security;

drop policy if exists signature_requests_select on public.signature_requests;
create policy signature_requests_select on public.signature_requests
  for select to authenticated
  using (public.orbis_is_admin() or public.orbis_current_role() = 'supervisor');

drop policy if exists signature_requests_insert on public.signature_requests;
create policy signature_requests_insert on public.signature_requests
  for insert to authenticated
  with check (public.orbis_is_admin() or public.orbis_current_role() = 'supervisor');

drop policy if exists signature_requests_update on public.signature_requests;
create policy signature_requests_update on public.signature_requests
  for update to authenticated
  using (public.orbis_is_admin() or public.orbis_current_role() = 'supervisor');
