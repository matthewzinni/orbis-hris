-- Matthew-only Salary page.
-- Salary history comes from Employee Navigator's per-employee Compensation CSVs,
-- combined into one "Orbis Salary Import" CSV and imported in the browser.
-- Bonus / other compensation and notes are entered on the page.
--
-- Access: ONLY matthew.zinni@btwglobal.com (approved). Other HR admins, supervisors
-- and employees cannot read or write any of these tables. Reads go through RLS;
-- writes go only through the security-definer RPCs below.

create or replace function public.orbis_can_view_salaries()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.orbis_access_is_approved(), false)
    and lower(trim(coalesce(public.orbis_auth_email(), ''))) = 'matthew.zinni@btwglobal.com';
$$;

revoke all on function public.orbis_can_view_salaries() from public, anon;
grant execute on function public.orbis_can_view_salaries() to authenticated;

create table if not exists public.employee_salary_imports (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  imported_by uuid default auth.uid(),
  source_filename text,
  row_count integer not null default 0,
  people_count integer not null default 0,
  matched_count integer not null default 0,
  -- EN people not linked to an Orbis employee: [{name, hire_date, reason}]
  unmatched jsonb not null default '[]'::jsonb
);

-- Salary history rows from the latest import (replaced on every import).
create table if not exists public.employee_salary_history (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.employee_salary_imports(id) on delete cascade,
  person_key text not null,
  employee_id text,
  en_name text not null default '',
  salary_type text,
  effective_date date,
  pay_basis text check (pay_basis in ('annual', 'hourly')),
  annual_base_salary numeric(12, 2),
  hourly_rate numeric(10, 2),
  hours_per_week numeric(6, 2),
  annual_benefit_salary numeric(12, 2),
  change_reason text
);
create index if not exists employee_salary_history_employee_idx
  on public.employee_salary_history (employee_id, effective_date desc);

