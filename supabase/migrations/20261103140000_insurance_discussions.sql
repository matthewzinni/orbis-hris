-- HR's record of which employees have had the insurance conversation (dashboard check-off).
create table if not exists public.insurance_discussions (
  employee_id text primary key,
  discussed_by text not null,
  discussed_at timestamptz not null default now()
);

alter table public.insurance_discussions enable row level security;
revoke all on public.insurance_discussions from anon, authenticated;
grant select, insert, update, delete on public.insurance_discussions to authenticated;
grant all on public.insurance_discussions to service_role;

create policy insurance_discussions_admin_all on public.insurance_discussions
for all to authenticated
using (public.orbis_is_admin())
with check (public.orbis_is_admin() and lower(trim(discussed_by)) = public.orbis_auth_email());
