// Live attendance sync from QuickBooks Time. Invoked two ways:
//   1. pg_cron every 5 minutes (see supabase/migrations/20261029210000_qbt_attendance_cron.sql),
//      authenticated with a dedicated ATTENDANCE_SYNC_SECRET bearer token (never the service
//      role key, never the QBT token itself).
//   2. The Attendance page's "Sync now" button (admin only), authenticated the normal way via
//      requireOrbisAuth -- mainly so this can be exercised on demand while testing against the
//      training project, without waiting on the cron schedule.
//
// Matches QuickBooks Time users to Orbis employees ONLY via employees.qbt_user_id (never by
// name -- that's the exact bug class already found in the PTO sync's fuzzy name matching).
// Unmapped QBT users are returned in `unmatched` for the admin mapping screen; nothing is
// written for them. Terminated employees (status = 'TERMINATED' and termination_date set) are
// never included, even if they still have a stale qbt_user_id.
//
// Secrets: QBT_ACCESS_TOKEN (read-only QuickBooks Time calls -- GET only), ATTENDANCE_SYNC_SECRET
// (shared secret for the cron path). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase automatically.
//
// Body: { preview?: boolean } -- when true, fetches and matches but does not write to
// attendance_live_status. Used by the QBT attendance mapping admin screen.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';
import { deriveAttendanceStatus, type QbtTimesheet } from './deriveStatus.ts';

const QBT_API = 'https://rest.tsheets.com/api/v1';
const ET = 'America/New_York';

type QbtUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  active?: boolean;
};

type QbtCurrentTotal = {
  // QuickBooks Time's current_totals response is keyed by user id; shape confirmed against the
  // training project during Phase 4 -- `on_the_clock` plus a shift-start timestamp field is the
  // documented convention, but verify field names against a live response before trusting this
  // in production, since we can't hit the real API from here.
  on_the_clock?: boolean;
  shift_seconds?: number;
};

type Employee = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  termination_date?: string | null;
  qbt_user_id?: string | null;
};

class QbtError extends Error {}

function todayInEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date());
}

