-- Module 1 content for the first BTW Leadership Academy course.
-- Idempotent so catalog content can be safely promoted between environments.

create unique index if not exists leadership_program_tiers_name_unique_idx
  on public.leadership_program_tiers (name);
create unique index if not exists leadership_courses_tier_title_unique_idx
  on public.leadership_courses (tier_id, title);
create unique index if not exists leadership_modules_course_title_unique_idx
  on public.leadership_modules (course_id, title);

with emerging_tier as (
  insert into public.leadership_program_tiers (
    name, description, intended_audience, status, display_order,
    estimated_hours, completion_requirements
  )
  values (
    'Emerging Leader',
    'Foundational leadership expectations for current and future people leaders.',
    'High-potential employees, team leads, and newly promoted supervisors',
    'active',
    1,
    12,
    'Complete all required lessons, reflections, knowledge checks, and acknowledgments.'
  )
  on conflict (name) do update set
    description = excluded.description,
    intended_audience = excluded.intended_audience,
    updated_at = now()
  returning id
),
course_record as (
  insert into public.leadership_courses (
    tier_id, title, description, status, is_required, estimated_minutes,
    display_order, passing_score_percent, due_rule_days, cover_icon
  )
  select
    id,
    'What It Means to Lead at BTW',
    'The foundational expectations, responsibilities, and everyday behaviors of a BTW Global leader.',
    'draft',
    true,
    90,
    1,
    80,
    30,
    '◆'
  from emerging_tier
  on conflict (tier_id, title) do update set
    description = excluded.description,
    estimated_minutes = excluded.estimated_minutes,
    passing_score_percent = excluded.passing_score_percent,
    due_rule_days = excluded.due_rule_days,
    updated_at = now()
  returning id
)
insert into public.leadership_modules (
  course_id, title, instructions, module_type, is_required, display_order,
  estimated_minutes, completion_requirements
)
select
  id,
  'The Responsibility of Leadership',
  $lesson$
## Purpose
Leadership is not simply a title, a promotion, or the authority to tell other people what to do. At BTW Global, leadership is a responsibility to care for people, establish clear standards, make sound decisions, and help the team succeed.

## Learning Objectives
* Explain what leadership means at BTW Global.
* Describe the difference between authority and responsibility.
* Identify the people and business responsibilities of a leader.
* Recognize behaviors that build or damage trust.
* Explain why compassion and accountability must coexist.
* Identify one leadership behavior to strengthen.

## Opening Question
> When employees describe their experience working for you, what do you want them to say?

## Leadership Is a Responsibility
A job title may give someone authority, but authority alone does not make that person an effective leader.

Leaders accept responsibility for the way employees are treated, the standards the team follows, the clarity of expectations, the development of employees, the decisions made within the team, the culture created through everyday behavior, and the results the team produces.

Leaders influence how employees experience the workplace. That influence exists whether the leader is thinking about it or not. At BTW Global, leadership means using that influence intentionally and responsibly.

## People and Results
Effective leadership is not a choice between caring about people and achieving results. Leaders are responsible for both.

Compassion means listening before making assumptions, treating employees with dignity, recognizing that people may face challenges outside work, and correcting mistakes without belittling the person.

Accountability means establishing clear expectations, applying standards consistently, addressing problems promptly, following through, and expecting ownership.

Compassion without accountability can become avoidance. Accountability without compassion can become control. Strong leadership requires both.

## Leaders Establish the Standard
Employees pay attention to what leaders consistently do, tolerate, recognize, and correct. Leading by example means meeting the standards expected from others, acknowledging mistakes, and correcting your own behavior.

## Fairness Builds Trust
Employees do not expect every situation to have the same outcome. They do expect decisions to be made honestly, consistently, and without favoritism.

Fair leaders apply the same core standards, use relevant facts, listen to the people involved, protect confidential information, and ask for help when they are unsure.

## Leaders Teach and Develop Others
When an employee makes a mistake, determine whether the expectation was clear, the employee was properly trained, the right tools were available, and whether the issue was a mistake, skill gap, or deliberate choice.

Coaching does not mean ignoring poor performance. It means addressing the behavior, its impact, the expected standard, and the next step in a way that gives the employee clarity and a reasonable opportunity to improve.

## Leaders Do Not Have to Know Everything
Responsible leaders listen, ask questions, seek guidance, involve Human Resources when appropriate, change direction when better information becomes available, and admit mistakes.

Asking for help is not a leadership failure. Humility allows leaders to keep learning and gives employees permission to contribute ideas.

## Scenario: The High Performer
Jordan is one of the department's most productive employees. Jordan has also started arriving late and speaking disrespectfully to newer employees. The supervisor has not addressed it because Jordan is difficult to replace.

Consider what the supervisor's silence communicates to Jordan and the rest of the team. A responsible leader should address the behavior privately, recognize Jordan's contributions, describe the observed conduct and its impact, restate expectations, listen, establish the required improvement, and document the conversation when appropriate.

## Personal Reflection
* Which leadership responsibility comes most naturally to you?
* Which responsibility may be the most difficult for you?
* Describe a leader who made a positive difference in your work experience.
* What is one behavior you will practice to become a more responsible leader?

## Key Takeaways
* Leadership is a responsibility, not simply a title.
* Leaders are responsible for both people and results.
* Compassion and accountability should coexist.
* Fairness and consistency build trust.
* Leaders coach, teach, listen, and acknowledge mistakes.
* Leadership is demonstrated through everyday decisions and behavior.

## Completion
Review the lesson, discuss or record your reflection responses, complete the knowledge check, and acknowledge your responsibility for people, standards, decisions, development, culture, and results.
  $lesson$,
  'written',
  true,
  1,
  20,
  '{"reflection_questions":4,"passing_score_percent":80,"acknowledgment_required":true}'::jsonb
from course_record
on conflict (course_id, title) do update set
  instructions = excluded.instructions,
  estimated_minutes = excluded.estimated_minutes,
  completion_requirements = excluded.completion_requirements,
  updated_at = now();
