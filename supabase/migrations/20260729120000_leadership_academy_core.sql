-- BTW Leadership Academy — core schema, RLS, and audit foundation.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.leadership_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.orbis_can_manage_leadership_academy()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin();
$$;

create or replace function public.orbis_can_view_leadership_catalog()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or public.orbis_is_supervisor()
    or public.orbis_has_personal_portal();
$$;

create or replace function public.orbis_can_view_leadership_employee(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_is_admin()
    or (
      public.orbis_has_personal_portal()
      and emp_id = public.orbis_linked_employee_id()
    )
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(emp_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table if not exists public.leadership_program_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  intended_audience text not null default '',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  display_order int not null default 0,
  estimated_hours numeric(6, 2),
  completion_requirements text not null default '',
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_program_tiers_status_order_idx
  on public.leadership_program_tiers (status, display_order);

create table if not exists public.leadership_competencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  definition text not null default '',
  expected_behaviors text not null default '',
  unacceptable_behaviors text not null default '',
  applicable_tier_ids uuid[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_competencies_status_order_idx
  on public.leadership_competencies (status, display_order);

create table if not exists public.leadership_courses (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid references public.leadership_program_tiers(id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  is_required boolean not null default true,
  estimated_minutes int,
  display_order int not null default 0,
  passing_score_percent int
    check (passing_score_percent is null or (passing_score_percent between 0 and 100)),
  due_rule_days int,
  cover_icon text,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_courses_tier_status_idx
  on public.leadership_courses (tier_id, status, display_order);

create table if not exists public.leadership_course_competencies (
  course_id uuid not null references public.leadership_courses(id) on delete cascade,
  competency_id uuid not null references public.leadership_competencies(id) on delete cascade,
  primary key (course_id, competency_id)
);

create table if not exists public.leadership_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.leadership_courses(id) on delete cascade,
  title text not null,
  instructions text not null default '',
  module_type text not null default 'written'
    check (module_type in (
      'written', 'video', 'document', 'quiz', 'reflection', 'assignment', 'acknowledgment'
    )),
  is_required boolean not null default true,
  display_order int not null default 0,
  estimated_minutes int,
  completion_requirements jsonb not null default '{}'::jsonb,
  resource_url text,
  storage_path text,
  allow_retakes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_modules_course_order_idx
  on public.leadership_modules (course_id, display_order);

create table if not exists public.leadership_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.leadership_modules(id) on delete cascade,
  question_type text not null default 'multiple_choice'
    check (question_type in ('multiple_choice', 'true_false', 'short_answer')),
  prompt text not null,
  display_order int not null default 0,
  points int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists leadership_quiz_questions_module_idx
  on public.leadership_quiz_questions (module_id, display_order);

create table if not exists public.leadership_quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.leadership_quiz_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  display_order int not null default 0
);

create index if not exists leadership_quiz_options_question_idx
  on public.leadership_quiz_options (question_id, display_order);

create table if not exists public.leadership_philosophy_content (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'What Leadership Means at BTW',
  body text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  is_seed_draft boolean not null default false,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Enrollment & progress
-- ---------------------------------------------------------------------------

create table if not exists public.leadership_enrollments (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null,
  tier_id uuid references public.leadership_program_tiers(id) on delete set null,
  enrolled_by_email text,
  assigned_at timestamptz not null default now(),
  due_date date,
  status text not null default 'not_started'
    check (status in (
      'not_started', 'in_progress', 'completed', 'overdue', 'paused', 'withdrawn'
    )),
  completion_percent numeric(5, 2) not null default 0
    check (completion_percent between 0 and 100),
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_enrollments_employee_idx
  on public.leadership_enrollments (employee_id, status);
create index if not exists leadership_enrollments_due_idx
  on public.leadership_enrollments (due_date, status);

create table if not exists public.leadership_course_assignments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.leadership_enrollments(id) on delete cascade,
  course_id uuid not null references public.leadership_courses(id) on delete cascade,
  assigned_by_email text,
  assigned_at timestamptz not null default now(),
  due_date date,
  status text not null default 'not_started'
    check (status in (
      'not_started', 'in_progress', 'completed', 'overdue', 'paused', 'withdrawn'
    )),
  completion_percent numeric(5, 2) not null default 0
    check (completion_percent between 0 and 100),
  completed_at timestamptz,
  unique (enrollment_id, course_id)
);

create index if not exists leadership_course_assignments_enrollment_idx
  on public.leadership_course_assignments (enrollment_id);
create index if not exists leadership_course_assignments_course_idx
  on public.leadership_course_assignments (course_id, status);

create table if not exists public.leadership_module_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.leadership_enrollments(id) on delete cascade,
  module_id uuid not null references public.leadership_modules(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  unique (enrollment_id, module_id)
);

create index if not exists leadership_module_progress_enrollment_idx
  on public.leadership_module_progress (enrollment_id, status);

create table if not exists public.leadership_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.leadership_enrollments(id) on delete cascade,
  module_id uuid not null references public.leadership_modules(id) on delete cascade,
  attempt_number int not null default 1,
  score_percent numeric(5, 2),
  passed boolean,
  submitted_at timestamptz not null default now(),
  created_by_email text
);

create index if not exists leadership_quiz_attempts_enrollment_module_idx
  on public.leadership_quiz_attempts (enrollment_id, module_id, submitted_at desc);

create table if not exists public.leadership_quiz_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.leadership_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.leadership_quiz_questions(id) on delete cascade,
  response_text text,
  selected_option_id uuid references public.leadership_quiz_options(id) on delete set null,
  is_correct boolean,
  points_awarded numeric(6, 2)
);

create index if not exists leadership_quiz_responses_attempt_idx
  on public.leadership_quiz_responses (attempt_id);

-- ---------------------------------------------------------------------------
-- Workshops, coaching, goals
-- ---------------------------------------------------------------------------

create table if not exists public.leadership_workshops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  facilitator_name text not null default '',
  workshop_date date not null,
  start_time time,
  end_time time,
  location text not null default '',
  capacity int,
  tier_id uuid references public.leadership_program_tiers(id) on delete set null,
  course_id uuid references public.leadership_courses(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_workshops_date_idx
  on public.leadership_workshops (workshop_date desc, status);

create table if not exists public.leadership_workshop_participants (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.leadership_workshops(id) on delete cascade,
  employee_id text not null,
  attendance_status text not null default 'registered'
    check (attendance_status in (
      'registered', 'attended', 'absent', 'excused', 'cancelled'
    )),
  notes text not null default '',
  recorded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_id, employee_id)
);

create index if not exists leadership_workshop_participants_workshop_idx
  on public.leadership_workshop_participants (workshop_id);
create index if not exists leadership_workshop_participants_employee_idx
  on public.leadership_workshop_participants (employee_id);

create table if not exists public.leadership_coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_employee_id text not null,
  coach_email text not null,
  session_date date not null default current_date,
  leadership_topic text not null default '',
  discussion_summary text not null default '',
  action_items text not null default '',
  follow_up_date date,
  confidentiality text not null default 'standard'
    check (confidentiality in ('standard', 'restricted', 'hr_only')),
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_coaching_sessions_participant_idx
  on public.leadership_coaching_sessions (participant_employee_id, session_date desc);

create table if not exists public.leadership_development_goals (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references public.leadership_enrollments(id) on delete set null,
  employee_id text not null,
  competency_id uuid references public.leadership_competencies(id) on delete set null,
  title text not null,
  description text not null default '',
  target_date date,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'cancelled')),
  progress_notes text not null default '',
  completed_at timestamptz,
  assigned_by_email text,
  participant_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadership_development_goals_employee_idx
  on public.leadership_development_goals (employee_id, status);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table if not exists public.leadership_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  employee_id text,
  action_type text not null,
  field_name text,
  old_value text,
  new_value text,
  note text,
  actor_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists leadership_audit_events_entity_idx
  on public.leadership_audit_events (entity_type, entity_id, created_at desc);
create index if not exists leadership_audit_events_employee_idx
  on public.leadership_audit_events (employee_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'leadership_program_tiers',
    'leadership_competencies',
    'leadership_courses',
    'leadership_modules',
    'leadership_philosophy_content',
    'leadership_enrollments',
    'leadership_course_assignments',
    'leadership_workshops',
    'leadership_workshop_participants',
    'leadership_coaching_sessions',
    'leadership_development_goals'
  ]
  loop
    execute format('drop trigger if exists %I_updated_at on public.%I', tbl, tbl);
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute function public.leadership_set_updated_at()',
      tbl,
      tbl
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.leadership_program_tiers enable row level security;
alter table public.leadership_competencies enable row level security;
alter table public.leadership_courses enable row level security;
alter table public.leadership_course_competencies enable row level security;
alter table public.leadership_modules enable row level security;
alter table public.leadership_quiz_questions enable row level security;
alter table public.leadership_quiz_options enable row level security;
alter table public.leadership_philosophy_content enable row level security;
alter table public.leadership_enrollments enable row level security;
alter table public.leadership_course_assignments enable row level security;
alter table public.leadership_module_progress enable row level security;
alter table public.leadership_quiz_attempts enable row level security;
alter table public.leadership_quiz_responses enable row level security;
alter table public.leadership_workshops enable row level security;
alter table public.leadership_workshop_participants enable row level security;
alter table public.leadership_coaching_sessions enable row level security;
alter table public.leadership_development_goals enable row level security;
alter table public.leadership_audit_events enable row level security;

-- Catalog: read for enrolled viewers; write admin only
drop policy if exists leadership_program_tiers_select on public.leadership_program_tiers;
create policy leadership_program_tiers_select on public.leadership_program_tiers
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_program_tiers_write on public.leadership_program_tiers;
create policy leadership_program_tiers_write on public.leadership_program_tiers
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_competencies_select on public.leadership_competencies;
create policy leadership_competencies_select on public.leadership_competencies
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_competencies_write on public.leadership_competencies;
create policy leadership_competencies_write on public.leadership_competencies
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_courses_select on public.leadership_courses;
create policy leadership_courses_select on public.leadership_courses
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_courses_write on public.leadership_courses;
create policy leadership_courses_write on public.leadership_courses
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_course_competencies_select on public.leadership_course_competencies;
create policy leadership_course_competencies_select on public.leadership_course_competencies
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_course_competencies_write on public.leadership_course_competencies;
create policy leadership_course_competencies_write on public.leadership_course_competencies
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_modules_select on public.leadership_modules;
create policy leadership_modules_select on public.leadership_modules
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_modules_write on public.leadership_modules;
create policy leadership_modules_write on public.leadership_modules
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_quiz_questions_select on public.leadership_quiz_questions;
create policy leadership_quiz_questions_select on public.leadership_quiz_questions
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_quiz_questions_write on public.leadership_quiz_questions;
create policy leadership_quiz_questions_write on public.leadership_quiz_questions
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_quiz_options_select on public.leadership_quiz_options;
create policy leadership_quiz_options_select on public.leadership_quiz_options
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_quiz_options_write on public.leadership_quiz_options;
create policy leadership_quiz_options_write on public.leadership_quiz_options
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_philosophy_select on public.leadership_philosophy_content;
create policy leadership_philosophy_select on public.leadership_philosophy_content
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_philosophy_write on public.leadership_philosophy_content;
create policy leadership_philosophy_write on public.leadership_philosophy_content
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

-- Enrollments scoped by employee
drop policy if exists leadership_enrollments_select on public.leadership_enrollments;
create policy leadership_enrollments_select on public.leadership_enrollments
  for select to authenticated
  using (public.orbis_can_view_leadership_employee(employee_id));
drop policy if exists leadership_enrollments_insert on public.leadership_enrollments;
create policy leadership_enrollments_insert on public.leadership_enrollments
  for insert to authenticated
  with check (public.orbis_can_manage_leadership_academy());
drop policy if exists leadership_enrollments_update on public.leadership_enrollments;
create policy leadership_enrollments_update on public.leadership_enrollments
  for update to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
  );
drop policy if exists leadership_enrollments_delete on public.leadership_enrollments;
create policy leadership_enrollments_delete on public.leadership_enrollments
  for delete to authenticated using (public.orbis_can_manage_leadership_academy());

-- Child tables: access via enrollment employee
drop policy if exists leadership_course_assignments_select on public.leadership_course_assignments;
create policy leadership_course_assignments_select on public.leadership_course_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and public.orbis_can_view_leadership_employee(e.employee_id)
    )
  );
