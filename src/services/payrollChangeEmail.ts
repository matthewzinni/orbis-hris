/**
 * Ask the notify-payroll-change Edge Function to email payroll/accounting about a
 * newly logged payroll handoff. Fire-and-forget: a failure is logged and never
 * blocks or undoes the hire, termination, or other change that logged the handoff.
 * The function decides which change types email and guarantees one email per handoff.
 */

import { supabaseClient } from './supabaseClient';

export function requestPayrollChangeEmail(handoffId: string): void {
  const id = String(handoffId || '').trim();
  if (!id) return;

  try {
    void supabaseClient.functions
      .invoke('notify-payroll-change', { body: { handoff_id: id } })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[PayrollChangeEmail] Payroll email failed:', error.message);
          return;
        }
        const result = (data || {}) as { skipped?: boolean; reason?: string; event?: string };
        if (result.skipped && result.reason !== 'Event not enabled') {
          console.info('[PayrollChangeEmail] Payroll email skipped:', result.reason);
        }
      })
      .catch((err) => {
        console.warn('[PayrollChangeEmail] Payroll email failed:', err);
      });
  } catch (err) {
    console.warn('[PayrollChangeEmail] Payroll email failed:', err);
  }
}
