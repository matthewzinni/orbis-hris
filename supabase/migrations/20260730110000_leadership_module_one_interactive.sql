-- Interactive participant experience for Leadership Academy Module 1.

create table if not exists public.leadership_module_submissions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.leadership_enrollments(id) on delete cascade,
  module_id uuid not null references public.leadership_modules(id) on delete cascade,
  submission_type text not null check (submission_type in ('reflection', 'acknowledgment')),
  response jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, module_id, submission_type)
);

create index if not exists leadership_module_submissions_enrollment_idx
  on public.leadership_module_submissions (enrollment_id, module_id);

drop trigger if exists leadership_module_submissions_updated_at
  on public.leadership_module_submissions;
create trigger leadership_module_submissions_updated_at
  before update on public.leadership_module_submissions
  for each row execute function public.leadership_set_updated_at();

alter table public.leadership_module_submissions enable row level security;

drop policy if exists leadership_module_submissions_select
  on public.leadership_module_submissions;
create policy leadership_module_submissions_select
  on public.leadership_module_submissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.leadership_enrollments e
      where e.id = enrollment_id
        and public.orbis_can_view_leadership_employee(e.employee_id)
    )
  );

drop policy if exists leadership_module_submissions_write
  on public.leadership_module_submissions;
create policy leadership_module_submissions_write
  on public.leadership_module_submissions
  for all to authenticated
  using (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1
      from public.leadership_enrollments e
      where e.id = enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  )
  with check (
    public.orbis_can_manage_leadership_academy()
    or exists (
      select 1
      from public.leadership_enrollments e
      where e.id = enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    )
  );

grant select, insert, update, delete
  on table public.leadership_module_submissions to authenticated;

-- Correct answers are available only to Academy administrators. Participants
-- receive safe question data through get_leadership_quiz().
drop policy if exists leadership_quiz_options_select on public.leadership_quiz_options;
create policy leadership_quiz_options_select on public.leadership_quiz_options
  for select to authenticated
  using (public.orbis_can_manage_leadership_academy());

