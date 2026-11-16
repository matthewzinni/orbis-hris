// deriveAttendanceStatus has zero Deno/npm: dependencies (pure TS), so it's importable here via
// a relative path even though it lives under supabase/functions -- unlike the rest of that edge
// function, which needs a real Deno runtime (not available in this project) to exercise.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveAttendanceStatus } from '../../supabase/functions/sync-qbt-attendance/deriveStatus';

describe('deriveAttendanceStatus', () => {
  // A normal day: in 7:15, out for lunch 12:30, back 1:00, out 4:14 (ET, as QBT returns it).
  const lunchDay = [
    { user_id: 1, type: 'regular', start: '2026-07-14T13:00:00-04:00', end: '2026-07-14T20:00:00-04:00' },
    { user_id: 1, type: 'regular', start: '2026-07-14T07:15:00-04:00', end: '2026-07-14T12:30:00-04:00' },
  ];

  it('uses the FIRST clock-in and LAST clock-out of the day when someone clocks out for lunch', () => {
    const result = deriveAttendanceStatus(false, lunchDay);
    expect(result.clockInAt).toBe('2026-07-14T07:15:00-04:00');
    expect(result.clockOutAt).toBe('2026-07-14T20:00:00-04:00');
    expect(result.punches).toEqual([
      { in: '2026-07-14T07:15:00-04:00', out: '2026-07-14T12:30:00-04:00' },
      { in: '2026-07-14T13:00:00-04:00', out: '2026-07-14T20:00:00-04:00' },
    ]);
    expect(result.workedSeconds).toBe((5.25 + 7) * 3600);
  });

  it('keeps the morning clock-in (not the back-from-lunch time) while on the clock after lunch', () => {
    const result = deriveAttendanceStatus(
      true,
      [lunchDay[1], { user_id: 1, type: 'regular', start: '2026-07-14T13:00:00-04:00', end: '' }],
      undefined,
      new Date('2026-07-14T14:00:00-04:00')
    );
    expect(result.status).toBe('on_clock');
    expect(result.clockInAt).toBe('2026-07-14T07:15:00-04:00');
    expect(result.clockOutAt).toBeNull();
    expect(result.punches[1]).toEqual({ in: '2026-07-14T13:00:00-04:00', out: null });
    expect(result.workedSeconds).toBe((5.25 + 1) * 3600);
  });

  it('is on_clock when currently on the clock, using the open timesheet entry for clock-in time', () => {
    const result = deriveAttendanceStatus(true, [
      { user_id: 1, type: 'regular', start: '2026-10-29T12:00:00Z', end: null },
    ]);
    expect(result).toMatchObject({ status: 'on_clock', clockInAt: '2026-10-29T12:00:00Z', clockOutAt: null });
  });

  it('is on_clock with no clock-in time if there is no open entry to read it from', () => {
    const result = deriveAttendanceStatus(true, []);
    expect(result).toEqual({ status: 'on_clock', clockInAt: null, clockOutAt: null, punches: [], workedSeconds: 0 });
  });

  it('estimates clock-in from the shift length when the open entry is not returned', () => {
    const result = deriveAttendanceStatus(true, [], 5400, new Date('2026-11-03T13:30:00Z'));
    expect(result).toMatchObject({ status: 'on_clock', clockInAt: '2026-11-03T12:00:00.000Z', clockOutAt: null });
  });

  it('prefers the open entry start over the shift-length estimate', () => {
    const result = deriveAttendanceStatus(
      true,
      [{ user_id: 1, type: 'regular', start: '2026-11-03T11:17:00Z', end: '' }],
      5400,
      new Date('2026-11-03T13:30:00Z')
    );
    expect(result.clockInAt).toBe('2026-11-03T11:17:00Z');
  });

  it('is worked_clocked_out when not on the clock but a regular timesheet entry exists today', () => {
    const result = deriveAttendanceStatus(false, [
      { user_id: 1, type: 'regular', start: '2026-10-29T12:00:00Z', end: '2026-10-29T20:00:00Z' },
    ]);
    expect(result).toMatchObject({
      status: 'worked_clocked_out',
      clockInAt: '2026-10-29T12:00:00Z',
      clockOutAt: '2026-10-29T20:00:00Z',
      workedSeconds: 8 * 3600,
    });
  });

  it('treats an entry with no type as regular (QBT default)', () => {
    const result = deriveAttendanceStatus(false, [
      { user_id: 1, start: '2026-10-29T12:00:00Z', end: '2026-10-29T20:00:00Z' },
    ]);
    expect(result.status).toBe('worked_clocked_out');
  });

  it('is manual_entry when not on the clock and the only entry today is hand-entered', () => {
    const result = deriveAttendanceStatus(false, [
      { user_id: 1, type: 'manual', start: '2026-10-29T12:00:00Z', end: '2026-10-29T16:00:00Z' },
    ]);
    expect(result).toMatchObject({
      status: 'manual_entry',
      clockInAt: '2026-10-29T12:00:00Z',
      clockOutAt: '2026-10-29T16:00:00Z',
    });
  });

  it('is no_punch when not on the clock and there are no timesheet entries today at all', () => {
    expect(deriveAttendanceStatus(false, [])).toEqual({
      status: 'no_punch',
      clockInAt: null,
      clockOutAt: null,
      punches: [],
      workedSeconds: 0,
    });
  });

  it('prefers a regular entry over a manual one when both exist for the same day', () => {
    const result = deriveAttendanceStatus(false, [
      { user_id: 1, type: 'manual', start: '2026-10-29T09:00:00Z', end: '2026-10-29T10:00:00Z' },
      { user_id: 1, type: 'regular', start: '2026-10-29T12:00:00Z', end: '2026-10-29T20:00:00Z' },
    ]);
    expect(result.status).toBe('worked_clocked_out');
  });
});

describe('sync-qbt-attendance timesheet request', () => {
  it('asks QuickBooks Time for open timesheets too, so on-the-clock rows get a clock-in time', () => {
    // QBT omits still-open timesheets unless on_the_clock is 'both'.
    const source = readFileSync(join(__dirname, '../../supabase/functions/sync-qbt-attendance/index.ts'), 'utf8');
    expect(source).toMatch(/'timesheets',\s*\{[^}]*on_the_clock:\s*'both'/);
  });

  it('reads the clock-in time from an open entry whose end QBT sends as an empty string', () => {
    const result = deriveAttendanceStatus(true, [
      { user_id: 1, type: 'regular', start: '2026-11-03T06:17:00-05:00', end: '' },
    ]);
    expect(result.clockInAt).toBe('2026-11-03T06:17:00-05:00');
  });
});
