-- Backfill tenure_months / tenure_years from hire_date when missing or zero.

update public.employees e
set
  tenure_months = sub.months,
  tenure_years = sub.years
from (
  select
    id,
    greatest(
      0,
      (extract(year from age(current_date, hire_date))::int * 12)
      + extract(month from age(current_date, hire_date))::int
    ) as months,
    extract(year from age(current_date, hire_date))::int as years
  from public.employees
  where hire_date is not null
) sub
where e.id = sub.id
  and (
    e.tenure_months is null
    or e.tenure_months = 0
    or e.tenure_years is null
    or e.tenure_years = 0
  );