drop policy if exists leadership_course_assignments_write on public.leadership_course_assignments;
create policy leadership_course_assignments_write on public.leadership_course_assignments
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_module_progress_select on public.leadership_module_progress;
create policy leadership_module_progress_select on public.leadership_module_progress
  for select to authenticated
  using (
    exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and public.orbis_can_view_leadership_employee(e.employee_id)
    )
  );
drop policy if exists leadership_module_progress_write on public.leadership_module_progress;
create policy leadership_module_progress_write on public.leadership_module_progress
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  );

drop policy if exists leadership_quiz_attempts_select on public.leadership_quiz_attempts;
create policy leadership_quiz_attempts_select on public.leadership_quiz_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and public.orbis_can_view_leadership_employee(e.employee_id)
    )
  );
drop policy if exists leadership_quiz_attempts_write on public.leadership_quiz_attempts;
create policy leadership_quiz_attempts_write on public.leadership_quiz_attempts
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1 from public.leadership_enrollments e
      where e.id = enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  );

drop policy if exists leadership_quiz_responses_select on public.leadership_quiz_responses;
create policy leadership_quiz_responses_select on public.leadership_quiz_responses
  for select to authenticated
  using (
    exists (
      select 1
      from public.leadership_quiz_attempts a
      join public.leadership_enrollments e on e.id = a.enrollment_id
      where a.id = attempt_id
        and public.orbis_can_view_leadership_employee(e.employee_id)
    )
  );
