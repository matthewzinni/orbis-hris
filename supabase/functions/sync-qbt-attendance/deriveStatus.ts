// Pure status-derivation logic, split out from index.ts so it has zero Deno/npm: dependencies.
// Given what QuickBooks Time says about a user today, decide their Orbis attendance status.
// No side effects, no I/O.

export type QbtTimesheet = {
  id?: number;
  user_id?: number;
  type?: string; // 'regular' (clock-based) | 'manual' (hand-entered in QBT)
  date?: string;
  start?: string | null;
  end?: string | null;
};

export type AttendanceStatus = 'on_clock' | 'worked_clocked_out' | 'manual_entry' | 'no_punch';

export type DerivedAttendance = {
  status: AttendanceStatus;
  clockInAt: string | null;
  clockOutAt: string | null;
};

// shiftSeconds/now: QBT's current_totals shift length, used to estimate the clock-in time when
// the open timesheet itself isn't returned (QBT hides some users' timesheets from the API token).
export function deriveAttendanceStatus(
  isOnClock: boolean,
  todaysTimesheets: QbtTimesheet[],
  shiftSeconds?: number | null,
  now?: Date
): DerivedAttendance {
  if (isOnClock) {
    const openEntry = todaysTimesheets.find((t) => t.start && !t.end);
    let clockInAt = openEntry?.start || null;
    if (!clockInAt && now && typeof shiftSeconds === 'number' && shiftSeconds > 0) {
      clockInAt = new Date(now.getTime() - shiftSeconds * 1000).toISOString();
    }
    return { status: 'on_clock', clockInAt, clockOutAt: null };
  }

  const regularEntry = todaysTimesheets.find((t) => (t.type || 'regular') === 'regular');
  if (regularEntry) {
    return {
      status: 'worked_clocked_out',
      clockInAt: regularEntry.start || null,
      clockOutAt: regularEntry.end || null,
    };
  }

  const manualEntry = todaysTimesheets.find((t) => t.type === 'manual');
  if (manualEntry) {
    return {
      status: 'manual_entry',
      clockInAt: manualEntry.start || null,
      clockOutAt: manualEntry.end || null,
    };
  }

  return { status: 'no_punch', clockInAt: null, clockOutAt: null };
}
