-- Track the automatic payroll/accounting email for each payroll handoff
-- (supabase/functions/notify-payroll-change). sent_at is claimed before sending so
-- a handoff emails at most once; error holds the last failure when a send fails.

alter table public.payroll_handoffs
  add column if not exists payroll_email_sent_at timestamptz,
  add column if not exists payroll_email_error text;
