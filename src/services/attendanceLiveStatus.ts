import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export type LiveAttendanceStatus = 'on_clock' | 'worked_clocked_out' | 'manual_entry' | 'no_punch';

export type LiveAttendanceRow = {
  employeeId: string;
  status: LiveAttendanceStatus;
  clockInAt: string | null;
  clockOutAt: string | null;
  syncedAt: string;
};

export type AttendanceSyncMatch = {
  employeeId: string;
  qbtUserId: string;
  name: string;
  status: LiveAttendanceStatus;
};

export type AttendanceSyncUnmatched = {
  qbtUserId: string;
  name: string;
};

export type AttendanceSyncResult = {
  preview: boolean;
  asOf: string;
  syncedAt: string;
  matchedCount: number;
  matched: AttendanceSyncMatch[];
  unmatched: AttendanceSyncUnmatched[];
  failedCount: number;
};

export class AttendanceLiveSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttendanceLiveSyncError';
  }
}

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    try {
      const json = (await res.clone().json()) as { error?: string };
      if (json?.error) return json.error;
    } catch {
      /* fall through */
    }
    if (res.status === 404) {
      return 'The sync-qbt-attendance function is not deployed yet. Run: npx supabase functions deploy sync-qbt-attendance';
    }
    return `Edge function HTTP ${res.status}.`;
  }
  return error instanceof Error ? error.message : 'Could not reach the attendance sync service.';
}

function toAttendanceSyncResult(data: unknown): AttendanceSyncResult {
  const body = (data || {}) as Record<string, unknown>;
  return {
    preview: Boolean(body.preview),
    asOf: String(body.as_of || ''),
    syncedAt: String(body.synced_at || ''),
    matchedCount: Number(body.matched_count || 0),
    matched: ((body.matched as Array<Record<string, unknown>>) || []).map((row) => ({
      employeeId: String(row.employee_id || ''),
      qbtUserId: String(row.qbt_user_id || ''),
      name: String(row.name || ''),
      status: String(row.status || 'no_punch') as LiveAttendanceStatus,
    })),
    unmatched: ((body.unmatched as Array<Record<string, unknown>>) || []).map((row) => ({
      qbtUserId: String(row.qbt_user_id || ''),
      name: String(row.name || ''),
    })),
    failedCount: Number(body.failed_count || 0),
  };
}

/** Admin-triggered sync via the edge function (requireOrbisAuth path). preview=true matches
 * without writing to attendance_live_status -- used by the QBT mapping screen. */
export async function syncAttendanceFromQuickBooksTime(
  options: { preview: boolean } = { preview: false }
): Promise<AttendanceSyncResult> {
  const { data, error } = await supabaseClient.functions.invoke('sync-qbt-attendance', {
    body: { preview: options.preview },
  });
  if (error) throw new AttendanceLiveSyncError(await describeInvokeFailure(error));

  const body = (data || {}) as Record<string, unknown> & { error?: string };
  if (body.error) throw new AttendanceLiveSyncError(String(body.error));

  return toAttendanceSyncResult(body);
}

/** Today's live attendance rows, readable directly by anyone with attendance access (RLS
 * mirrors the manual roll-call scoping). No service role needed -- this is a plain select. */
export async function loadTodaysLiveAttendance(): Promise<LiveAttendanceRow[]> {
  const { data, error } = await supabaseClient
    .from('attendance_live_status')
    .select('employee_id, status, clock_in_at, clock_out_at, synced_at');

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
      throw new AttendanceLiveSyncError(
        'Live attendance storage is not set up yet. Run database migrations (npm run db:push).'
      );
    }
    throw new AttendanceLiveSyncError(error.message || 'Could not load live attendance.');
  }

  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    employeeId: String(row.employee_id || ''),
    status: String(row.status || 'no_punch') as LiveAttendanceStatus,
    clockInAt: row.clock_in_at ? String(row.clock_in_at) : null,
    clockOutAt: row.clock_out_at ? String(row.clock_out_at) : null,
    syncedAt: String(row.synced_at || ''),
  }));
}

const ET_TIME_ZONE = 'America/New_York';

/** Current time-of-day in America/New_York as "HH:MM:SS", for comparison against
 * employees.scheduled_start_time (a plain `time` column, also "HH:MM:SS"). */
export function nowTimeOfDayEt(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ET_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/[^\d:]/g, '');
}

/**
 * A `no_punch` status should only display as "absent" once the employee's scheduled shift has
 * started. Before that, or if no scheduled_start_time is set at all, it's shown neutrally
 * ("not started yet") -- never auto-flagged absent without a known schedule.
 */
export function isNoPunchAbsent(
  status: LiveAttendanceStatus,
  scheduledStartTime: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (status !== 'no_punch') return false;
  const scheduled = String(scheduledStartTime || '').trim();
  if (!scheduled) return false;
  return nowTimeOfDayEt(now) >= scheduled;
}
