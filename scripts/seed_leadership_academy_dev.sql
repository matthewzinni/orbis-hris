-- =============================================================================
-- BTW Leadership Academy — dev / demo catalog seed
--
-- ⚠️  NEVER run on BTW Global production.
--     Use scripts/seed_leadership_academy_dev.sql only on training/demo projects.
--
-- Seeds program tiers, starter competencies, philosophy draft, and a sample course.
-- Does NOT create participant enrollments.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from public.employees where id like 'BTW%' limit 1) then
    raise exception
      'seed_leadership_academy_dev.sql must not run on BTW production (BTW#### ids found).';
  end if;
end $$;

-- Clear prior leadership academy catalog seed (dev only)
delete from public.leadership_quiz_options
where question_id in (
  select q.id
  from public.leadership_quiz_questions q
  join public.leadership_modules m on m.id = q.module_id
  join public.leadership_courses c on c.id = m.course_id
  where c.title = 'What It Means to Lead at BTW'
);

delete from public.leadership_quiz_questions
where module_id in (
  select m.id
  from public.leadership_modules m
  join public.leadership_courses c on c.id = m.course_id
  where c.title = 'What It Means to Lead at BTW'
);

delete from public.leadership_modules
where course_id in (
  select id from public.leadership_courses where title = 'What It Means to Lead at BTW'
);

delete from public.leadership_courses where title = 'What It Means to Lead at BTW';
delete from public.leadership_competencies where name like '[Seed]%';
delete from public.leadership_program_tiers where name in (
  'Emerging Leader',
  'Supervisor Academy',
  'Manager Development',
  'Executive Leadership'
);
delete from public.leadership_philosophy_content where title = 'What Leadership Means at BTW';

insert into public.leadership_program_tiers
  (name, description, intended_audience, status, display_order, estimated_hours, completion_requirements)
values
  ('Emerging Leader', 'Foundational leadership expectations for new people leaders.', 'High-potential individual contributors and new leads', 'active', 1, 12, 'Complete required courses and acknowledgments.'),
  ('Supervisor Academy', 'Supervisory fundamentals for front-line leaders.', 'Supervisors with direct reports', 'active', 2, 20, 'Complete required courses, workshops, and competency checkpoints.'),
  ('Manager Development', 'Intermediate leadership development for managers.', 'Managers leading supervisors or multi-team scope', 'active', 3, 28, 'Complete required courses and development goals.'),
  ('Executive Leadership', 'Advanced leadership development for senior leaders.', 'Directors and executive team members', 'active', 4, 36, 'Complete executive curriculum and coaching milestones.');

insert into public.leadership_competencies
  (name, definition, expected_behaviors, unacceptable_behaviors, applicable_tier_ids, status, display_order)
select
  seed.name,
  seed.definition,
  seed.expected_behaviors,
  seed.unacceptable_behaviors,
  coalesce(array_agg(t.id) filter (where t.name = any (seed.tier_names)), '{}'),
  'active',
  seed.display_order
from (
  values
    ('[Seed] Ownership', 'Takes responsibility for team outcomes and follow-through.', 'Communicates blockers early; closes loops.', 'Blames others; avoids accountability.', array['Emerging Leader','Supervisor Academy'], 1),
    ('[Seed] Communication', 'Creates clarity through direct, respectful communication.', 'Listens first; confirms understanding.', 'Withholds information; creates confusion.', array['Emerging Leader','Supervisor Academy','Manager Development'], 2),
    ('[Seed] Coaching', 'Develops others through feedback and support.', 'Gives timely, specific feedback.', 'Avoids difficult conversations.', array['Supervisor Academy','Manager Development'], 3)
) as seed(name, definition, expected_behaviors, unacceptable_behaviors, tier_names, display_order)
left join public.leadership_program_tiers t on t.name = any (seed.tier_names)
group by seed.name, seed.definition, seed.expected_behaviors, seed.unacceptable_behaviors, seed.tier_names, seed.display_order;

insert into public.leadership_philosophy_content (title, body, status, is_seed_draft)
values (
  'What Leadership Means at BTW',
  'Leadership at BTW Global is a daily commitment to serve people, solve problems, and elevate standards.\n\n1. People first\n2. Clear communication\n3. Ownership\n4. Continuous improvement\n5. Integrity\n6. Team success\n7. Customer impact\n8. Safety and care\n9. Accountability\n10. Learning mindset\n11. Courageous conversations\n12. Stewardship\n13. Legacy thinking',
  'draft',
  true
);

with tier as (
  select id from public.leadership_program_tiers where name = 'Emerging Leader' limit 1
),
inserted_course as (
  insert into public.leadership_courses
    (tier_id, title, description, status, is_required, estimated_minutes, display_order, passing_score_percent, due_rule_days, cover_icon)
  select
    tier.id,
    'What It Means to Lead at BTW',
    'Introductory leadership expectations and behaviors for BTW Global leaders.',
    'draft',
    true,
    90,
    1,
    80,
    30,
    '🎯'
  from tier
  returning id
)
insert into public.leadership_modules
  (course_id, title, instructions, module_type, is_required, display_order, estimated_minutes)
select
  inserted_course.id,
  module.title,
  module.instructions,
  module.module_type,
  true,
  module.display_order,
  module.estimated_minutes
from inserted_course
cross join (
  values
    ('Welcome & Expectations', 'Review what leadership means at BTW Global.', 'written', 1, 10),
    ('BTW Leadership Philosophy', 'Read the leadership philosophy themes.', 'document', 2, 15),
    ('Leadership Behaviors', 'Study expected and unacceptable behaviors.', 'written', 3, 15),
    ('Supervisor Responsibilities', 'Understand supervisor scope and accountability.', 'written', 4, 15),
    ('Reflection: Your Leadership Style', 'Reflect on your current leadership approach.', 'reflection', 5, 15),
    ('Leadership Scenarios Quiz', 'Complete the scenario quiz.', 'quiz', 6, 10),
    ('Acknowledgment', 'Acknowledge completion of this course.', 'acknowledgment', 7, 10)
) as module(title, instructions, module_type, display_order, estimated_minutes);

commit;
