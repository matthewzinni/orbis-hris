import { describe, expect, it } from 'vitest';
import { buildLeadershipBriefing, dateOnly, shiftDate, validateBriefingDates, briefingText, type BriefingSource } from './leadershipBriefingModel';

function sources(): Record<string, BriefingSource> {
  return Object.fromEntries(['employees', 'reviews', 'onboarding', 'training', 'attendance', 'previousAttendance']
    .map(key => [key, { label: key, rows: [] }]));
}
const build = (s = sources()) => buildLeadershipBriefing('2026-08-24', '2026-08-30', s, '2026-09-02');

describe('weekly leadership briefing', () => {
  it('validates calendar dates and exactly seven inclusive days', () => {
    expect(dateOnly('2026-02-30')).toBe('');
    expect(() => validateBriefingDates('2026-08-24', '2026-08-29')).toThrow();
    expect(() => validateBriefingDates('', '')).toThrow();
    expect(shiftDate('2026-03-07', 6)).toBe('2026-03-13');
  });
  it('includes both boundaries and excludes outside records', () => {
    const s = sources();
    s.employees.rows = [{ hire_date: '2026-08-24' }, { hire_date: '2026-08-30' }, { hire_date: '2026-08-31' }];
    expect(build(s).metrics[0].value).toBe('2');
  });
  it('does not turn a failed source into zero activity', () => {
    const s = sources(); s.reviews.error = 'Access unavailable';
    const b = build(s);
    expect(b.metrics[2].value).toBe('Unavailable');
    expect(b.warnings.join(' ')).toContain('Access unavailable');
    expect(b.metrics[3].value).toBe('0');
  });
  it('requires completion status and date, and warns about undated completion', () => {
    const s = sources();
    s.onboarding.rows = [{ status: 'completed', completed_at: '2026-08-30T23:59:00Z' },
      { status: 'in_progress', completed_at: '2026-08-25' }, { status: 'completed' }];
    const b = build(s);
    expect(b.metrics[3].value).toBe('1');
    expect(b.warnings.join(' ')).toContain('no valid completion date');
  });
  it('labels current overdue status and excludes completed or withdrawn items', () => {
    const s = sources(); s.training.rows = [
      { status: 'in_progress', due_date: '2026-09-01' },
      { status: 'completed', due_date: '2026-08-01' },
      { status: 'withdrawn', due_date: '2026-08-01' },
    ];
    const metric = build(s).metrics.find(m => m.label.startsWith('training overdue'))!;
    expect(metric.value).toBe('1'); expect(metric.label).toContain('2026-09-02');
  });
  it('distinguishes missing attendance from a recorded zero', () => {
    const s = sources(); s.attendance.rows = [{ available: true, absent: 0, date: '2026-08-24' }];
    const b = build(s);
    expect(b.metrics.find(m => m.source === 'attendance')?.value).toBe('0 (1/7 days recorded)');
    expect(b.metrics.find(m => m.source === 'previousAttendance')?.value).toBe('No snapshots recorded');
    expect(b.warnings.join(' ')).toContain('6 day(s)');
  });
  it('exports edited text together with metrics and limitations', () => {
    const b = build(); b.narrative = 'Decision: approve equipment.';
    const text = briefingText(b);
    expect(text).toContain(b.narrative); expect(text).toContain('COVERAGE & LIMITATIONS');
  });
});
