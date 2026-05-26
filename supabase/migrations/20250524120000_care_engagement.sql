-- Care & Engagement — admin-only (HR) access

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.care_matrix_cells (
  id uuid primary key default gen_random_uuid(),
  matrix_row text not null,
  matrix_column text not null,
  initiatives text not null default '',
  gaps text not null default '',
  proposed_actions text not null default '',
  owner text not null default '',
  due_date date,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_matrix_cells_row_check check (
    matrix_row in ('employees', 'employeesFamilies', 'community', 'customers', 'suppliers')
  ),
  constraint care_matrix_cells_column_check check (
    matrix_column in ('physical', 'emotional', 'spiritual')
  ),
  constraint care_matrix_cells_status_check check (
    status in ('current', 'gap', 'proposed', 'in_progress', 'complete')
  ),
  constraint care_matrix_cells_row_column_unique unique (matrix_row, matrix_column)
);

create index if not exists care_matrix_cells_row_column_idx
  on public.care_matrix_cells (matrix_row, matrix_column);

create table if not exists public.care_items (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null default '',
  employee_name text not null,
  department text not null default '',
  care_type text not null default 'emotional',
  need_or_concern text not null default '',
  action_taken text not null default '',
  owner text not null default '',
  follow_up_date date,
  status text not null default 'open',
  confidentiality text not null default 'hr_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_items_type_check check (
    care_type in ('physical', 'emotional', 'spiritual')
  ),
  constraint care_items_status_check check (
    status in ('open', 'in_progress', 'follow_up', 'resolved', 'closed')
  ),
  constraint care_items_confidentiality_check check (
    confidentiality in ('standard', 'restricted', 'hr_only')
  )
);

create index if not exists care_items_status_idx on public.care_items (status);
create index if not exists care_items_follow_up_idx on public.care_items (follow_up_date);
create index if not exists care_items_employee_idx on public.care_items (employee_id);

create table if not exists public.care_recognition (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null default '',
  employee_name text not null,
  department text not null default '',
  recognition_type text not null default 'kudos',
  summary text not null default '',
  recognized_on date not null default current_date,
  recognized_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_recognition_type_check check (
    recognition_type in (
      'kudos', 'iron_shift', 'work_anniversary', 'above_and_beyond', 'peer_recognition'
    )
  )
);

create index if not exists care_recognition_recognized_on_idx
  on public.care_recognition (recognized_on desc);

create table if not exists public.care_employee_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  note_date date not null default current_date,
  author text not null default '',
  summary text not null,
  confidentiality text not null default 'hr_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_employee_notes_confidentiality_check check (
    confidentiality in ('standard', 'restricted', 'hr_only')
  )
);

create index if not exists care_employee_notes_employee_idx
  on public.care_employee_notes (employee_id, note_date desc);

create table if not exists public.care_follow_ups (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  title text not null,
  due_date date,
  owner text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_follow_ups_status_check check (
    status in ('open', 'in_progress', 'follow_up', 'resolved', 'closed')
  )
);

create index if not exists care_follow_ups_employee_idx
  on public.care_follow_ups (employee_id, due_date);

