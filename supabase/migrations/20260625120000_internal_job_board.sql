-- Internal Job Board: postings, employee interest, and audit events

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.internal_job_postings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  hiring_manager_name text not null,
  location text not null default '',
  employment_type text not null default 'full_time',
  short_description text not null default '',
  responsibilities text not null default '',
  qualifications text not null default '',
  pay_range text,
  posting_date date not null default current_date,
  closing_date date,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint internal_job_postings_status_check check (
    status in ('draft', 'open', 'closed', 'filled')
  ),
  constraint internal_job_postings_employment_type_check check (
    employment_type in ('full_time', 'part_time', 'contract', 'temporary')
  )
);

create index if not exists internal_job_postings_status_idx
  on public.internal_job_postings (status);
create index if not exists internal_job_postings_department_idx
  on public.internal_job_postings (department);
create index if not exists internal_job_postings_posting_date_idx
  on public.internal_job_postings (posting_date desc);

create table if not exists public.internal_job_interest (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.internal_job_postings(id) on delete cascade,
  employee_id text not null,
  employee_name text not null default '',
  employee_department text not null default '',
  employee_supervisor text not null default '',
  interest_note text,
  status text not null default 'new',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  constraint internal_job_interest_status_check check (
    status in ('new', 'reviewed', 'interviewing', 'not_selected', 'selected')
  ),
  constraint internal_job_interest_posting_employee_unique unique (posting_id, employee_id)
);

create index if not exists internal_job_interest_posting_idx
  on public.internal_job_interest (posting_id);
create index if not exists internal_job_interest_employee_idx
  on public.internal_job_interest (employee_id);
create index if not exists internal_job_interest_status_idx
  on public.internal_job_interest (status);
create index if not exists internal_job_interest_submitted_at_idx
  on public.internal_job_interest (submitted_at desc);