drop policy if exists leadership_quiz_responses_write on public.leadership_quiz_responses;
create policy leadership_quiz_responses_write on public.leadership_quiz_responses
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1
      from public.leadership_quiz_attempts a
      join public.leadership_enrollments e on e.id = a.enrollment_id
      where a.id = attempt_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1
      from public.leadership_quiz_attempts a
      join public.leadership_enrollments e on e.id = a.enrollment_id
      where a.id = attempt_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  );

-- Workshops
drop policy if exists leadership_workshops_select on public.leadership_workshops;
create policy leadership_workshops_select on public.leadership_workshops
  for select to authenticated using (public.orbis_can_view_leadership_catalog());
drop policy if exists leadership_workshops_write on public.leadership_workshops;
create policy leadership_workshops_write on public.leadership_workshops
  for all to authenticated
  using (public.orbis_can_manage_leadership_academy())
  with check (public.orbis_can_manage_leadership_academy());

drop policy if exists leadership_workshop_participants_select on public.leadership_workshop_participants;
create policy leadership_workshop_participants_select on public.leadership_workshop_participants
  for select to authenticated
  using (public.orbis_can_view_leadership_employee(employee_id));
drop policy if exists leadership_workshop_participants_write on public.leadership_workshop_participants;
create policy leadership_workshop_participants_write on public.leadership_workshop_participants
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
  );

