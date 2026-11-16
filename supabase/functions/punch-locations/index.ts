// Attendance → "Clock-in locations": where each clock-in / clock-out happened on one day, for
// punches made in Orbis (exact GPS saved by qbt-clock) and in the QuickBooks Time app (closest
// GPS point the app recorded). Admins see everyone; supervisors see their team.
//
// Visibility is enforced by the database, not this code: employees and time_clock_punches are
// read with the CALLER's session, so RLS (orbis_employee_row_visible /
// orbis_employee_child_accessible) decides who appears. QuickBooks Time is only queried for
// those employees' qbt_user_ids.
//
// Body: { date: 'YYYY-MM-DD' } (Eastern time day). Secrets: QBT_ACCESS_TOKEN.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, orbisRpcAllowed, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';
import { mapUrl, spotFor, type GeoPoint, type OrbisPunch, type Sheet } from './match.ts';

const QBT_API = 'https://rest.tsheets.com/api/v1';
const ET = 'America/New_York';
const MAX_PAGES = 40;

class LocError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function etOffset(date: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: ET, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{1,2})/.exec(part || '');
  return m ? `${m[1]}${m[2].padStart(2, '0')}:00` : '-05:00';
}

async function qbtAll<T>(token: string, path: string, key: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ ...params, limit: '200', page: String(page) });
    const res = await fetch(`${QBT_API}/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (res.status === 417 && !/must be specified|not allowed|invalid/i.test(text)) break; // no results
    if (!res.ok) throw new LocError(`QuickBooks Time error (HTTP ${res.status}) reading ${path}.`, 502);
    const body = JSON.parse(text) as { results?: Record<string, Record<string, T>>; more?: boolean };
    out.push(...Object.values(body.results?.[key] || {}));
    if (!body.more) break;
  }
  return out;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_access_is_approved', 'punch-locations');
  if (!auth.ok) return auth.response;

  try {
    const [isAdmin, isSupervisor] = await Promise.all([
      orbisRpcAllowed(auth.supabaseUrl, auth.supabaseAnonKey, auth.authHeader, 'orbis_is_admin', 'punch-locations'),
      orbisRpcAllowed(auth.supabaseUrl, auth.supabaseAnonKey, auth.authHeader, 'orbis_is_supervisor', 'punch-locations'),
    ]);
    if (!isAdmin && !isSupervisor) return jsonResponse({ error: 'Forbidden' }, 403);

    const token = String(Deno.env.get('QBT_ACCESS_TOKEN') || '').trim();
    if (!token) throw new LocError('QuickBooks Time is not connected.', 503);

    const body = (await req.json().catch(() => ({}))) as { date?: string };
    const date = String(body.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new LocError('Pick a date.');
    const offset = etOffset(date);
    const dayStart = new Date(`${date}T00:00:00${offset}`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    // Caller's own session: RLS limits rows to what this person may see.
    const asCaller = createClient(auth.supabaseUrl, auth.supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: auth.authHeader } },
    });
    const { data: empRows, error: empErr } = await asCaller
      .from('employees')
      .select('id, first_name, last_name, status, qbt_user_id');
    if (empErr) throw new Error(empErr.message);
    const employees = (empRows || []).filter(
      (e) => e.qbt_user_id && String(e.status || '').toUpperCase() !== 'TERMINATED'
    ) as Array<{ id: string; first_name: string | null; last_name: string | null; qbt_user_id: string }>;
    const byQbt = new Map(employees.map((e) => [String(e.qbt_user_id), e]));
    if (!byQbt.size) return jsonResponse({ ok: true, date, rows: [] });

    const { data: punchRows, error: punchErr } = await asCaller
      .from('time_clock_punches')
      .select('employee_id, qbt_timesheet_id, action, punched_at, latitude, longitude, accuracy_m')
      .gte('punched_at', new Date(dayStart.getTime() - 86400000).toISOString())
      .lt('punched_at', new Date(dayEnd.getTime() + 86400000).toISOString());
    if (punchErr) throw new Error(punchErr.message);
    const punches = (punchRows || []) as OrbisPunch[];

    const userIds = [...byQbt.keys()];
    const sheets: Sheet[] = [];
    const points: GeoPoint[] = [];
    for (const ids of chunks(userIds, 50)) {
      const [s, g] = await Promise.all([
        qbtAll<Sheet>(token, 'timesheets', 'timesheets', {
          user_ids: ids.join(','),
          start_date: date,
          end_date: date,
        }),
        qbtAll<GeoPoint>(token, 'geolocations', 'geolocations', {
          user_ids: ids.join(','),
          modified_since: new Date(dayStart.getTime() - 3600000).toISOString().replace('.000Z', '+00:00'),
          modified_before: new Date(dayEnd.getTime() + 3600000).toISOString().replace('.000Z', '+00:00'),
        }),
      ]);
      sheets.push(...s);
      points.push(...g);
    }

    const rows = sheets
      .filter((s) => (s.type || 'regular') === 'regular' && s.start)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .map((s) => {
        const emp = byQbt.get(String(s.user_id));
        const clockIn = spotFor(s, 'clock_in', punches, points);
        const clockOut = spotFor(s, 'clock_out', punches, points);
        const withLink = (spot: typeof clockIn) => (spot ? { ...spot, map_url: mapUrl(spot.latitude, spot.longitude) } : null);
        return {
          employee_id: emp?.id || '',
          name: `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() || `QuickBooks Time user ${s.user_id}`,
          timesheet_id: s.id,
          clock_in: withLink(clockIn),
          clock_out: withLink(clockOut),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return jsonResponse({ ok: true, date, rows });
  } catch (err) {
    if (err instanceof LocError) return jsonResponse({ error: err.message }, err.status);
    console.error('[punch-locations]', err instanceof Error ? err.message : err);
    return jsonResponse({ error: 'Could not load clock-in locations.' }, 500);
  }
});