create table if not exists public.internal_job_posting_events (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.internal_job_postings(id) on delete cascade,
  interest_id uuid references public.internal_job_interest(id) on delete set null,
  event_type text not null,
  field_name text,
  old_value text,
  new_value text,
  note text,
  actor_email text not null,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists internal_job_posting_events_posting_idx
  on public.internal_job_posting_events (posting_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.internal_job_postings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists internal_job_postings_updated_at on public.internal_job_postings;
create trigger internal_job_postings_updated_at
  before update on public.internal_job_postings
  for each row execute function public.internal_job_postings_set_updated_at();

create or replace function public.internal_job_interest_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists internal_job_interest_updated_at on public.internal_job_interest;
create trigger internal_job_interest_updated_at
  before update on public.internal_job_interest
  for each row execute function public.internal_job_interest_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.orbis_internal_job_hiring_manager_match(hiring_manager text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and public.orbis_supervisor_matches(
        coalesce(hiring_manager, ''),
        public.orbis_supervisor_scope_name()
      )
    );
$$;

create or replace function public.orbis_internal_job_posting_visible(p public.internal_job_postings)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or (
      public.orbis_is_supervisor()
      and (
        lower(trim(p.department)) in (select public.orbis_supervisor_departments())
        or public.orbis_internal_job_hiring_manager_match(p.hiring_manager_name)
        or p.created_by = public.orbis_auth_uid()
      )
    )
    or (
      public.orbis_current_role() = 'user'
      and p.status = 'open'
    );
$$;

create or replace function public.orbis_internal_job_interest_visible(i public.internal_job_interest)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.orbis_is_admin()
    or i.employee_id = public.orbis_linked_employee_id()
    or (
      public.orbis_is_supervisor()
      and exists (
        select 1
        from public.internal_job_postings p
        where p.id = i.posting_id
        and (
          public.orbis_internal_job_hiring_manager_match(p.hiring_manager_name)
          or lower(trim(p.department)) in (select public.orbis_supervisor_departments())
        )
      )
    )
    or (
      public.orbis_is_supervisor()
      and exists (
        select 1
        from public.employees e
        where e.id::text = i.employee_id
        and public.orbis_supervisor_matches(
          coalesce(e.supervisor, ''),
          public.orbis_supervisor_scope_name()
        )
      )
    );
$$;

grant execute on function public.orbis_internal_job_hiring_manager_match(text) to authenticated;
grant execute on function public.orbis_internal_job_posting_visible(public.internal_job_postings) to authenticated;
grant execute on function public.orbis_internal_job_interest_visible(public.internal_job_interest) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: submit interest (employee self-service)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_submit_internal_job_interest(
  p_posting_id uuid,
  p_interest_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id text;
  emp public.employees%rowtype;
  posting public.internal_job_postings%rowtype;
  new_id uuid;
  actor_email text;
  actor_name text;
begin
  linked_id := public.orbis_linked_employee_id();
  if linked_id is null or btrim(linked_id) = '' then
    raise exception 'No linked employee record for this account';
  end if;

  select * into posting
  from public.internal_job_postings
  where id = p_posting_id;

  if not found or posting.status <> 'open' then
    raise exception 'This opening is not available for interest submissions';
  end if;

  select * into emp
  from public.employees
  where id::text = linked_id;

  if not found then
    raise exception 'Employee record not found';
  end if;

  actor_email := public.orbis_auth_email();
  select coalesce(ua.display_name, actor_email) into actor_name
  from public.user_access ua
  where lower(trim(ua.email)) = actor_email
  limit 1;

  insert into public.internal_job_interest (
    posting_id,
    employee_id,
    employee_name,
    employee_department,
    employee_supervisor,
    interest_note,
    created_by,
    updated_by
  ) values (
    p_posting_id,
    linked_id,
    trim(coalesce(emp.first_name, '') || ' ' || coalesce(emp.last_name, '')),
    coalesce(emp.department, ''),
    coalesce(emp.supervisor, ''),
    nullif(btrim(coalesce(p_interest_note, '')), ''),
    public.orbis_auth_uid(),
    public.orbis_auth_uid()
  )
  on conflict (posting_id, employee_id) do nothing
  returning id into new_id;

  if new_id is null then
    select id into new_id
    from public.internal_job_interest
    where posting_id = p_posting_id
      and employee_id = linked_id;
    return new_id;
  end if;

  insert into public.internal_job_posting_events (
    posting_id,
    interest_id,
    event_type,
    note,
    actor_email,
    actor_name
  ) values (
    p_posting_id,
    new_id,
    'interest_submitted',
    nullif(btrim(coalesce(p_interest_note, '')), ''),
    coalesce(actor_email, 'unknown'),
    actor_name
  );

  return new_id;
end;
$$;

grant execute on function public.orbis_submit_internal_job_interest(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.internal_job_postings enable row level security;
alter table public.internal_job_interest enable row level security;
alter table public.internal_job_posting_events enable row level security;

drop policy if exists orbis_internal_job_postings_select on public.internal_job_postings;
create policy orbis_internal_job_postings_select
  on public.internal_job_postings for select to authenticated
  using (public.orbis_internal_job_posting_visible(internal_job_postings));

drop policy if exists orbis_internal_job_postings_insert on public.internal_job_postings;
create policy orbis_internal_job_postings_insert
  on public.internal_job_postings for insert to authenticated
  with check (
    public.orbis_is_admin()
    or public.orbis_is_supervisor()
  );

drop policy if exists orbis_internal_job_postings_update on public.internal_job_postings;
create policy orbis_internal_job_postings_update
  on public.internal_job_postings for update to authenticated
  using (public.orbis_internal_job_posting_visible(internal_job_postings))
  with check (public.orbis_internal_job_posting_visible(internal_job_postings));

drop policy if exists orbis_internal_job_postings_delete on public.internal_job_postings;
create policy orbis_internal_job_postings_delete
  on public.internal_job_postings for delete to authenticated
  using (public.orbis_is_admin());

drop policy if exists orbis_internal_job_interest_select on public.internal_job_interest;
create policy orbis_internal_job_interest_select
  on public.internal_job_interest for select to authenticated
  using (public.orbis_internal_job_interest_visible(internal_job_interest));

drop policy if exists orbis_internal_job_interest_update on public.internal_job_interest;
create policy orbis_internal_job_interest_update
  on public.internal_job_interest for update to authenticated
  using (public.orbis_internal_job_interest_visible(internal_job_interest))
  with check (public.orbis_internal_job_interest_visible(internal_job_interest));

drop policy if exists orbis_internal_job_posting_events_select on public.internal_job_posting_events;
create policy orbis_internal_job_posting_events_select
  on public.internal_job_posting_events for select to authenticated
  using (
    exists (
      select 1
      from public.internal_job_postings p
      where p.id = posting_id
      and public.orbis_internal_job_posting_visible(p)
    )
  );

drop policy if exists orbis_internal_job_posting_events_insert on public.internal_job_posting_events;
create policy orbis_internal_job_posting_events_insert
  on public.internal_job_posting_events for insert to authenticated
  with check (
    public.orbis_is_admin()
    or public.orbis_is_supervisor()
    or posting_id in (
      select p.id
      from public.internal_job_postings p
      where public.orbis_internal_job_posting_visible(p)
    )
  );
