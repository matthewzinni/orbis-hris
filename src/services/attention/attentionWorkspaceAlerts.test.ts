import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  summarizeAttentionCategoryAlerts,
  summarizeAttentionRollupAlert,
  syncAttentionSummaryKpis,
} from './attentionWorkspaceAlerts';
import type { AttentionItem, AttentionSummary } from './types';

const sampleItems: AttentionItem[] = [
  {
    id: 'performance_review:employee_review:emp-1:annual:2026-07-23',
    dedupeKey: 'performance_review:employee_review:emp-1:annual:2026-07-23',
    category: 'performance_review',
    severity: 'high',
    status: 'overdue',
    title: 'Annual review — Alex Smith',
    explanation: 'Due yesterday',
    employeeId: 'emp-1',
    employeeName: 'Alex Smith',
    dueDate: '2026-07-22',
    sourceType: 'employee_review',
    sourceId: 'emp-1',
    recommendedAction: 'Complete review.',
    route: { type: 'employee', employeeId: 'emp-1', drawerTab: 'reviews' },
    evaluatedAt: '2026-07-23T12:00:00.000Z',
  },
  {
    id: 'discipline:discipline_report:55',
    dedupeKey: 'discipline:discipline_report:55',
    category: 'discipline',
    severity: 'normal',
    status: 'open',
    title: 'Open discipline — Alex Smith',
    explanation: 'Attendance',
    employeeId: 'emp-1',
    employeeName: 'Alex Smith',
    sourceType: 'discipline_report',
    sourceId: '55',
    recommendedAction: 'Review case.',
    route: { type: 'employee', employeeId: 'emp-1', drawerTab: 'discipline' },
    evaluatedAt: '2026-07-23T12:00:00.000Z',
  },
];

describe('attentionWorkspaceAlerts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows no reviews due when other task categories are overdue', () => {
    const fields = {
      kPerformanceReviewsDue: { textContent: '' },
      kPerformanceReviewsDueSub: { textContent: '' },
    };
    vi.stubGlobal('document', { getElementById: (id: string) => fields[id] || null });

    syncAttentionSummaryKpis({ overdue: 4, dueSoon: 2 } as AttentionSummary, [sampleItems[1]]);

    expect(fields.kPerformanceReviewsDue.textContent).toBe('0');
    expect(fields.kPerformanceReviewsDueSub.textContent).toBe('No 90-day reviews due right now');
  });

  it('keeps review overdue counts separate from other task categories', () => {
    const subtitle = { textContent: '' };
    vi.stubGlobal('document', {
      getElementById: (id: string) => id === 'kPerformanceReviewsDueSub' ? subtitle : null,
    });

    syncAttentionSummaryKpis({ overdue: 4, dueSoon: 2 } as AttentionSummary, sampleItems);

    expect(subtitle.textContent).toBe('1 overdue · 0 due within 7 days');
  });

  it('builds category alerts from attention items', () => {
    const alerts = summarizeAttentionCategoryAlerts(sampleItems);
    expect(alerts.map((alert) => alert.id)).toEqual([
      'performance-reviews-due',
      'open-discipline',
    ]);
  });

  it('builds rollup alert when high-priority work exists', () => {
    const summary: AttentionSummary = {
      totalOpen: 2,
      overdue: 1,
      dueToday: 0,
      dueSoon: 0,
      highPriority: 1,
      assignedToCurrentUser: 2,
    };

    const rollup = summarizeAttentionRollupAlert(summary);
    expect(rollup?.id).toBe('attention-priority-queue');
    expect(rollup?.count).toBe(2);
  });
});
