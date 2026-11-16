// Mirror approved Orbis PTO into QuickBooks Time as an approved time-off request.
//
// The function only copies the CURRENT state of the Orbis leave request (which RLS already
// guards), so any approved Orbis user may trigger it after approving, denying, cancelling or
// editing a request:
//   approved PTO, not yet sent        → create an approved QBT time-off request
//   approved PTO, dates/hours changed → cancel the old QBT request, create a new one
//   no longer approved PTO            → cancel the QBT request
// QBT users are matched ONLY via employees.qbt_user_id (never by name) so time off can't land
// on the wrong person. If QBT already has time off on those dates, nothing is sent ("skipped").
//
// Body:
//   { leave_request_id }                       push one request
//   { leave_request_id, cancel_only: true }    admins: cancel the QBT request (before deleting)
//   { reconcile: true }                        admins: retry everything not yet in sync
//
// Secrets: QBT_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY is provided by Supabase.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, orbisRpcAllowed, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';
import { planPush, type LeaveRow, type QbtEntryDraft } from './plan.ts';

const QBT_API = 'https://rest.tsheets.com/api/v1';
const PTO_JOBCODE_NAME = 'paid time off (pto)';
const STALE_SENDING_MS = 5 * 60 * 1000;
const LEAVE_COLUMNS =
  'id,employee_id,leave_type,start_date,end_date,hours,status,deduct_from_pto_balance,notes,approved_by,' +
  'qbt_time_off_request_id,qbt_sync_status,qbt_sync_signature';

class QbtError extends Error {}

type LeaveRecord = LeaveRow & { notes: string | null; approved_by: string | null };
type Outcome = { id: string; result: string; detail?: string };