create or replace function public.leadership_enrollment_is_writable(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.orbis_can_manage_leadership_academy()
    or exists (
      select 1
      from public.leadership_enrollments e
      where e.id = p_enrollment_id
        and e.employee_id = public.orbis_linked_employee_id()
        and public.orbis_has_personal_portal()
    );
$$;

create or replace function public.leadership_recalculate_progress(p_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.leadership_enrollments%rowtype;
  v_course record;
  v_required int;
  v_completed int;
  v_percent numeric(5, 2);
  v_total_required int;
  v_total_completed int;
begin
  if not public.leadership_enrollment_is_writable(p_enrollment_id) then
    raise exception 'Not authorized to update this enrollment';
  end if;

  select * into v_enrollment
  from public.leadership_enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Leadership enrollment not found';
  end if;

  insert into public.leadership_course_assignments (
    enrollment_id, course_id, assigned_by_email, due_date
  )
  select
    v_enrollment.id,
    c.id,
    coalesce(v_enrollment.enrolled_by_email, public.orbis_auth_email()),
    case
      when c.due_rule_days is null then v_enrollment.due_date
      else (v_enrollment.assigned_at::date + c.due_rule_days)
    end
  from public.leadership_courses c
  where c.tier_id = v_enrollment.tier_id
    and c.status <> 'archived'
  on conflict (enrollment_id, course_id) do nothing;

  for v_course in
    select ca.id assignment_id, ca.course_id
    from public.leadership_course_assignments ca
    where ca.enrollment_id = p_enrollment_id
      and ca.status not in ('paused', 'withdrawn')
  loop
    select
      count(*) filter (where m.is_required),
      count(*) filter (
        where m.is_required and mp.status = 'completed'
      )
    into v_required, v_completed
    from public.leadership_modules m
    left join public.leadership_module_progress mp
      on mp.module_id = m.id
      and mp.enrollment_id = p_enrollment_id
    where m.course_id = v_course.course_id;

    v_percent := case
      when v_required = 0 then 0
      else round((v_completed::numeric / v_required::numeric) * 100, 2)
    end;

    update public.leadership_course_assignments
    set completion_percent = v_percent,
        status = case
          when v_percent = 100 then 'completed'
          when v_percent > 0 then 'in_progress'
          when due_date < current_date then 'overdue'
          else 'not_started'
        end,
        completed_at = case when v_percent = 100 then coalesce(completed_at, now()) else null end
    where id = v_course.assignment_id;
  end loop;

  select
    count(*) filter (where m.is_required),
    count(*) filter (where m.is_required and mp.status = 'completed')
  into v_total_required, v_total_completed
  from public.leadership_courses c
  join public.leadership_modules m on m.course_id = c.id
  left join public.leadership_module_progress mp
    on mp.module_id = m.id
    and mp.enrollment_id = p_enrollment_id
  where c.tier_id = v_enrollment.tier_id
    and c.status <> 'archived';

  v_percent := case
    when v_total_required = 0 then 0
    else round((v_total_completed::numeric / v_total_required::numeric) * 100, 2)
  end;

  update public.leadership_enrollments
  set completion_percent = v_percent,
      status = case
        when v_percent = 100 then 'completed'
        when v_percent > 0 then 'in_progress'
        when due_date < current_date then 'overdue'
        else 'not_started'
      end,
      completed_at = case when v_percent = 100 then coalesce(completed_at, now()) else null end
  where id = p_enrollment_id;
end;
$$;

create or replace function public.complete_leadership_lesson(
  p_enrollment_id uuid,
  p_module_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.leadership_enrollment_is_writable(p_enrollment_id) then
    raise exception 'Not authorized to update this enrollment';
  end if;

  if not exists (
    select 1
    from public.leadership_modules m
    join public.leadership_courses c on c.id = m.course_id
    join public.leadership_enrollments e
      on e.id = p_enrollment_id and e.tier_id = c.tier_id
    where m.id = p_module_id and m.module_type in ('written', 'video', 'document')
  ) then
    raise exception 'Lesson is not assigned to this enrollment';
  end if;

  insert into public.leadership_module_progress (
    enrollment_id, module_id, status, started_at, completed_at, last_activity_at
  )
  values (p_enrollment_id, p_module_id, 'completed', now(), now(), now())
  on conflict (enrollment_id, module_id) do update set
    status = 'completed',
    started_at = coalesce(public.leadership_module_progress.started_at, now()),
    completed_at = coalesce(public.leadership_module_progress.completed_at, now()),
    last_activity_at = now();

  perform public.leadership_recalculate_progress(p_enrollment_id);
end;
$$;

create or replace function public.complete_leadership_module(
  p_enrollment_id uuid,
  p_module_id uuid,
  p_submission_type text,
  p_response jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_type text;
begin
  if not public.leadership_enrollment_is_writable(p_enrollment_id) then
    raise exception 'Not authorized to update this enrollment';
  end if;

  select m.module_type into v_module_type
  from public.leadership_modules m
  join public.leadership_courses c on c.id = m.course_id
  join public.leadership_enrollments e
    on e.id = p_enrollment_id and e.tier_id = c.tier_id
  where m.id = p_module_id;

  if v_module_type is null
    or v_module_type <> p_submission_type
    or p_submission_type not in ('reflection', 'acknowledgment') then
    raise exception 'Interactive module is not assigned to this enrollment';
  end if;

  if p_submission_type = 'reflection'
    and jsonb_array_length(coalesce(p_response -> 'answers', '[]'::jsonb)) = 0 then
    raise exception 'Reflection responses are required';
  end if;

  if p_submission_type = 'acknowledgment'
    and coalesce((p_response ->> 'acknowledged')::boolean, false) is not true then
    raise exception 'Acknowledgment is required';
  end if;

  insert into public.leadership_module_submissions (
    enrollment_id, module_id, submission_type, response, acknowledged_at
  )
  values (
    p_enrollment_id,
    p_module_id,
    p_submission_type,
    p_response,
    case when p_submission_type = 'acknowledgment' then now() else null end
  )
  on conflict (enrollment_id, module_id, submission_type) do update set
    response = excluded.response,
    acknowledged_at = excluded.acknowledged_at,
    updated_at = now();

  insert into public.leadership_module_progress (
    enrollment_id, module_id, status, started_at, completed_at, last_activity_at
  )
  values (p_enrollment_id, p_module_id, 'completed', now(), now(), now())
  on conflict (enrollment_id, module_id) do update set
    status = 'completed',
    started_at = coalesce(public.leadership_module_progress.started_at, now()),
    completed_at = coalesce(public.leadership_module_progress.completed_at, now()),
    last_activity_at = now();

  perform public.leadership_recalculate_progress(p_enrollment_id);
end;
$$;

create or replace function public.get_leadership_quiz(p_module_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.orbis_can_view_leadership_catalog() then
    raise exception 'Not authorized to view Leadership Academy content';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'type', q.question_type,
        'prompt', q.prompt,
        'displayOrder', q.display_order,
        'options', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'text', o.option_text,
              'displayOrder', o.display_order
            )
            order by o.display_order
          )
          from public.leadership_quiz_options o
          where o.question_id = q.id
        ), '[]'::jsonb)
      )
      order by q.display_order
    )
    from public.leadership_quiz_questions q
    where q.module_id = p_module_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.submit_leadership_quiz(
  p_enrollment_id uuid,
  p_module_id uuid,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module public.leadership_modules%rowtype;
  v_attempt_id uuid;
  v_attempt_number int;
  v_total_points numeric;
  v_awarded_points numeric;
  v_score numeric(5, 2);
  v_passing int;
  v_passed boolean;
  v_response jsonb;
  v_question public.leadership_quiz_questions%rowtype;
  v_option_id uuid;
  v_is_correct boolean;
begin
  if not public.leadership_enrollment_is_writable(p_enrollment_id) then
    raise exception 'Not authorized to submit this quiz';
  end if;

  select m.* into v_module
  from public.leadership_modules m
  join public.leadership_courses c on c.id = m.course_id
  join public.leadership_enrollments e
    on e.id = p_enrollment_id and e.tier_id = c.tier_id
  where m.id = p_module_id and m.module_type = 'quiz';

  if not found then
    raise exception 'Quiz is not assigned to this enrollment';
  end if;

  select count(*) + 1 into v_attempt_number
  from public.leadership_quiz_attempts
  where enrollment_id = p_enrollment_id and module_id = p_module_id;

  if v_attempt_number > 1 and not v_module.allow_retakes then
    raise exception 'Retakes are not allowed for this quiz';
  end if;

  insert into public.leadership_quiz_attempts (
    enrollment_id, module_id, attempt_number, created_by_email
  )
  values (p_enrollment_id, p_module_id, v_attempt_number, public.orbis_auth_email())
  returning id into v_attempt_id;

  for v_question in
    select * from public.leadership_quiz_questions
    where module_id = p_module_id
    order by display_order
  loop
    select value into v_response
    from jsonb_array_elements(coalesce(p_responses, '[]'::jsonb))
    where value ->> 'questionId' = v_question.id::text
    limit 1;

    v_option_id := nullif(v_response ->> 'optionId', '')::uuid;
    v_is_correct := null;

    if v_question.question_type in ('multiple_choice', 'true_false') then
      select coalesce(o.is_correct, false) into v_is_correct
      from public.leadership_quiz_options o
      where o.id = v_option_id and o.question_id = v_question.id;
      v_is_correct := coalesce(v_is_correct, false);
    end if;

    insert into public.leadership_quiz_responses (
      attempt_id, question_id, response_text, selected_option_id,
      is_correct, points_awarded
    )
    values (
      v_attempt_id,
      v_question.id,
      nullif(v_response ->> 'text', ''),
      v_option_id,
      v_is_correct,
      case when v_is_correct then v_question.points else 0 end
    );
  end loop;

  select
    coalesce(sum(q.points), 0),
    coalesce(sum(r.points_awarded), 0)
  into v_total_points, v_awarded_points
  from public.leadership_quiz_questions q
  left join public.leadership_quiz_responses r
    on r.question_id = q.id and r.attempt_id = v_attempt_id
  where q.module_id = p_module_id
    and q.question_type <> 'short_answer';

  v_score := case
    when v_total_points = 0 then 0
    else round((v_awarded_points / v_total_points) * 100, 2)
  end;
  v_passing := coalesce(
    (v_module.completion_requirements ->> 'passing_score_percent')::int,
    80
  );
  v_passed := v_score >= v_passing;

  update public.leadership_quiz_attempts
  set score_percent = v_score, passed = v_passed
  where id = v_attempt_id;

  if v_passed then
    insert into public.leadership_module_progress (
      enrollment_id, module_id, status, started_at, completed_at, last_activity_at
    )
    values (p_enrollment_id, p_module_id, 'completed', now(), now(), now())
    on conflict (enrollment_id, module_id) do update set
      status = 'completed',
      started_at = coalesce(public.leadership_module_progress.started_at, now()),
      completed_at = coalesce(public.leadership_module_progress.completed_at, now()),
      last_activity_at = now();
  else
    insert into public.leadership_module_progress (
      enrollment_id, module_id, status, started_at, last_activity_at
    )
    values (p_enrollment_id, p_module_id, 'in_progress', now(), now())
    on conflict (enrollment_id, module_id) do update set
      status = 'in_progress',
      started_at = coalesce(public.leadership_module_progress.started_at, now()),
      last_activity_at = now();
  end if;

  perform public.leadership_recalculate_progress(p_enrollment_id);

  return jsonb_build_object(
    'scorePercent', v_score,
    'passed', v_passed,
    'attemptNumber', v_attempt_number
  );
end;
$$;

revoke all on function public.leadership_enrollment_is_writable(uuid) from public, anon;
revoke all on function public.leadership_recalculate_progress(uuid) from public, anon;
revoke all on function public.get_leadership_quiz(uuid) from public, anon;
revoke all on function public.complete_leadership_lesson(uuid, uuid) from public, anon;
revoke all on function public.complete_leadership_module(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.submit_leadership_quiz(uuid, uuid, jsonb) from public, anon;

grant execute on function public.leadership_enrollment_is_writable(uuid) to authenticated;
grant execute on function public.leadership_recalculate_progress(uuid) to authenticated;
grant execute on function public.get_leadership_quiz(uuid) to authenticated;
grant execute on function public.complete_leadership_lesson(uuid, uuid) to authenticated;
grant execute on function public.complete_leadership_module(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.submit_leadership_quiz(uuid, uuid, jsonb) to authenticated;

create unique index if not exists leadership_quiz_questions_module_prompt_unique_idx
  on public.leadership_quiz_questions (module_id, prompt);
create unique index if not exists leadership_quiz_options_question_text_unique_idx
  on public.leadership_quiz_options (question_id, option_text);

with course_record as (
  select c.id
  from public.leadership_courses c
  join public.leadership_program_tiers t on t.id = c.tier_id
  where t.name = 'Emerging Leader'
    and c.title = 'What It Means to Lead at BTW'
),
reflection_module as (
  insert into public.leadership_modules (
    course_id, title, instructions, module_type, is_required, display_order,
    estimated_minutes, completion_requirements
  )
  select
    id,
    'Personal Leadership Reflection',
    'Take time to answer each question honestly. Your responses are saved to your leadership-development record.',
    'reflection',
    true,
    2,
    15,
    jsonb_build_object(
      'questions', jsonb_build_array(
        'Which leadership responsibility comes most naturally to you?',
        'Which leadership responsibility may be the most difficult for you?',
        'Describe a leader who made a positive difference in your work experience.',
        'What is one behavior you will practice to become a more responsible leader?'
      )
    )
  from course_record
  on conflict (course_id, title) do update set
    instructions = excluded.instructions,
    module_type = excluded.module_type,
    display_order = excluded.display_order,
    estimated_minutes = excluded.estimated_minutes,
    completion_requirements = excluded.completion_requirements
  returning id
),
quiz_module as (
  insert into public.leadership_modules (
    course_id, title, instructions, module_type, is_required, display_order,
    estimated_minutes, completion_requirements, allow_retakes
  )
  select
    id,
    'Responsibility of Leadership Knowledge Check',
    'Answer each question. A score of 80% or higher is required. You may retake the knowledge check.',
    'quiz',
    true,
    3,
    10,
    '{"passing_score_percent":80}'::jsonb,
    true
  from course_record
  on conflict (course_id, title) do update set
    instructions = excluded.instructions,
    module_type = excluded.module_type,
    display_order = excluded.display_order,
    estimated_minutes = excluded.estimated_minutes,
    completion_requirements = excluded.completion_requirements,
    allow_retakes = excluded.allow_retakes
  returning id
),
ack_module as (
  insert into public.leadership_modules (
    course_id, title, instructions, module_type, is_required, display_order,
    estimated_minutes, completion_requirements
  )
  select
    id,
    'Leadership Responsibility Acknowledgment',
    'Complete the acknowledgment to finish Module 1.',
    'acknowledgment',
    true,
    4,
    5,
    jsonb_build_object(
      'statement',
      'I understand that leadership at BTW Global is a responsibility for people, standards, decisions, development, culture, and results. I commit to demonstrating compassion, fairness, consistency, accountability, humility, and respect in my everyday leadership.'
    )
  from course_record
  on conflict (course_id, title) do update set
    instructions = excluded.instructions,
    module_type = excluded.module_type,
    display_order = excluded.display_order,
    estimated_minutes = excluded.estimated_minutes,
    completion_requirements = excluded.completion_requirements
  returning id
),
questions as (
  insert into public.leadership_quiz_questions (
    module_id, question_type, prompt, display_order, points
  )
  select id, 'multiple_choice',
    'At BTW Global, what is the best description of leadership?', 1, 1
  from quiz_module
  union all
  select id, 'multiple_choice',
    'What happens when compassion is practiced without accountability?', 2, 1
  from quiz_module
  union all
  select id, 'true_false',
    'A high-performing employee should be held to the same conduct standards as the rest of the team.', 3, 1
  from quiz_module
  union all
  select id, 'multiple_choice',
    'What should a leader do first when an employee makes a mistake?', 4, 1
  from quiz_module
  union all
  select id, 'true_false',
    'Asking for help can demonstrate humility and responsible leadership.', 5, 1
  from quiz_module
  on conflict (module_id, prompt) do update set
    question_type = excluded.question_type,
    display_order = excluded.display_order,
    points = excluded.points
  returning id, prompt
)
insert into public.leadership_quiz_options (
  question_id, option_text, is_correct, display_order
)
select q.id, o.option_text, o.is_correct, o.display_order
from questions q
cross join lateral (
  values
    ('At BTW Global, what is the best description of leadership?', 'Authority to direct employees', false, 1),
    ('At BTW Global, what is the best description of leadership?', 'Responsibility for people and results', true, 2),
    ('At BTW Global, what is the best description of leadership?', 'A reward for strong technical performance', false, 3),
    ('What happens when compassion is practiced without accountability?', 'It can become avoidance', true, 1),
    ('What happens when compassion is practiced without accountability?', 'It automatically builds trust', false, 2),
    ('What happens when compassion is practiced without accountability?', 'It eliminates the need for standards', false, 3),
    ('A high-performing employee should be held to the same conduct standards as the rest of the team.', 'True', true, 1),
    ('A high-performing employee should be held to the same conduct standards as the rest of the team.', 'False', false, 2),
    ('What should a leader do first when an employee makes a mistake?', 'Publicly correct the employee', false, 1),
    ('What should a leader do first when an employee makes a mistake?', 'Determine whether expectations, training, and tools were clear', true, 2),
    ('What should a leader do first when an employee makes a mistake?', 'Ignore the issue if productivity is high', false, 3),
    ('Asking for help can demonstrate humility and responsible leadership.', 'True', true, 1),
    ('Asking for help can demonstrate humility and responsible leadership.', 'False', false, 2)
) as o(prompt, option_text, is_correct, display_order)
where q.prompt = o.prompt
on conflict (question_id, option_text) do update set
  is_correct = excluded.is_correct,
  display_order = excluded.display_order;
