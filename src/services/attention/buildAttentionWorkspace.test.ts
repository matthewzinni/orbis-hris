import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttentionItem } from './types';

vi.mock('../access', () => ({
  isAdminUser: vi.fn(() => true),
  isSupervisorUser: vi.fn(() => false),
}));

vi.mock('./rules', () => ({
  ATTENTION_RULES: [
    {
      collect: vi.fn(async () => [
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
          id: 'performance_review:employee_review:emp-1:annual:2026-07-23',
          dedupeKey: 'performance_review:employee_review:emp-1:annual:2026-07-23',
          category: 'performance_review',
          severity: 'critical',
          status: 'overdue',
          title: 'Annual review — Alex Smith (duplicate)',
          explanation: 'Duplicate should collapse',
          employeeId: 'emp-1',
          employeeName: 'Alex Smith',
          dueDate: '2026-07-22',
          sourceType: 'employee_review',
          sourceId: 'emp-1',
          recommendedAction: 'Complete review.',
          route: { type: 'employee', employeeId: 'emp-1', drawerTab: 'reviews' },
          evaluatedAt: '2026-07-23T12:00:00.000Z',
        },
      ] satisfies AttentionItem[]),
    },
    {
      collect: vi.fn(async () => [
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
      ] satisfies AttentionItem[]),
    },
  ],
}));

import { isAdminUser, isSupervisorUser } from '../access';
import {
  buildAttentionWorkspace,
  filterAttentionItems,
  isAttentionItemDueToday,
  isAttentionItemHighPriority,
} from './buildAttentionWorkspace';

describe('buildAttentionWorkspace', () => {
  beforeEach(() => {
    vi.mocked(isAdminUser).mockReturnValue(true);
    vi.mocked(isSupervisorUser).mockReturnValue(false);
  });

  it('dedupes and sorts items from registered rules', async () => {
    const workspace = await buildAttentionWorkspace();

    expect(workspace.items).toHaveLength(2);
    expect(workspace.items[0]?.category).toBe('performance_review');
    expect(workspace.items[0]?.title).toContain('duplicate');
    expect(workspace.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns empty workspace for non-admin/non-supervisor users', async () => {
    vi.mocked(isAdminUser).mockReturnValue(false);
    vi.mocked(isSupervisorUser).mockReturnValue(false);

    const workspace = await buildAttentionWorkspace();
    expect(workspace.items).toEqual([]);
  });
});

describe('filterAttentionItems', () => {
  const items: AttentionItem[] = [
    {
      id: 'a',
      dedupeKey: 'a',
      category: 'discipline',
      severity: 'normal',
      status: 'open',
      title: 'Open discipline — Alex Smith',
      explanation: 'Attendance issue',
      employeeName: 'Alex Smith',
      sourceType: 'discipline_report',
      sourceId: '1',
      recommendedAction: 'Review.',
      route: { type: 'employee', employeeId: 'emp-1' },
      evaluatedAt: '2026-07-23T12:00:00.000Z',
    },
    {
      id: 'b',
      dedupeKey: 'b',
      category: 'meeting',
      severity: 'high',
      status: 'overdue',
      title: 'Meeting today — Casey Lee',
      explanation: 'Check-in',
      employeeName: 'Casey Lee',
      dueDate: '2026-07-23',
      sourceType: 'employee_meeting',
      sourceId: '2',
      recommendedAction: 'Confirm notes.',
      route: { type: 'employee', employeeId: 'emp-2', drawerTab: 'meetings' },
      evaluatedAt: '2026-07-23T12:00:00.000Z',
    },
  ];

  it('filters by category and search text', () => {
    const filtered = filterAttentionItems(items, {
      category: 'meeting',
      search: 'casey',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.employeeName).toBe('Casey Lee');
  });

  it('detects due-today and high-priority helpers', () => {
    const dueToday = items[1];
    expect(isAttentionItemDueToday(dueToday!, '2026-07-23')).toBe(true);
    expect(isAttentionItemHighPriority(dueToday!)).toBe(true);
  });
});