-- Coaching with confidentiality
drop policy if exists leadership_coaching_sessions_select on public.leadership_coaching_sessions;
create policy leadership_coaching_sessions_select on public.leadership_coaching_sessions
  for select to authenticated
  using (
    public.orbis_is_admin()
    or (
      confidentiality = 'standard'
      and public.orbis_can_view_leadership_employee(participant_employee_id)
    )
    or (
      confidentiality = 'restricted'
      and (
        lower(trim(coach_email)) = public.orbis_auth_email()
        or public.orbis_is_admin()
        or (
          public.orbis_is_supervisor()
          and public.orbis_employee_child_accessible(participant_employee_id)
        )
      )
    )
  );
drop policy if exists leadership_coaching_sessions_write on public.leadership_coaching_sessions;
create policy leadership_coaching_sessions_write on public.leadership_coaching_sessions
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(participant_employee_id)
      and confidentiality <> 'hr_only'
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(participant_employee_id)
      and confidentiality <> 'hr_only'
    )
  );

-- Development goals
drop policy if exists leadership_development_goals_select on public.leadership_development_goals;
create policy leadership_development_goals_select on public.leadership_development_goals
  for select to authenticated
  using (public.orbis_can_view_leadership_employee(employee_id));
drop policy if exists leadership_development_goals_write on public.leadership_development_goals;
create policy leadership_development_goals_write on public.leadership_development_goals
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or (
      public.orbis_is_supervisor()
      and public.orbis_employee_child_accessible(employee_id)
    )
    or (
      public.orbis_has_personal_portal()
      and employee_id = public.orbis_linked_employee_id()
    )
  );

-- Audit: admin read/write; supervisors read events for their team
drop policy if exists leadership_audit_events_select on public.leadership_audit_events;
create policy leadership_audit_events_select on public.leadership_audit_events
  for select to authenticated
  using (
    public.orbis_is_admin()
    or (
      employee_id is not null
      and public.orbis_can_view_leadership_employee(employee_id)
    )
  );
drop policy if exists leadership_audit_events_insert on public.leadership_audit_events;
create policy leadership_audit_events_insert on public.leadership_audit_events
  for insert to authenticated
  with check (
    lower(trim(actor_email)) = public.orbis_auth_email()
  );

-- Grants (leadership academy tables only)
grant select, insert, update, delete on table public.leadership_program_tiers to authenticated;
grant select, insert, update, delete on table public.leadership_competencies to authenticated;
grant select, insert, update, delete on table public.leadership_courses to authenticated;
grant select, insert, update, delete on table public.leadership_course_competencies to authenticated;
grant select, insert, update, delete on table public.leadership_modules to authenticated;
grant select, insert, update, delete on table public.leadership_quiz_questions to authenticated;
grant select, insert, update, delete on table public.leadership_quiz_options to authenticated;
grant select, insert, update, delete on table public.leadership_philosophy_content to authenticated;
grant select, insert, update, delete on table public.leadership_enrollments to authenticated;
grant select, insert, update, delete on table public.leadership_course_assignments to authenticated;
grant select, insert, update, delete on table public.leadership_module_progress to authenticated;
grant select, insert, update, delete on table public.leadership_quiz_attempts to authenticated;
grant select, insert, update, delete on table public.leadership_quiz_responses to authenticated;
grant select, insert, update, delete on table public.leadership_workshops to authenticated;
grant select, insert, update, delete on table public.leadership_workshop_participants to authenticated;
grant select, insert, update, delete on table public.leadership_coaching_sessions to authenticated;
grant select, insert, update, delete on table public.leadership_development_goals to authenticated;
grant select, insert on table public.leadership_audit_events to authenticated;
