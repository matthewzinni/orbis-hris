-- Persist emergency contact call order: Primary, Secondary, Tertiary, etc.

alter table public.emergency_contacts
  add column if not exists priority_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by employee_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.emergency_contacts
)
update public.emergency_contacts ec
set priority_order = ranked.rn
from ranked
where ec.id = ranked.id
  and ec.priority_order is null;

alter table public.emergency_contacts
  alter column priority_order set default 1;

update public.emergency_contacts
set priority_order = 1
where priority_order is null;

alter table public.emergency_contacts
  alter column priority_order set not null;

create index if not exists emergency_contacts_employee_priority_idx
  on public.emergency_contacts (employee_id, priority_order);
