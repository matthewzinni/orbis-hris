-- Orbis: Kyle Hodges — supervisor over Ryan Bird (BTW2105)
-- Run in Supabase SQL Editor or via service role after auth user exists for work email.

begin;

delete from public.user_access
where lower(trim(email)) in (
  lower(trim('kyle.hodges@btwglobal.com')),
  lower(trim('kyle_s_hodges@yahoo.com'))
);

insert into public.user_access (
  email,
  display_name,
  role,
  supervisor_name,
  supervised_employee_ids,
  can_delete
)
values (
  lower(trim('kyle.hodges@btwglobal.com')),
  'Kyle Hodges',
  'supervisor',
  'Kyle Hodges',
  array['BTW2105']::text[],
  false
);

-- Ryan Bird already has supervisor = 'Kyle Hodges' on employees; normalize if needed:
update public.employees
set supervisor = 'Kyle Hodges'
where id = 'BTW2105'
  and trim(coalesce(supervisor, '')) <> 'Kyle Hodges';

commit;

-- select email, role, supervisor_name, supervised_employee_ids from public.user_access
-- where lower(trim(email)) = 'kyle.hodges@btwglobal.com';
