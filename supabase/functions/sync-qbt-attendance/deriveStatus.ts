// Pure status-derivation logic, split out from index.ts so it has zero Deno/npm: dependencies.
// Given what QuickBooks Time says about a user today, decide their Orbis attendance status.
// No side effects, no I/O.
//
// A day is usually several timesheets: people clock out for lunch and back in. So the day is
// read as ALL of its entries in time order: clock-in = the FIRST start, clock-out = the LAST end
// (only once they are off the clock), and every in/out pair is kept so lunch and other breaks show.

export type QbtTimesheet = {
  id?: number;
  user_id?: number;
  type?: string; // 'regular' (clock-based) | 'manual' (hand-entered in QBT)
  date?: string;
  start?: string | null;
  end?: string | null;
};

export type AttendanceStatus = 'on_clock' | 'worked_clocked_out' | 'manual_entry' | 'no_punch';

export type Punch = { in: string; out: string | null };

export type DerivedAttendance = {
  status: AttendanceStatus;
  /** First clock-in of the day. */
  clockInAt: string | null;
  /** Last clock-out of the day; null while still on the clock. */
  clockOutAt: string | null;
  /** Every in/out pair today, earliest first (out = null for the open one). */
  punches: Punch[];
  /** Seconds worked today, counting the open entry up to `now` when given. */
  workedSeconds: number;
};

function ms(iso: string | null | undefined): number {
  const t = Date.parse(String(iso || ''));
  return Number.isNaN(t) ? NaN : t;
}

function toPunches(entries: QbtTimesheet[]): Punch[] {
  return entries
    .filter((t) => t.start && !Number.isNaN(ms(t.start)))
    .sort((a, b) => ms(a.start) - ms(b.start))
    .map((t) => ({ in: String(t.start), out: t.end ? String(t.end) : null }));
}

function workedSecondsOf(punches: Punch[], now?: Date): number {
  return punches.reduce((sum, p) => {
    const start = ms(p.in);
    const end = p.out ? ms(p.out) : now ? now.getTime() : NaN;
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return sum;
    return sum + Math.round((end - start) / 1000);
  }, 0);
}

function lastOut(punches: Punch[]): string | null {
  const closed = punches.filter((p) => p.out);
  if (!closed.length) return null;
  return closed.reduce((a, b) => (ms(b.out) > ms(a.out) ? b : a)).out;
}

// shiftSeconds/now: QBT's current_totals shift length, used to estimate the clock-in time when
// the open timesheet itself isn't returned (QBT hides some users' timesheets from the API token).
export function deriveAttendanceStatus(
  isOnClock: boolean,
  todaysTimesheets: QbtTimesheet[],
  shiftSeconds?: number | null,
  now?: Date
): DerivedAttendance {
  const regular = toPunches(todaysTimesheets.filter((t) => (t.type || 'regular') === 'regular'));
  const manual = toPunches(todaysTimesheets.filter((t) => t.type === 'manual'));

  if (isOnClock) {
    let clockInAt = regular[0]?.in || manual[0]?.in || null;
    if (!clockInAt && now && typeof shiftSeconds === 'number' && shiftSeconds > 0) {
      clockInAt = new Date(now.getTime() - shiftSeconds * 1000).toISOString();
    }
    const punches = regular.length ? regular : manual;
    return { status: 'on_clock', clockInAt, clockOutAt: null, punches, workedSeconds: workedSecondsOf(punches, now) };
  }

  if (regular.length) {
    return {
      status: 'worked_clocked_out',
      clockInAt: regular[0].in,
      clockOutAt: lastOut(regular),
      punches: regular,
      workedSeconds: workedSecondsOf(regular, now),
    };
  }

  if (manual.length) {
    return {
      status: 'manual_entry',
      clockInAt: manual[0].in,
      clockOutAt: lastOut(manual),
      punches: manual,
      workedSeconds: workedSecondsOf(manual, now),
    };
  }

  return { status: 'no_punch', clockInAt: null, clockOutAt: null, punches: [], workedSeconds: 0 };
}
