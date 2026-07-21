import { describe, expect, it } from 'vitest';
import {
  buildHrIntelligenceContext,
  disciplineRowCountsTowardAtRisk,
  isSevereDisciplineLevel,
} from './hrIntelligence';

describe('isSevereDisciplineLevel', () => {
  it('flags final warning and level 4/5 only', () => {
    expect(isSevereDisciplineLevel('Level 4 - Final Warning')).toBe(true);
    expect(isSevereDisciplineLevel('Level 5 - Termination')).toBe(true);
    expect(isSevereDisciplineLevel('Final Warning')).toBe(true);
  });

  it('does not flag coaching, verbal, or written warnings', () => {
    expect(isSevereDisciplineLevel('Level 1 - Coaching')).toBe(false);
    expect(isSevereDisciplineLevel('Level 2 - Verbal Warning')).toBe(false);
    expect(isSevereDisciplineLevel('Level 3 - Written Warning')).toBe(false);
  });
});

describe('disciplineRowCountsTowardAtRisk', () => {
  it('does not flag verbal warnings when action text mentions termination', () => {
    const row = {
      employee_id: 'BTW2603',
      discipline_level: 'Level 2 - Verbal Warning',
      report_status: 'Open',
      action_taken:
        'Future instances may result in additional disciplinary action, up to and including termination of employment.',
      description: 'Pattern of repeated tardiness.',
      issue_type: 'Attendance',
    };

    expect(disciplineRowCountsTowardAtRisk(row)).toBe(false);
  });

  it('flags severe levels regardless of boilerplate action text', () => {
    const row = {
      employee_id: 'EMP001',
      discipline_level: 'Level 4 - Final Warning',
      report_status: 'Open',
      action_taken: 'Employee received a final warning.',
      issue_type: 'Attendance',
    };

    expect(disciplineRowCountsTowardAtRisk(row)).toBe(true);
  });

  it('builds severe discipline context from level only', () => {
    const context = buildHrIntelligenceContext({
      disciplineRows: [
        {
          employee_id: 'BTW2603',
          discipline_level: 'Level 2 - Verbal Warning',
          report_status: 'Open',
          action_taken:
            'Future instances may result in additional disciplinary action, up to and including termination of employment.',
          issue_type: 'Attendance',
        },
      ],
    });

    expect(context.severeDisciplineByEmployee.get('BTW2603')).toBeUndefined();
  });
});