async function qbtGetAll(
  token: string,
  path: string,
  key: string,
  params: Record<string, string>
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({ ...params, limit: '200', page: String(page) });
    const res = await fetch(`${QBT_API}/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 417) break; // QBT: filter matched nothing
    if (res.status === 401) {
      throw new QbtError(
        'QuickBooks Time rejected QBT_ACCESS_TOKEN (HTTP 401). Create a new token and update the secret.'
      );
    }
    if (!res.ok) throw new QbtError(`QuickBooks Time HTTP ${res.status} on ${path}.`);
    const body = (await res.json()) as {
      results?: Record<string, Record<string, Record<string, unknown>>>;
      more?: boolean;
    };
    Object.assign(out, body.results?.[key] || {});
    if (!body.more) break;
  }
  return out;
}

function isTerminated(e: Employee): boolean {
  return String(e.status || '').trim().toUpperCase() === 'TERMINATED' && Boolean(e.termination_date);
}

function isCronSecretAuthorized(req: Request): boolean {
  const expected = String(Deno.env.get('ATTENDANCE_SYNC_SECRET') || '').trim();
  if (!expected) return false;
  const header = req.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && match[1] === expected);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    });
  }

  const cronAuthorized = isCronSecretAuthorized(req);
  if (!cronAuthorized) {
    const auth = await requireOrbisAuth(req, 'orbis_is_admin', 'sync-qbt-attendance');
    if (!auth.ok) return auth.response;
  } else if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const token = String(Deno.env.get('QBT_ACCESS_TOKEN') || '').trim();
    const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
    const serviceKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    if (!token) {
      return jsonResponse({ error: 'QuickBooks Time is not connected. Set the QBT_ACCESS_TOKEN secret.' }, 503);
    }
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: 'Supabase service credentials are not available to this function.' }, 503);
    }

    const body = (await req.json().catch(() => ({}))) as { preview?: boolean };
    const preview = body.preview === true;

    const today = todayInEt();
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: empRows, error: empErr } = await admin
      .from('employees')
      .select('id, first_name, last_name, status, termination_date, qbt_user_id')
      .not('qbt_user_id', 'is', null);
    if (empErr) throw new Error(empErr.message);
    const employees = ((empRows || []) as Employee[]).filter((e) => !isTerminated(e));

    const byQbtId = new Map<string, Employee>();
    employees.forEach((e) => {
      const id = String(e.qbt_user_id || '').trim();
      if (id) byQbtId.set(id, e);
    });

    const [users, timesheetsByUser, currentTotals] = await Promise.all([
      qbtGetAll(token, 'users', 'users', { active: 'true' }),
      qbtGetAll(token, 'timesheets', 'timesheets', { start_date: today, end_date: today }),
      qbtGetAll(token, 'current_totals', 'current_totals', {}),
    ]);

    const timesheetsByQbtUser = new Map<string, QbtTimesheet[]>();
    Object.values(timesheetsByUser).forEach((row) => {
      const ts = row as QbtTimesheet;
      const uid = String(ts.user_id || '').trim();
      if (!uid) return;
      const list = timesheetsByQbtUser.get(uid) || [];
      list.push(ts);
      timesheetsByQbtUser.set(uid, list);
    });

    const onClockUserIds = new Set<string>();
    Object.entries(currentTotals).forEach(([userId, row]) => {
      const totals = row as QbtCurrentTotal;
      if (totals?.on_the_clock) onClockUserIds.add(String(userId));
    });

    const matched: Array<{
      employee_id: string;
      qbt_user_id: string;
      name: string;
      status: string;
      clockInAt: string | null;
      clockOutAt: string | null;
    }> = [];
    const unmatched: Array<{ qbt_user_id: string; name: string }> = [];

    Object.entries(users).forEach(([qbtUserId, row]) => {
      const user = row as QbtUser;
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const employee = byQbtId.get(String(qbtUserId));
      if (!employee) {
        unmatched.push({ qbt_user_id: String(qbtUserId), name: name || `QBT user ${qbtUserId}` });
        return;
      }
      const derived = deriveAttendanceStatus(
        onClockUserIds.has(String(qbtUserId)),
        timesheetsByQbtUser.get(String(qbtUserId)) || []
      );
      matched.push({
        employee_id: employee.id,
        qbt_user_id: String(qbtUserId),
        name: name || employee.id,
        status: derived.status,
        clockInAt: derived.clockInAt,
        clockOutAt: derived.clockOutAt,
      });
    });

    // Each employee's upsert is independent (keyed by employee_id), so one failure must not
    // drop the rest of the batch -- the exact bug class already found and fixed in the PTO sync.
    let failedCount = 0;
    const syncedAt = new Date().toISOString();
    if (!preview) {
      const results = await Promise.all(
        matched.map((m) =>
          admin.from('attendance_live_status').upsert(
            {
              employee_id: m.employee_id,
              attendance_date: today,
              status: m.status,
              clock_in_at: m.clockInAt,
              clock_out_at: m.clockOutAt,
              synced_at: syncedAt,
            },
            { onConflict: 'employee_id' }
          )
        )
      );
      results.forEach((r, i) => {
        if (r.error) {
          failedCount++;
          console.error(`[sync-qbt-attendance] Upsert failed for ${matched[i].name}:`, r.error.message);
        }
      });
    }

    return jsonResponse({
      ok: true,
      preview,
      as_of: today,
      synced_at: new Date().toISOString(),
      matched_count: matched.length,
      matched,
      unmatched,
      failed_count: failedCount,
    });
  } catch (err) {
    console.error('[sync-qbt-attendance]', err instanceof Error ? err.message : err);
    const message =
      err instanceof QbtError ? err.message : `Could not sync attendance: ${String(err instanceof Error ? err.message : err)}`;
    return jsonResponse({ error: message }, 500);
  }
});
