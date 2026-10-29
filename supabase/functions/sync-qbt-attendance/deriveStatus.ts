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

export function deriveAttendanceStatus(
  isOnClock: boolean,
  todaysTimesheets: QbtTimesheet[]
): DerivedAttendance {
  if (isOnClock) {
    const openEntry = todaysTimesheets.find((t) => t.start && !t.end);
    return { status: 'on_clock', clockInAt: openEntry?.start || null, clockOutAt: null };
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
