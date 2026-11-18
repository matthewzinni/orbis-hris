-- Immutable, admin-only briefing versions. No changes to employee records.
create table public.leadership_briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  period_start date not null,
  period_end date not null,
  snapshot jsonb not null,
  constraint leadership_briefing_week check (period_end = period_start + 6),
  constraint leadership_briefing_object check (jsonb_typeof(snapshot) = 'object')
);
create index leadership_briefings_created_idx on public.leadership_briefings (created_at desc);
alter table public.leadership_briefings enable row level security;
create policy leadership_briefings_admin_read on public.leadership_briefings
  for select to authenticated using (public.orbis_is_admin());
create policy leadership_briefings_admin_insert on public.leadership_briefings
  for insert to authenticated with check (public.orbis_is_admin() and created_by = auth.uid());
revoke all on public.leadership_briefings from anon, authenticated;
grant select, insert on public.leadership_briefings to authenticated;
