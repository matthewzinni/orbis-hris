-- PTO balances synced from QuickBooks Time (TSheets).
--
-- pto_balance_source:    'quickbooks_time' when the balance came from the QBT sync
--                        (scripts/sync_qbt_pto_balances.py or the sync-qbt-pto Edge Function).
--                        NULL / 'manual' = banked baseline entered in Orbis (Orbis-approved PTO
--                        is subtracted in the UI). A QuickBooks Time balance is already net of
--                        time taken, so the UI shows it as-is.
-- pto_balance_breakdown: hours per QBT PTO type, e.g. {"PTO": 32.5, "Sick": 8}.

alter table public.employees
  add column if not exists pto_balance_source text,
  add column if not exists pto_balance_breakdown jsonb;

comment on column public.employees.pto_balance_source is
  'Where pto_balance_hours came from: quickbooks_time (daily sync, already net of time taken) or manual/null (banked baseline).';
comment on column public.employees.pto_balance_breakdown is
  'Hours remaining per QuickBooks Time PTO type, from the QBT sync.';

-- Keep the "only Matthew may change PTO" rule for people, but let the server-side sync
-- (service role key: GitHub Action and sync-qbt-pto Edge Function) write balances.
create or replace function public.orbis_guard_pto_balance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return NEW;
  end if;

  if NEW.pto_balance_hours is distinct from OLD.pto_balance_hours
     or NEW.pto_balance_as_of is distinct from OLD.pto_balance_as_of
     or NEW.pto_balance_source is distinct from OLD.pto_balance_source
     or NEW.pto_balance_breakdown is distinct from OLD.pto_balance_breakdown
  then
    if not public.orbis_can_adjust_pto_balance() then
      raise exception 'Only Matthew can adjust banked PTO hours';
    end if;
  end if;

  return NEW;
end;
$$;
