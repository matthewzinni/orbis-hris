/**
 * Mirror approved Orbis PTO into QuickBooks Time (push-leave-to-qbt Edge Function).
 * Called after approve / deny / cancel / edit; the function reads the request's current state,
 * so calling it when nothing changed is harmless.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export type QbtPushOutcome = { id: string; result: string; detail?: string };

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    try {
      const json = (await res.clone().json()) as { error?: string };
      if (json?.error) return json.error;
    } catch {
      /* fall through */
    }
    if (res.status === 404) return 'The push-leave-to-qbt function is not deployed yet.';
    return `Edge function HTTP ${res.status}.`;
  }
  return error instanceof Error ? error.message : 'Could not reach QuickBooks Time.';
}

async function invoke(body: Record<string, unknown>): Promise<QbtPushOutcome[]> {
  const { data, error } = await supabaseClient.functions.invoke('push-leave-to-qbt', { body });
  if (error) throw new Error(await describeInvokeFailure(error));
  const payload = (data || {}) as { error?: string; results?: QbtPushOutcome[] };
  if (payload.error) throw new Error(payload.error);
  return payload.results || [];
}

function toast(message: string, type: string): void {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') window.showToast(message, type);
}

/** Toast only when something actually happened in QuickBooks Time (or failed). */
function report(outcomes: QbtPushOutcome[]): void {
  for (const o of outcomes) {
    if (o.result === 'created' || o.result === 'replaced') toast('Sent to QuickBooks Time as approved PTO.', 'success');
    else if (o.result === 'canceled') toast('Canceled in QuickBooks Time.', 'success');
    else if (o.result === 'skipped') toast('QuickBooks Time already has time off on those dates — not added again.', 'info');
    else if (o.result === 'failed') toast(`QuickBooks Time not updated: ${o.detail || 'unknown error'}`, 'error');
  }
}

/** Mirror one request. Never throws; problems are shown as a toast and saved on the request. */
export async function pushLeaveToQbt(leaveRequestId: string): Promise<void> {
  if (!leaveRequestId) return;
  try {
    report(await invoke({ leave_request_id: leaveRequestId }));
  } catch (err) {
    toast(`QuickBooks Time not updated: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

/** Admins, before deleting a request: cancel its QuickBooks Time copy. Throws so the delete stops. */
export async function cancelLeaveInQbt(leaveRequestId: string): Promise<void> {
  const outcomes = await invoke({ leave_request_id: leaveRequestId, cancel_only: true });
  const failed = outcomes.find((o) => o.result === 'failed');
  if (failed) throw new Error(`Could not cancel it in QuickBooks Time first: ${failed.detail || 'unknown error'}`);
}

/** Admins: send every approved PTO request that is not yet in QuickBooks Time, and cancel stale ones. */
export async function reconcileLeaveWithQbt(): Promise<QbtPushOutcome[]> {
  return invoke({ reconcile: true });
}
