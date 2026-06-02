import { FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';

export type AttendancePerson = {
  employeeId: string;
  name: string;
  department?: string;
};

export type AttendanceSummary = {
  asOf: string;
  timezone?: string;
  source?: string;
  present: AttendancePerson[];
  absent: AttendancePerson[];
};

type AttendanceInvokeResponse = {
  asOf?: string;
  timezone?: string;
  source?: string;
  present?: unknown[];
  absent?: unknown[];
  error?: string;
};

export class AttendanceSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttendanceSyncError';
  }
}

function normalizePerson(input: unknown): AttendancePerson | null {
  const row = (input || {}) as Record<string, unknown>;
  const employeeId = String(
    row.employeeId || row.employee_id || row.id || row.employeeNumber || ''
  ).trim();
  const name = String(
    row.name || row.fullName || row.employee_name || row.displayName || ''
  ).trim();
  const department = String(row.department || row.dept || '').trim();

  if (!employeeId && !name) return null;

  return {
    employeeId: employeeId || '—',
    name: name || employeeId || 'Unknown',
    department: department || undefined,
  };
}

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const status = res.status;
    let detail = '';

    try {
      const contentType = res.headers.get('content-type') || '';
      const clone = res.clone();
      if (contentType.includes('application/json')) {
        const json = (await clone.json()) as { error?: string; message?: string };
        detail =
          (typeof json?.error === 'string' && json.error) ||
          (typeof json?.message === 'string' && json.message) ||
          '';
      } else {
        detail = (await clone.text()).trim().slice(0, 240);
      }
    } catch {
      detail = '';
    }

    return detail ? `Attendance API HTTP ${status}: ${detail}` : `Attendance API HTTP ${status}.`;
  }

  if (error instanceof FunctionsRelayError) {
    return 'Supabase relay error while calling attendance sync.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Attendance sync failed.';
}

function normalizePeopleList(value: unknown): AttendancePerson[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePerson)
    .filter((row): row is AttendancePerson => Boolean(row));
}

export async function loadManualAttendanceSnapshot(
  attendanceDate: string
): Promise<AttendanceSummary | null> {
  const date = String(attendanceDate || '').trim();
  if (!date) return null;

  const { data, error } = await supabaseClient
    .from('attendance_manual_snapshots')
    .select('present, absent, timezone, source, updated_at')
    .eq('attendance_date', date)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
      throw new AttendanceSyncError(
        'Attendance storage is not set up yet. Run database migrations (npm run db:push).'
      );
    }
    throw new AttendanceSyncError(error.message || 'Could not load saved attendance.');
  }

  if (!data) return null;

  const row = data as {
    present?: unknown;
    absent?: unknown;
    timezone?: string | null;
    source?: string | null;
    updated_at?: string | null;
  };

  return {
    asOf: String(row.updated_at || new Date().toISOString()),
    timezone: String(row.timezone || '').trim() || undefined,
    source: String(row.source || 'Manual').trim() || 'Manual',
    present: normalizePeopleList(row.present),
    absent: normalizePeopleList(row.absent),
  };
}

export async function saveManualAttendanceSnapshot(
  attendanceDate: string,
  snapshot: AttendanceSummary
): Promise<void> {
  const date = String(attendanceDate || '').trim();
  if (!date) {
    throw new AttendanceSyncError('Choose a date before saving attendance.');
  }

  const user = (await supabaseClient.auth.getUser()).data.user;
  const updatedBy =
    String(user?.email || user?.id || '')
      .trim() || undefined;

  const { error } = await supabaseClient.from('attendance_manual_snapshots').upsert(
    {
      attendance_date: date,
      present: snapshot.present,
      absent: snapshot.absent,
      timezone: snapshot.timezone || null,
      source: snapshot.source || 'Manual',
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'attendance_date' }
  );

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
      throw new AttendanceSyncError(
        'Attendance storage is not set up yet. Run database migrations (npm run db:push).'
      );
    }
    throw new AttendanceSyncError(error.message || 'Could not save attendance.');
  }
}

export async function fetchIntuitAttendanceSnapshot(): Promise<AttendanceSummary> {
  const { data, error } = await supabaseClient.functions.invoke('intuit-workforce-attendance', {
    body: {},
  });

  if (error) {
    throw new AttendanceSyncError(await describeInvokeFailure(error));
  }

  const payload = (data || {}) as AttendanceInvokeResponse;
  if (payload.error) {
    throw new AttendanceSyncError(payload.error);
  }

  const present = Array.isArray(payload.present)
    ? payload.present.map(normalizePerson).filter((row): row is AttendancePerson => Boolean(row))
    : [];
  const absent = Array.isArray(payload.absent)
    ? payload.absent.map(normalizePerson).filter((row): row is AttendancePerson => Boolean(row))
    : [];

  return {
    asOf: String(payload.asOf || new Date().toISOString()),
    timezone: String(payload.timezone || '').trim() || undefined,
    source: String(payload.source || 'Intuit Workforce').trim(),
    present,
    absent,
  };
}
