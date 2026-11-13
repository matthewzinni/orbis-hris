import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  decisionDueDate,
  decisionStatus,
  isDecisionMade,
  stageRequiresHireApproval,
} from './hiringProcess';

describe('addBusinessDays', () => {
  it('skips weekends', () => {
    // Fri Nov 13 2026 + 5 business days = Fri Nov 20 2026
    expect(addBusinessDays('2026-11-13', 5)).toBe('2026-11-20');
    // Mon Nov 16 2026 + 5 business days = Mon Nov 23 2026
    expect(addBusinessDays('2026-11-16', 5)).toBe('2026-11-23');
    // Wed Nov 18 2026 + 5 = Wed Nov 25 2026
    expect(addBusinessDays('2026-11-18', 5)).toBe('2026-11-25');
  });

  it('treats a weekend start as the following week', () => {
    // Sat Nov 14 2026 + 5 = Fri Nov 20 2026
    expect(addBusinessDays('2026-11-14', 5)).toBe('2026-11-20');
  });

  it('returns null for bad input', () => {
    expect(addBusinessDays('', 5)).toBeNull();
    expect(addBusinessDays('not a date', 5)).toBeNull();
  });
});

describe('decisionDueDate', () => {
  it('is empty until the supervisor interview is done', () => {
    expect(decisionDueDate({})).toBeNull();
    expect(decisionDueDate({ supervisor_interview_completed_date: '2026-11-16' })).toBe('2026-11-23');
  });
});

describe('decisionStatus', () => {
  const fields = { stage: 'Interviewing', supervisor_interview_completed_date: '2026-11-16' };

  it('counts down to the due date', () => {
    expect(decisionStatus(fields, '2026-11-20')).toEqual({
      state: 'due',
      dueDate: '2026-11-23',
      daysLeft: 3,
    });
  });

  it('flags overdue decisions', () => {
    expect(decisionStatus(fields, '2026-11-25')).toEqual({
      state: 'overdue',
      dueDate: '2026-11-23',
      daysLate: 2,
    });
  });

  it('stops once a decision is made', () => {
    expect(decisionStatus({ ...fields, stage: 'Offer' }, '2026-11-30')).toEqual({ state: 'decided' });
    expect(decisionStatus({ ...fields, stage: 'Rejected' }, '2026-11-30')).toEqual({ state: 'decided' });
  });

  it('waits when there is no supervisor interview yet', () => {
    expect(decisionStatus({ stage: 'Screening' }, '2026-11-30')).toEqual({ state: 'waiting' });
  });
});

describe('stage rules', () => {
  it('requires approval for every stage after Applied except Rejected', () => {
    expect(stageRequiresHireApproval('Applied')).toBe(false);
    expect(stageRequiresHireApproval('Rejected')).toBe(false);
    expect(stageRequiresHireApproval('Screening')).toBe(true);
    expect(stageRequiresHireApproval('Interviewing')).toBe(true);
    expect(stageRequiresHireApproval('Offer')).toBe(true);
  });

  it('treats offer, hired and rejected as decided', () => {
    expect(isDecisionMade('Offer')).toBe(true);
    expect(isDecisionMade('hired')).toBe(true);
    expect(isDecisionMade('Interviewing')).toBe(false);
  });
});
