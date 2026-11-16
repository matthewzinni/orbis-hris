// Employee time clock: clock in / out from Orbis, writing the real QuickBooks Time timesheet
// (payroll keeps running from QuickBooks Time). Works alongside the QuickBooks Time app — a
// shift started in either place can be ended in the other.
//
// Who is clocking in comes ONLY from the caller's login: auth email → approved user_access row →
// linked_employee_id → employees.qbt_user_id. The browser never names an employee, so nobody
// can punch for someone else. Times are the server's clock (no back-dating); the browser's time
// zone only decides which local offset the timesheet is stored with.
//
// Location is REQUIRED to clock in or out: the punch is refused (nothing sent to QuickBooks Time)
// without a valid GPS point, and the point is saved to time_clock_punches after QBT accepts it.
//
// Body: { action: 'status' | 'clock_in' | 'clock_out', tz?: IANA time zone,
//         location?: { latitude, longitude, accuracy } }  (required for clock_in / clock_out)
// Secrets: QBT_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY is provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';
import {
  localDate,
  localIso,
  parsePunchLocation,
  resolveTimeZone,
  sumWorkedSeconds,
  type ClockTimesheet,
} from './time.ts';

const QBT_API = 'https://rest.tsheets.com/api/v1';

class ClockError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

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
  if (res.status === 401) throw new ClockError('QuickBooks Time rejected the Orbis connection. Tell HR.', 502);
  const text = await res.text();
  // 417 means "no results" for a valid filter, but also "bad filter" -- never treat the latter as empty,
  // or a failed lookup would look like "not clocked in" and allow a double clock-in.
  if (res.status === 417 && method === 'GET' && !/must be specified|not allowed|invalid/i.test(text)) {
    return { results: {} };
  }
  if (!res.ok) throw new ClockError(`QuickBooks Time error (HTTP ${res.status}). Try again or use the QuickBooks Time app.`, 502);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function timesheetsFrom(body: Record<string, unknown>): ClockTimesheet[] {
  const map = ((body.results as Record<string, unknown>)?.timesheets || {}) as Record<string, ClockTimesheet>;
  return Object.values(map);
}

/** QBT bulk writes report per-item failures inside a 200 response. */
function writeResult(body: Record<string, unknown>): ClockTimesheet {
  const item = timesheetsFrom(body)[0] as (ClockTimesheet & { _status_code?: number; _status_message?: string; _status_extra?: string }) | undefined;
  if (!item) throw new ClockError('QuickBooks Time did not confirm the punch. Check the QuickBooks Time app.', 502);
  if (Number(item._status_code || 200) >= 300) {
    const why = [item._status_message, item._status_extra].filter(Boolean).join(' ');
    throw new ClockError(
      `QuickBooks Time refused the punch${why ? `: ${why}` : ''}. Use the QuickBooks Time app and tell HR.`,
      502
    );
  }
  return item;
}

async function openTimesheet(token: string, qbtUserId: string, since: string): Promise<ClockTimesheet | null> {
  // QBT requires a date filter; look back far enough to catch an overnight shift.
  const body = await qbt(
    token,
    'GET',
    `timesheets?${new URLSearchParams({ user_ids: qbtUserId, on_the_clock: 'yes', start_date: since })}`
  );
  return timesheetsFrom(body).find((t) => t.on_the_clock || (t.start && !t.end)) || null;
}