-- Bonus, commission and other compensation entered by Matthew (kept across imports).
create table if not exists public.employee_compensation_extras (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  comp_type text not null check (comp_type in ('bonus', 'commission', 'other')),
  amount numeric(12, 2) not null,
  effective_date date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists employee_compensation_extras_employee_idx
  on public.employee_compensation_extras (employee_id, effective_date desc);

-- Private free-text notes per employee.
create table if not exists public.employee_salary_notes (
  employee_id text primary key,
  notes text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.employee_salary_imports enable row level security;
alter table public.employee_salary_history enable row level security;
alter table public.employee_compensation_extras enable row level security;
alter table public.employee_salary_notes enable row level security;

revoke all on public.employee_salary_imports, public.employee_salary_history,
  public.employee_compensation_extras, public.employee_salary_notes from public, anon, authenticated;
grant select on public.employee_salary_imports, public.employee_salary_history,
  public.employee_compensation_extras, public.employee_salary_notes to authenticated;
grant all on public.employee_salary_imports, public.employee_salary_history,
  public.employee_compensation_extras, public.employee_salary_notes to service_role;

create policy employee_salary_imports_matthew_select on public.employee_salary_imports
  for select to authenticated using (public.orbis_can_view_salaries());
create policy employee_salary_history_matthew_select on public.employee_salary_history
  for select to authenticated using (public.orbis_can_view_salaries());
create policy employee_compensation_extras_matthew_select on public.employee_compensation_extras
  for select to authenticated using (public.orbis_can_view_salaries());
create policy employee_salary_notes_matthew_select on public.employee_salary_notes
  for select to authenticated using (public.orbis_can_view_salaries());

-- Atomically replace the salary history snapshot. Earlier import rows stay as an
-- audit trail (counts + unmatched list); their history rows are removed.
-- Confirmed EN person → Orbis employee links are shared with the Benefits import.
create or replace function public.orbis_replace_salary_snapshot(
  p_source_filename text,
  p_row_count integer,
  p_history jsonb,
  p_links jsonb,
  p_unmatched jsonb
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  new_import_id uuid;
begin
  if not coalesce(public.orbis_can_view_salaries(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_history) <> 'array' or jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid salary import payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('orbis_salary_import'));

  insert into public.employee_salary_imports (
    source_filename, row_count, people_count, matched_count, unmatched
  ) values (
    left(coalesce(p_source_filename, ''), 255),
    coalesce(p_row_count, 0),
    (select count(distinct h->>'person_key') from jsonb_array_elements(p_history) h),
    (select count(distinct h->>'person_key') from jsonb_array_elements(p_history) h
      where coalesce(h->>'employee_id', '') <> ''),
    coalesce(p_unmatched, '[]'::jsonb)
  ) returning id into new_import_id;

  insert into public.employee_navigator_links (person_key, employee_id, en_name)
  select l->>'person_key', l->>'employee_id', l->>'en_name'
  from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) l
  where coalesce(l->>'person_key', '') <> '' and coalesce(l->>'employee_id', '') <> ''
  on conflict (person_key) do update
    set employee_id = excluded.employee_id, en_name = excluded.en_name,
        linked_by = auth.uid(), linked_at = now();

  insert into public.employee_salary_history (
    import_id, person_key, employee_id, en_name, salary_type, effective_date, pay_basis,
    annual_base_salary, hourly_rate, hours_per_week, annual_benefit_salary, change_reason
  )
  select new_import_id, h->>'person_key', nullif(h->>'employee_id', ''), coalesce(h->>'en_name', ''),
    nullif(h->>'salary_type', ''), nullif(h->>'effective_date', '')::date, nullif(h->>'pay_basis', ''),
    nullif(h->>'annual_base_salary', '')::numeric, nullif(h->>'hourly_rate', '')::numeric,
    nullif(h->>'hours_per_week', '')::numeric, nullif(h->>'annual_benefit_salary', '')::numeric,
    nullif(h->>'change_reason', '')
  from jsonb_array_elements(p_history) h;

  delete from public.employee_salary_history where import_id <> new_import_id;

  return new_import_id;
end;
$$;

create or replace function public.orbis_save_compensation_extra(
  p_id uuid,
  p_employee_id text,
  p_comp_type text,
  p_amount numeric,
  p_effective_date date,
  p_note text
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  saved_id uuid;
begin
  if not coalesce(public.orbis_can_view_salaries(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(trim(p_employee_id), '') = '' or p_amount is null then
    raise exception 'Employee and amount are required';
  end if;

  if p_id is null then
    insert into public.employee_compensation_extras (employee_id, comp_type, amount, effective_date, note)
    values (trim(p_employee_id), p_comp_type, p_amount, p_effective_date, nullif(trim(coalesce(p_note, '')), ''))
    returning id into saved_id;
  else
    update public.employee_compensation_extras
      set comp_type = p_comp_type, amount = p_amount, effective_date = p_effective_date,
          note = nullif(trim(coalesce(p_note, '')), '')
      where id = p_id
      returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.orbis_delete_compensation_extra(p_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not coalesce(public.orbis_can_view_salaries(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.employee_compensation_extras where id = p_id;
end;
$$;

create or replace function public.orbis_save_salary_notes(p_employee_id text, p_notes text)
returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not coalesce(public.orbis_can_view_salaries(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(trim(p_employee_id), '') = '' then
    raise exception 'Employee is required';
  end if;
  insert into public.employee_salary_notes (employee_id, notes)
  values (trim(p_employee_id), coalesce(p_notes, ''))
  on conflict (employee_id) do update
    set notes = excluded.notes, updated_by = auth.uid(), updated_at = now();
end;
$$;

revoke all on function public.orbis_replace_salary_snapshot(text, integer, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.orbis_save_compensation_extra(uuid, text, text, numeric, date, text) from public, anon;
revoke all on function public.orbis_delete_compensation_extra(uuid) from public, anon;
revoke all on function public.orbis_save_salary_notes(text, text) from public, anon;
grant execute on function public.orbis_replace_salary_snapshot(text, integer, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.orbis_save_compensation_extra(uuid, text, text, numeric, date, text) to authenticated;
grant execute on function public.orbis_delete_compensation_extra(uuid) to authenticated;
grant execute on function public.orbis_save_salary_notes(text, text) to authenticated;
