-- Employee Navigator benefits snapshot for the employee drawer "Benefits" tab.
-- HR imports EN's Row-Based ad hoc report (CSV) in Orbis; the browser parses it,
-- matches EN people to Orbis employees, and saves the current snapshot through
-- orbis_replace_employee_navigator_snapshot(). No SSNs or emails are stored.
-- HR administrators only: read via RLS, write only via the RPC.

create table if not exists public.employee_navigator_imports (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  imported_by uuid default auth.uid(),
  source_filename text,
  row_count integer not null default 0,
  people_count integer not null default 0,
  matched_count integer not null default 0,
  -- EN people not linked to an Orbis employee: [{name, hire_date, employment_status, reason}]
  unmatched jsonb not null default '[]'::jsonb
);

-- Confirmed EN person → Orbis employee links, reused by later imports.
-- person_key = normalized "first|last|hire date" from EN (legal names).
create table if not exists public.employee_navigator_links (
  person_key text primary key,
  employee_id text not null,
  en_name text,
  linked_by uuid default auth.uid(),
  linked_at timestamptz not null default now()
);

create table if not exists public.employee_navigator_people (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.employee_navigator_imports(id) on delete cascade,
  person_key text not null,
  employee_id text,
  match_method text,
  first_name text not null default '',
  last_name text not null default '',
  preferred_name text,
  employment_status text,
  hire_date date,
  dependents jsonb not null default '[]'::jsonb,
  unique (import_id, person_key)
);
create index if not exists employee_navigator_people_employee_idx
  on public.employee_navigator_people (employee_id);

create table if not exists public.employee_benefit_enrollments (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.employee_navigator_imports(id) on delete cascade,
  person_key text not null,
  relationship text not null default 'Employee',
  member_name text not null default '',
  plan_type text not null,
  carrier text,
  plan_name text,
  coverage_level text,
  effective_date date,
  end_date date,
  status text not null check (status in ('enrolled', 'waived')),
  decline_reason text,
  cost_per_pay numeric(10, 2),
  benefit_amount numeric(12, 2)
);
create index if not exists employee_benefit_enrollments_person_idx
  on public.employee_benefit_enrollments (import_id, person_key);

alter table public.employee_navigator_imports enable row level security;
alter table public.employee_navigator_links enable row level security;
alter table public.employee_navigator_people enable row level security;
alter table public.employee_benefit_enrollments enable row level security;

revoke all on public.employee_navigator_imports, public.employee_navigator_links,
  public.employee_navigator_people, public.employee_benefit_enrollments from anon, authenticated;
grant select on public.employee_navigator_imports, public.employee_navigator_links,
  public.employee_navigator_people, public.employee_benefit_enrollments to authenticated;
grant all on public.employee_navigator_imports, public.employee_navigator_links,
  public.employee_navigator_people, public.employee_benefit_enrollments to service_role;

create policy employee_navigator_imports_admin_select on public.employee_navigator_imports
  for select to authenticated using (public.orbis_is_admin());
create policy employee_navigator_links_admin_select on public.employee_navigator_links
  for select to authenticated using (public.orbis_is_admin());
create policy employee_navigator_people_admin_select on public.employee_navigator_people
  for select to authenticated using (public.orbis_is_admin());
create policy employee_benefit_enrollments_admin_select on public.employee_benefit_enrollments
  for select to authenticated using (public.orbis_is_admin());

-- Atomically replace the current snapshot. Earlier import rows are kept as history
-- (counts + unmatched list); their people/enrollment rows are removed.
create or replace function public.orbis_replace_employee_navigator_snapshot(
  p_source_filename text,
  p_row_count integer,
  p_people jsonb,
  p_enrollments jsonb,
  p_links jsonb,
  p_unmatched jsonb
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  new_import_id uuid;
begin
  if not coalesce(public.orbis_is_admin(), false) then
    raise exception 'Only HR administrators can import Employee Navigator data' using errcode = '42501';
  end if;
  if jsonb_typeof(p_people) <> 'array' or jsonb_typeof(p_enrollments) <> 'array'
     or jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid Employee Navigator import payload';
  end if;

  -- One import at a time.
  perform pg_advisory_xact_lock(hashtext('orbis_employee_navigator_import'));

  insert into public.employee_navigator_imports (
    source_filename, row_count, people_count, matched_count, unmatched
  ) values (
    left(coalesce(p_source_filename, ''), 255),
    coalesce(p_row_count, 0),
    jsonb_array_length(p_people),
    (select count(*) from jsonb_array_elements(p_people) e where coalesce(e->>'employee_id', '') <> ''),
    coalesce(p_unmatched, '[]'::jsonb)
  ) returning id into new_import_id;

  insert into public.employee_navigator_links (person_key, employee_id, en_name)
  select l->>'person_key', l->>'employee_id', l->>'en_name'
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) l
  where coalesce(l->>'person_key', '') <> '' and coalesce(l->>'employee_id', '') <> ''
  on conflict (person_key) do update
    set employee_id = excluded.employee_id, en_name = excluded.en_name,
        linked_by = auth.uid(), linked_at = now();

  insert into public.employee_navigator_people (
    import_id, person_key, employee_id, match_method, first_name, last_name,
    preferred_name, employment_status, hire_date, dependents
  )
  select new_import_id, p->>'person_key', nullif(p->>'employee_id', ''), nullif(p->>'match_method', ''),
    coalesce(p->>'first_name', ''), coalesce(p->>'last_name', ''), nullif(p->>'preferred_name', ''),
    nullif(p->>'employment_status', ''), nullif(p->>'hire_date', '')::date,
    coalesce(p->'dependents', '[]'::jsonb)
  from jsonb_array_elements(p_people) p;

  insert into public.employee_benefit_enrollments (
    import_id, person_key, relationship, member_name, plan_type, carrier, plan_name,
    coverage_level, effective_date, end_date, status, decline_reason, cost_per_pay, benefit_amount
  )
  select new_import_id, e->>'person_key', coalesce(e->>'relationship', 'Employee'),
    coalesce(e->>'member_name', ''), e->>'plan_type', nullif(e->>'carrier', ''),
    nullif(e->>'plan_name', ''), nullif(e->>'coverage_level', ''),
    nullif(e->>'effective_date', '')::date, nullif(e->>'end_date', '')::date,
    e->>'status', nullif(e->>'decline_reason', ''),
    nullif(e->>'cost_per_pay', '')::numeric, nullif(e->>'benefit_amount', '')::numeric
  from jsonb_array_elements(p_enrollments) e;

  delete from public.employee_benefit_enrollments where import_id <> new_import_id;
  delete from public.employee_navigator_people where import_id <> new_import_id;

  return new_import_id;
end;
$$;

revoke all on function public.orbis_replace_employee_navigator_snapshot(text, integer, jsonb, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.orbis_replace_employee_navigator_snapshot(text, integer, jsonb, jsonb, jsonb, jsonb)
  to authenticated;
