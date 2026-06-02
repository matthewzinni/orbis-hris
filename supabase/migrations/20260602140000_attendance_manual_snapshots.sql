-- Manual daily attendance roll call (present / absent lists)

create table if not exists public.attendance_manual_snapshots (
  attendance_date date primary key,
  present jsonb not null default '[]'::jsonb,
  absent jsonb not null default '[]'::jsonb,
  timezone text,
  source text not null default 'manual',
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.attendance_manual_snapshots enable row level security;

drop policy if exists attendance_manual_snapshots_select on public.attendance_manual_snapshots;
create policy attendance_manual_snapshots_select on public.attendance_manual_snapshots
  for select to authenticated
  using (public.orbis_is_admin() or public.orbis_current_role() = 'supervisor');

drop policy if exists attendance_manual_snapshots_insert on public.attendance_manual_snapshots;
create policy attendance_manual_snapshots_insert on public.attendance_manual_snapshots
  for insert to authenticated
  with check (public.orbis_is_admin() or public.orbis_current_role() = 'supervisor');

drop policy if exists attendance_manual_snapshots_update on public.attendance_manual_snapshots;
create policy attendance_manual_snapshots_update on public.attendance_manual_snapshots
  for update to authenticated
  using (public.orbis_is_admin() or public.orbis_current_role() = 'supervisor');