async function todaysTimesheets(token: string, qbtUserId: string, today: string): Promise<ClockTimesheet[]> {
  const body = await qbt(
    token,
    'GET',
    `timesheets?${new URLSearchParams({ user_ids: qbtUserId, start_date: today, end_date: today })}`
  );
  return timesheetsFrom(body);
}

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_access_is_approved', 'qbt-clock');
  if (!auth.ok) return auth.response;

  try {
    const token = String(Deno.env.get('QBT_ACCESS_TOKEN') || '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!token || !serviceKey) throw new ClockError('The time clock is not set up yet. Tell HR.', 503);

    const body = (await req.json().catch(() => ({}))) as { action?: string; tz?: string; location?: unknown };
    const action = String(body.action || 'status');
    if (!['status', 'clock_in', 'clock_out'].includes(action)) throw new ClockError('Unknown action.');
    const tz = resolveTimeZone(body.tz);
    const location = parsePunchLocation(body.location);
    if (action !== 'status' && !location) {
      throw new ClockError('Turn on location for this site to clock in or out. Your location is saved with each punch.', 422);
    }

    // Who is calling: email from their own session, then their approved Orbis access row.
    const userClient = createClient(auth.supabaseUrl, auth.supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: auth.authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const email = String(userData?.user?.email || '').trim().toLowerCase();
    if (!email) throw new ClockError('Sign in again to use the time clock.', 401);

    const admin = createClient(auth.supabaseUrl, serviceKey);
    const { data: access, error: accessErr } = await admin
      .from('user_access')
      .select('linked_employee_id, approval_status')
      .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1)
      .maybeSingle();
    if (accessErr) throw new Error(accessErr.message);
    const employeeId = String(access?.linked_employee_id || '').trim();
    if (!access || access.approval_status !== 'approved' || !employeeId) {
      throw new ClockError('Your login is not linked to an employee record. Tell HR.', 403);
    }

    const { data: emp, error: empErr } = await admin
      .from('employees')
      .select('id, first_name, last_name, status, qbt_user_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (!emp || String(emp.status || '').toUpperCase() === 'TERMINATED') {
      throw new ClockError('Your employee record is not active. Tell HR.', 403);
    }
    const qbtUserId = String(emp.qbt_user_id || '').trim();
    if (!qbtUserId) {
      throw new ClockError('You are not linked to QuickBooks Time yet. Use the QuickBooks Time app and tell HR.', 409);
    }

    const now = new Date();
    const today = localDate(now, tz);
    let open = await openTimesheet(token, qbtUserId, localDate(new Date(now.getTime() - 2 * 86400000), tz));
    let message = '';
    let punchedSheetId: number | null = null;

    if (action === 'clock_in') {
      if (open) throw new ClockError('You are already clocked in.', 409);
      const created = writeResult(
        await qbt(token, 'POST', 'timesheets', {
          data: [
            {
              user_id: Number(qbtUserId),
              type: 'regular',
              start: localIso(now, tz),
              end: '',
              jobcode_id: 0,
              notes: 'Clocked in from Orbis',
            },
          ],
        })
      );
      open = created;
      punchedSheetId = created.id ?? null;
      message = 'Clocked in.';
    } else if (action === 'clock_out') {
      if (!open?.id) throw new ClockError('You are not clocked in.', 409);
      writeResult(await qbt(token, 'PUT', 'timesheets', { data: [{ id: open.id, end: localIso(now, tz) }] }));
      punchedSheetId = open.id;
      open = null;
      message = 'Clocked out.';
    }

    if (action !== 'status' && location) {
      // The punch is already in QuickBooks Time; a failed location save must not undo it, but log it.
      const { error: punchErr } = await admin.from('time_clock_punches').insert({
        employee_id: employeeId,
        qbt_user_id: qbtUserId,
        qbt_timesheet_id: punchedSheetId,
        action,
        punched_at: now.toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_m: location.accuracy,
      });
      if (punchErr) console.error('[qbt-clock] location not saved:', punchErr.message);
    }

    const sheets = await todaysTimesheets(token, qbtUserId, today);
    return jsonResponse({
      ok: true,
      message,
      employee: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      on_clock: Boolean(open),
      clocked_in_at: open?.start || null,
      today,
      worked_seconds_today: sumWorkedSeconds(sheets, now),
      server_time: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof ClockError) return jsonResponse({ error: err.message }, err.status);
    console.error('[qbt-clock]', err instanceof Error ? err.message : err);
    return jsonResponse({ error: 'The time clock had a problem. Try again or use the QuickBooks Time app.' }, 500);
  }
});
