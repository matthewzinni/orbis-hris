import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePunchLocation } from '../../supabase/functions/qbt-clock/time';
import { mapUrl, nearestPoint, spotFor, type GeoPoint, type OrbisPunch } from '../../supabase/functions/punch-locations/match';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('parsePunchLocation', () => {
  it('accepts a real coordinate and rounds accuracy', () => {
    expect(parsePunchLocation({ latitude: 35.0456, longitude: -85.3097, accuracy: 12.34 })).toEqual({
      latitude: 35.0456,
      longitude: -85.3097,
      accuracy: 12.3,
    });
  });

  it('rejects missing, out-of-range, and 0,0 coordinates', () => {
    expect(parsePunchLocation(undefined)).toBeNull();
    expect(parsePunchLocation({ latitude: 'x', longitude: 1 })).toBeNull();
    expect(parsePunchLocation({ latitude: 91, longitude: 0 })).toBeNull();
    expect(parsePunchLocation({ latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe('punch location matching', () => {
  const points: GeoPoint[] = [
    { user_id: 7, created: '2026-11-16T10:01:00+00:00', latitude: 1, longitude: 2, accuracy: 9 },
    { user_id: 7, created: '2026-11-16T16:45:47+00:00', latitude: 3, longitude: 4, accuracy: 5 },
    { user_id: 8, created: '2026-11-16T10:01:00+00:00', latitude: 9, longitude: 9 },
  ];
  const sheet = { id: 55, user_id: 7, start: '2026-11-16T05:01:00-05:00', end: '2026-11-16T11:45:48-05:00' };

  it('uses the QuickBooks Time app point closest to each punch, for the same user only', () => {
    expect(spotFor(sheet, 'clock_in', [], points)).toMatchObject({ source: 'qbt_app', latitude: 1, longitude: 2, gapMinutes: 0 });
    expect(spotFor(sheet, 'clock_out', [], points)).toMatchObject({ source: 'qbt_app', latitude: 3, longitude: 4 });
  });

  it('prefers the Orbis punch saved for that timesheet', () => {
    const punch: OrbisPunch = {
      employee_id: 'BTW1',
      qbt_timesheet_id: 55,
      action: 'clock_in',
      punched_at: '2026-11-16T10:01:00Z',
      latitude: 35,
      longitude: -85,
      accuracy_m: 6,
    };
    expect(spotFor(sheet, 'clock_in', [punch], points)).toMatchObject({ source: 'orbis', latitude: 35, accuracy: 6 });
  });

  it('ignores GPS points more than 15 minutes away', () => {
    expect(nearestPoint(points, '7', '2026-11-16T10:20:00+00:00')).toBeNull();
    expect(spotFor({ ...sheet, start: '2026-11-16T07:00:00-05:00' }, 'clock_in', [], points)?.source).toBe('none');
  });

  it('has no clock-out spot while still on the clock', () => {
    expect(spotFor({ ...sheet, end: '' }, 'clock_out', [], points)).toBeNull();
  });

  it('builds a map link only for a real point', () => {
    expect(mapUrl(35.1, -85.2)).toBe('https://www.google.com/maps?q=35.100000,-85.200000');
    expect(mapUrl(null, null)).toBe('');
  });
});

describe('punch location safeguards', () => {
  it('refuses a punch without location before writing to QuickBooks Time', () => {
    const src = read('supabase/functions/qbt-clock/index.ts');
    const refuse = src.indexOf("if (action !== 'status' && !location)");
    const firstWrite = src.indexOf("'POST', 'timesheets'");
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse).toBeLessThan(firstWrite);
  });

  it('reads employees and punches with the caller session so RLS limits supervisors to their team', () => {
    const src = read('supabase/functions/punch-locations/index.ts');
    expect(src).toMatch(/asCaller\s*\n?\s*\.from\('employees'\)/);
    expect(src).toMatch(/asCaller\s*\n?\s*\.from\('time_clock_punches'\)/);
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('lets only admins and supervisors load locations', () => {
    const src = read('supabase/functions/punch-locations/index.ts');
    expect(src).toContain("'orbis_is_admin'");
    expect(src).toContain("'orbis_is_supervisor'");
  });

  it('only the service role can write punches; reads follow team access', () => {
    const sql = read('supabase/migrations/20261116170000_time_clock_punches.sql');
    expect(sql).toContain('using (public.orbis_employee_child_accessible(employee_id))');
    expect(sql).toContain('revoke insert, update, delete on public.time_clock_punches from authenticated, anon');
    expect(sql).not.toMatch(/for (insert|update|delete)/);
  });
});
