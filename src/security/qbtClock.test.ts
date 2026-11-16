import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient', () => ({ supabaseClient: { functions: { invoke: vi.fn() } } }));
import {
  localDate,
  localIso,
  resolveTimeZone,
  sumWorkedSeconds,
} from '../../supabase/functions/qbt-clock/time';
import { formatWorked, liveWorkedSeconds } from '../services/timeClock';

describe('qbt-clock time helpers', () => {
  it('formats timestamps with the local offset QuickBooks Time expects', () => {
    const d = new Date('2026-11-16T16:00:38.512Z');
    expect(localIso(d, 'America/New_York')).toBe('2026-11-16T11:00:38-05:00');
    expect(localIso(new Date('2026-07-01T16:00:00Z'), 'America/New_York')).toBe('2026-07-01T12:00:00-04:00');
    expect(localIso(d, 'Asia/Manila')).toBe('2026-11-17T00:00:38+08:00');
  });

  it('uses the local calendar date', () => {
    expect(localDate(new Date('2026-11-17T03:00:00Z'), 'America/New_York')).toBe('2026-11-16');
    expect(localDate(new Date('2026-11-17T03:00:00Z'), 'Asia/Manila')).toBe('2026-11-17');
  });

  it('falls back to Eastern for a missing or bogus time zone', () => {
    expect(resolveTimeZone('')).toBe('America/New_York');
    expect(resolveTimeZone('Not/AZone')).toBe('America/New_York');
    expect(resolveTimeZone('America/Chicago')).toBe('America/Chicago');
  });

  it('adds closed shifts and the open shift up to now', () => {
    const now = new Date('2026-11-16T17:00:00Z');
    expect(
      sumWorkedSeconds(
        [
          { start: '2026-11-16T07:00:00-05:00', end: '2026-11-16T09:00:00-05:00', duration: 7200 },
          { start: '2026-11-16T11:00:00-05:00', end: '', on_the_clock: true },
        ],
        now
      )
    ).toBe(7200 + 3600);
  });
});

describe('time clock display', () => {
  it('formats worked time', () => {
    expect(formatWorked(0)).toBe('0h 00m');
    expect(formatWorked(3 * 3600 + 5 * 60 + 59)).toBe('3h 05m');
  });

  it('keeps counting while on the clock', () => {
    const base = {
      message: '',
      employee: 'A',
      clockedInAt: null,
      today: '2026-11-16',
      workedSecondsToday: 600,
      receivedAt: 1_000_000,
    };
    expect(liveWorkedSeconds({ ...base, onClock: true }, 1_000_000 + 60_000)).toBe(660);
    expect(liveWorkedSeconds({ ...base, onClock: false }, 1_000_000 + 60_000)).toBe(600);
  });
});

describe('qbt-clock safeguards', () => {
  const source = readFileSync(join(__dirname, '../../supabase/functions/qbt-clock/index.ts'), 'utf8');

  it('identifies the employee from the login, never from the request body', () => {
    expect(source).toContain('auth.getUser()');
    expect(source).toContain('linked_employee_id');
    expect(source).not.toMatch(/body\.(employee|user_id|qbt_user_id|employee_id)/);
  });

  it('uses the server clock, not a time from the browser', () => {
    expect(source).toContain('const now = new Date();');
    expect(source).not.toMatch(/body\.(time|start|end|timestamp)/);
  });

  it('never treats a bad QuickBooks Time filter as "not clocked in"', () => {
    expect(source).toMatch(/must be specified/);
  });

  it('refuses a second clock-in', () => {
    expect(source).toContain("if (open) throw new ClockError('You are already clocked in.', 409);");
  });
});