create table if not exists public.care_resources_shared (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  resource_name text not null,
  shared_on date not null default current_date,
  shared_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_resources_shared_employee_idx
  on public.care_resources_shared (employee_id, shared_on desc);

create table if not exists public.care_wellness_check_ins (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  check_in_date date not null default current_date,
  check_in_type text not null default '',
  notes text not null default '',
  owner text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists care_wellness_check_ins_employee_idx
  on public.care_wellness_check_ins (employee_id, check_in_date desc);

create table if not exists public.care_pulse_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_label text not null default '',
  response_count int not null default 0,
  overall_support numeric(3, 2) not null default 0,
  workload_stress numeric(3, 2) not null default 0,
  communication_score numeric(3, 2) not null default 0,
  recognition_score numeric(3, 2) not null default 0,
  belonging_score numeric(3, 2) not null default 0,
  comments_summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists care_pulse_snapshots_created_idx
  on public.care_pulse_snapshots (created_at desc);

-- Seed empty care matrix grid (15 cells)
insert into public.care_matrix_cells (matrix_row, matrix_column, status)
values
  ('employees', 'physical', 'proposed'),
  ('employees', 'emotional', 'proposed'),
  ('employees', 'spiritual', 'proposed'),
  ('employeesFamilies', 'physical', 'proposed'),
  ('employeesFamilies', 'emotional', 'proposed'),
  ('employeesFamilies', 'spiritual', 'proposed'),
  ('community', 'physical', 'proposed'),
  ('community', 'emotional', 'proposed'),
  ('community', 'spiritual', 'proposed'),
  ('customers', 'physical', 'proposed'),
  ('customers', 'emotional', 'proposed'),
  ('customers', 'spiritual', 'proposed'),
  ('suppliers', 'physical', 'proposed'),
  ('suppliers', 'emotional', 'proposed'),
  ('suppliers', 'spiritual', 'proposed')
on conflict (matrix_row, matrix_column) do nothing;

-- Optional demo pulse snapshot (replace when real surveys exist)
insert into public.care_pulse_snapshots (
  period_label,
  response_count,
  overall_support,
  workload_stress,
  communication_score,
  recognition_score,
  belonging_score,
  comments_summary
)
select
  'Q2 Pulse (Demo)',
  47,
  4.2,
  3.4,
  4.0,
  3.8,
  4.1,
  'Teams value manager visibility and EAP awareness. Top themes: workload during peak season, desire for more peer recognition, and clearer escalation paths for caregiver flexibility.'
where not exists (select 1 from public.care_pulse_snapshots limit 1);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.care_engagement_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists care_matrix_cells_updated_at on public.care_matrix_cells;
create trigger care_matrix_cells_updated_at
  before update on public.care_matrix_cells
  for each row execute function public.care_engagement_set_updated_at();

drop trigger if exists care_items_updated_at on public.care_items;
create trigger care_items_updated_at
  before update on public.care_items
  for each row execute function public.care_engagement_set_updated_at();

drop trigger if exists care_recognition_updated_at on public.care_recognition;
create trigger care_recognition_updated_at
  before update on public.care_recognition
  for each row execute function public.care_engagement_set_updated_at();

drop trigger if exists care_employee_notes_updated_at on public.care_employee_notes;
create trigger care_employee_notes_updated_at
  before update on public.care_employee_notes
  for each row execute function public.care_engagement_set_updated_at();

drop trigger if exists care_follow_ups_updated_at on public.care_follow_ups;
create trigger care_follow_ups_updated_at
  before update on public.care_follow_ups
  for each row execute function public.care_engagement_set_updated_at();

drop trigger if exists care_resources_shared_updated_at on public.care_resources_shared;
create trigger care_resources_shared_updated_at
  before update on public.care_resources_shared
  for each row execute function public.care_engagement_set_updated_at();

drop trigger if exists care_wellness_check_ins_updated_at on public.care_wellness_check_ins;
create trigger care_wellness_check_ins_updated_at
  before update on public.care_wellness_check_ins
  for each row execute function public.care_engagement_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (admin only)
-- ---------------------------------------------------------------------------

create or replace function public.orbis_can_access_care_engagement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin();
$$;

grant execute on function public.orbis_can_access_care_engagement() to authenticated;

alter table public.care_matrix_cells enable row level security;
alter table public.care_items enable row level security;
alter table public.care_recognition enable row level security;
alter table public.care_employee_notes enable row level security;
alter table public.care_follow_ups enable row level security;
alter table public.care_resources_shared enable row level security;
alter table public.care_wellness_check_ins enable row level security;
alter table public.care_pulse_snapshots enable row level security;

grant select, insert, update, delete on table public.care_matrix_cells to authenticated;
grant select, insert, update, delete on table public.care_items to authenticated;
grant select, insert, update, delete on table public.care_recognition to authenticated;
grant select, insert, update, delete on table public.care_employee_notes to authenticated;
grant select, insert, update, delete on table public.care_follow_ups to authenticated;
grant select, insert, update, delete on table public.care_resources_shared to authenticated;
grant select, insert, update, delete on table public.care_wellness_check_ins to authenticated;
grant select, insert, update, delete on table public.care_pulse_snapshots to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'care_matrix_cells', 'care_items', 'care_recognition', 'care_employee_notes',
    'care_follow_ups', 'care_resources_shared', 'care_wellness_check_ins', 'care_pulse_snapshots'
  ]
  loop
    execute format('drop policy if exists orbis_%s_select on public.%I', tbl, tbl);
    execute format(
      'create policy orbis_%s_select on public.%I for select to authenticated using (public.orbis_can_access_care_engagement())',
      tbl, tbl
    );
    execute format('drop policy if exists orbis_%s_insert on public.%I', tbl, tbl);
    execute format(
      'create policy orbis_%s_insert on public.%I for insert to authenticated with check (public.orbis_can_access_care_engagement())',
      tbl, tbl
    );
    execute format('drop policy if exists orbis_%s_update on public.%I', tbl, tbl);
    execute format(
      'create policy orbis_%s_update on public.%I for update to authenticated using (public.orbis_can_access_care_engagement()) with check (public.orbis_can_access_care_engagement())',
      tbl, tbl
    );
    execute format('drop policy if exists orbis_%s_delete on public.%I', tbl, tbl);
    execute format(
      'create policy orbis_%s_delete on public.%I for delete to authenticated using (public.orbis_can_access_care_engagement())',
      tbl, tbl
    );
  end loop;
end $$;
