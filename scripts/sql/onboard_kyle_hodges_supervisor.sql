-- Orbis: Kyle Hodges — supervisor over Business Development direct reports
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
  (
    select coalesce(array_agg(e.id::text), array[]::text[])
    from public.employees e
    where upper(trim(coalesce(e.status, ''))) not in ('TERMINATED', 'INACTIVE')
      and trim(coalesce(e.supervisor, '')) = 'Kyle Hodges'
  ),
  false
);

update public.employees
set supervisor = 'Kyle Hodges'
where id in ('BTW2105', 'BTW2301', 'BTW2402', 'BTW2610')
  and trim(coalesce(supervisor, '')) <> 'Kyle Hodges';

commit;

-- select email, role, supervisor_name, supervised_employee_ids from public.user_access
-- where lower(trim(email)) = 'kyle.hodges@btwglobal.com';
