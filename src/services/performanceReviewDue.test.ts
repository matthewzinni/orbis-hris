import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./access', () => ({}));
vi.mock('../modules/employees', () => ({}));
vi.mock('./supabaseClient', () => ({ supabaseClient: {} }));

import {
  computePerformanceReviewDueCandidates,
  groupPerformanceReviewDueBySupervisor,
  normalizePerformanceReviewType,
} from './performanceReviewDue';

describe('performance review deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00'));
  });

  afterEach(() => vi.useRealTimers());

  it('does not create annual deadlines for employees with past anniversaries', () => {
    expect(computePerformanceReviewDueCandidates([
      { id: 'long-tenure', first_name: 'Alex', hire_date: '2020-07-01' },
      { id: 'leap-day', first_name: 'Sam', hire_date: '2024-02-29' },
    ], [])).toEqual([]);
  });

  it('keeps 90-day deadlines and supervisor follow-up lists', () => {
    const candidates = computePerformanceReviewDueCandidates([
      { id: 'annual', hire_date: '2020-07-01', supervisor: 'Team Manager' },
      { id: 'new-hire', first_name: 'Taylor', hire_date: '2026-07-01', supervisor: 'Team Manager' },
    ], []);

    expect(candidates).toMatchObject([
      { employeeId: 'new-hire', periodKind: '90_day', dueDate: '2026-09-29', severity: 'overdue' },
    ]);
    expect(candidates).toHaveLength(1);
    expect(groupPerformanceReviewDueBySupervisor(candidates)[0].items).toEqual(candidates);
  });

  it('does not reissue a completed 90-day review', () => {
    expect(computePerformanceReviewDueCandidates([
      { id: 'new-hire', hire_date: '2026-07-01' },
    ], [
      { employee_id: 'new-hire', review_type: '90-Day Review', review_date: '2026-09-29' },
    ])).toEqual([]);
  });

  it('continues to recognize annual reviews for completed-review history', () => {
    expect(normalizePerformanceReviewType('Annual Review')).toBe('annual');
  });
});
