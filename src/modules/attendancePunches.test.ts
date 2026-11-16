import { describe, expect, it } from 'vitest';


import { describePunches, formatWorkedHours } from './attendancePunchText';

describe('attendance punch display', () => {
  it('lists every punch with the lunch gap', () => {
    const text = describePunches([
      { in: '2026-07-14T07:15:00-04:00', out: '2026-07-14T12:30:00-04:00' },
      { in: '2026-07-14T13:00:00-04:00', out: null },
    ]);
    expect(text).toMatch(/^In 7:15\s?AM · Out 12:30\s?PM · break 30m · In 1:00\s?PM$/);
  });

  it('shows long breaks in hours', () => {
    expect(
      describePunches([
        { in: '2026-07-14T07:00:00-04:00', out: '2026-07-14T11:00:00-04:00' },
        { in: '2026-07-14T12:15:00-04:00', out: '2026-07-14T16:00:00-04:00' },
      ])
    ).toContain('break 1h 15m');
  });

  it('formats hours worked', () => {
    expect(formatWorkedHours(12.25 * 3600)).toBe('12h 15m');
    expect(formatWorkedHours(0)).toBe('—');
  });
});