async function qbt(token: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${QBT_API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 417 && method === 'GET') return { results: {} }; // filter matched nothing
  if (res.status === 401) {
    throw new QbtError('QuickBooks Time rejected QBT_ACCESS_TOKEN (HTTP 401). Create a new token and update the secret.');
  }
  const text = await res.text();
  if (!res.ok) throw new QbtError(`QuickBooks Time HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** QBT bulk endpoints report per-item failures inside a 200 response. */
function firstResult(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const items = ((body.results as Record<string, unknown>)?.[key] || {}) as Record<string, Record<string, unknown>>;
  const item = Object.values(items)[0];
  if (!item) throw new QbtError('QuickBooks Time returned no result.');
  const code = Number(item._status_code || 200);
  if (code >= 300) {
    const extra = item._status_extra ? ` ${String(item._status_extra)}` : '';
    throw new QbtError(`QuickBooks Time: ${String(item._status_message || `error ${code}`)}.${extra}`.trim());
  }
  return item;
}

async function ptoJobcodeId(token: string): Promise<number> {
  const body = await qbt(token, 'GET', 'jobcodes?type=pto&active=both');
  const codes = ((body.results as Record<string, unknown>)?.jobcodes || {}) as Record<string, { id: number; name?: string }>;
  const hit = Object.values(codes).find((c) => String(c.name || '').trim().toLowerCase() === PTO_JOBCODE_NAME);
  if (!hit) throw new QbtError('QuickBooks Time has no "Paid Time Off (PTO)" code.');
  return Number(hit.id);
}

function etOffset(date: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{1,2})/.exec(part || '');
  return m ? `${m[1]}${m[2].padStart(2, '0')}:00` : '-05:00';
}

/** Existing pending/approved QBT time off for this user on any of the dates (excluding one request). */
async function existingTimeOff(
  token: string,
  qbtUserId: string,
  entries: QbtEntryDraft[],
  ignoreRequestId: string
): Promise<string[]> {
  const first = entries[0].date;
  const last = entries[entries.length - 1].date;
  const qs = new URLSearchParams({
    user_ids: qbtUserId,
    start_time: `${first}T00:00:00${etOffset(first)}`,
    end_time: `${last}T23:59:59${etOffset(last)}`,
  });
  const body = await qbt(token, 'GET', `time_off_request_entries?${qs}`);
  const found = ((body.results as Record<string, unknown>)?.time_off_request_entries || {}) as Record<
    string,
    { date?: string; status?: string; active?: boolean; time_off_request_id?: number }
  >;
  const dates = new Set(entries.map((e) => e.date));
  return Object.values(found)
    .filter(
      (e) =>
        e.active !== false &&
        (e.status === 'approved' || e.status === 'pending') &&
        String(e.time_off_request_id || '') !== ignoreRequestId &&
        dates.has(String(e.date || ''))
    )
    .map((e) => String(e.date));
}

async function cancelQbtRequest(token: string, qbtRequestId: string): Promise<void> {
  const body = await qbt(token, 'GET', `time_off_requests?ids=${encodeURIComponent(qbtRequestId)}`);
  const req = Object.values(
    ((body.results as Record<string, unknown>)?.time_off_requests || {}) as Record<string, { time_off_request_entries?: number[] }>
  )[0];
  if (!req) return; // already gone in QBT
  const entryIds = req.time_off_request_entries || [];
  if (!entryIds.length) return;

  const entriesBody = await qbt(token, 'GET', `time_off_request_entries?ids=${entryIds.join(',')}`);
  const open = Object.values(
    ((entriesBody.results as Record<string, unknown>)?.time_off_request_entries || {}) as Record<
      string,
      { id: number; status?: string }
    >
  ).filter((e) => e.status !== 'canceled' && e.status !== 'denied');
  if (!open.length) return;

  const res = await qbt(token, 'PUT', 'time_off_request_entries', {
    data: open.map((e) => ({ id: e.id, status: 'canceled' })),
  });
  const items = ((res.results as Record<string, unknown>)?.time_off_request_entries || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const bad = Object.values(items).find((i) => Number(i._status_code || 200) >= 300);
  if (bad) throw new QbtError(`QuickBooks Time could not cancel the request: ${String(bad._status_message || '')}`);
}

async function createQbtRequest(
  token: string,
  qbtUserId: string,
  jobcodeId: number,
  entries: QbtEntryDraft[],
  row: LeaveRecord
): Promise<string> {
  const note = [
    `Approved in Orbis${row.approved_by ? ` by ${row.approved_by}` : ''}.`,
    row.notes ? String(row.notes).slice(0, 400) : '',
    `Orbis request ${row.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const body = await qbt(token, 'POST', 'time_off_requests', {
    data: [
      {
        user_id: Number(qbtUserId),
        time_off_request_notes: [{ note }],
        time_off_request_entries: entries.map((e) => ({
          date: e.date,
          entry_method: 'manual',
          duration: e.duration,
          jobcode_id: jobcodeId,
          status: 'approved',
        })),
      },
    ],
  });
  const created = firstResult(body, 'time_off_requests');
  if (!created.id) throw new QbtError('QuickBooks Time did not return a request id.');
  return String(created.id);
}

async function pushOne(
  admin: SupabaseClient,
  token: string,
  getJobcode: () => Promise<number>,
  id: string,
  cancelOnly: boolean
): Promise<Outcome> {
  const { data, error } = await admin.from('leave_requests').select(LEAVE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { id, result: 'not_found' };
  const row = data as unknown as LeaveRecord;

  const plan = cancelOnly
    ? row.qbt_time_off_request_id && row.qbt_sync_status !== 'canceled'
      ? { action: 'cancel' as const, qbtRequestId: String(row.qbt_time_off_request_id) }
      : { action: 'none' as const, reason: 'nothing in QuickBooks Time' }
    : planPush(row);
  if (plan.action === 'none') return { id, result: 'unchanged', detail: plan.reason };

  // Claim the row so two calls can't both create a QBT request.
  const now = new Date();
  const stale = new Date(now.getTime() - STALE_SENDING_MS).toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from('leave_requests')
    .update({ qbt_sync_status: 'sending', qbt_sync_attempted_at: now.toISOString() })
    .eq('id', id)
    .or(`qbt_sync_status.is.null,qbt_sync_status.neq.sending,qbt_sync_attempted_at.lt.${stale}`)
    .select('id');
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) return { id, result: 'busy', detail: 'another update is in progress' };

  const save = async (patch: Record<string, unknown>) => {
    const { error: saveErr } = await admin.from('leave_requests').update(patch).eq('id', id);
    if (saveErr) throw new Error(saveErr.message);
  };

  try {
    if (plan.action === 'cancel') {
      await cancelQbtRequest(token, plan.qbtRequestId);
      await save({ qbt_sync_status: 'canceled', qbt_sync_error: null, qbt_synced_at: new Date().toISOString() });
      return { id, result: 'canceled' };
    }

    const { data: emp, error: empErr } = await admin
      .from('employees')
      .select('qbt_user_id')
      .eq('id', row.employee_id)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    const qbtUserId = String((emp as { qbt_user_id?: string | null } | null)?.qbt_user_id || '').trim();
    if (!qbtUserId) {
      throw new QbtError('This employee is not linked to a QuickBooks Time user (missing QuickBooks Time user id).');
    }

    const previousId = plan.action === 'replace' ? plan.qbtRequestId : '';
    const clash = await existingTimeOff(token, qbtUserId, plan.entries, previousId);
    if (clash.length) {
      if (previousId) await cancelQbtRequest(token, previousId);
      await save({
        qbt_sync_status: 'skipped',
        qbt_time_off_request_id: null,
        qbt_sync_signature: null,
        qbt_sync_error: `QuickBooks Time already has time off on ${[...new Set(clash)].join(', ')}, so Orbis did not add it again.`,
        qbt_synced_at: new Date().toISOString(),
      });
      return { id, result: 'skipped', detail: 'already in QuickBooks Time' };
    }

    if (previousId) await cancelQbtRequest(token, previousId);
    const newId = await createQbtRequest(token, qbtUserId, await getJobcode(), plan.entries, row);
    await save({
      qbt_sync_status: 'synced',
      qbt_time_off_request_id: Number(newId),
      qbt_sync_signature: plan.signature,
      qbt_sync_error: null,
      qbt_synced_at: new Date().toISOString(),
    });
    return { id, result: previousId ? 'replaced' : 'created' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await save({ qbt_sync_status: 'failed', qbt_sync_error: message.slice(0, 500) }).catch(() => {});
    return { id, result: 'failed', detail: message };
  }
}

async function idsToReconcile(admin: SupabaseClient): Promise<string[]> {
  const [toSend, toCancel] = await Promise.all([
    admin
      .from('leave_requests')
      .select('id')
      .eq('status', 'approved')
      .ilike('leave_type', 'pto')
      .eq('deduct_from_pto_balance', true)
      .or('qbt_sync_status.is.null,qbt_sync_status.eq.failed')
      .limit(100),
    admin
      .from('leave_requests')
      .select('id')
      .neq('status', 'approved')
      .not('qbt_time_off_request_id', 'is', null)
      .in('qbt_sync_status', ['synced', 'failed'])
      .limit(100),
  ]);
  if (toSend.error) throw new Error(toSend.error.message);
  if (toCancel.error) throw new Error(toCancel.error.message);
  return [...(toSend.data || []), ...(toCancel.data || [])].map((r) => String((r as { id: string }).id));
}

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_access_is_approved', 'push-leave-to-qbt');
  if (!auth.ok) return auth.response;

  try {
    const token = String(Deno.env.get('QBT_ACCESS_TOKEN') || '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!token) return jsonResponse({ error: 'QuickBooks Time is not connected. Set the QBT_ACCESS_TOKEN secret.' }, 503);
    if (!serviceKey) return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY is not available.' }, 503);

    const body = (await req.json().catch(() => ({}))) as {
      leave_request_id?: string;
      cancel_only?: boolean;
      reconcile?: boolean;
    };
    const adminOnly = body.reconcile === true || body.cancel_only === true;
    if (
      adminOnly &&
      !(await orbisRpcAllowed(auth.supabaseUrl, auth.supabaseAnonKey, auth.authHeader, 'orbis_is_admin', 'push-leave-to-qbt'))
    ) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const admin = createClient(auth.supabaseUrl, serviceKey);
    let jobcode: number | null = null;
    const getJobcode = async () => (jobcode ??= await ptoJobcodeId(token));

    const ids = body.reconcile === true ? await idsToReconcile(admin) : [String(body.leave_request_id || '').trim()];
    if (!ids[0] && body.reconcile !== true) return jsonResponse({ error: 'leave_request_id is required.' }, 400);

    const results: Outcome[] = [];
    for (const id of ids) {
      results.push(await pushOne(admin, token, getJobcode, id, body.cancel_only === true));
    }
    const failed = results.filter((r) => r.result === 'failed');
    return jsonResponse({ ok: failed.length === 0, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[push-leave-to-qbt]', message);
    return jsonResponse({ error: message }, err instanceof QbtError ? 502 : 500);
  }
});
