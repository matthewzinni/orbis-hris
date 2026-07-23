import { describe, expect, it, vi } from 'vitest';

vi.mock('../hrInbox', () => ({
  buildHrInboxItems: vi.fn(async () => []),
}));

vi.mock('../../modules/employees', () => ({
  getEmployees: vi.fn(() => []),
}));

vi.mock('../access', () => ({
  isAdminUser: vi.fn(() => false),
  isSupervisorUser: vi.fn(() => false),
}));

vi.mock('../accessScopes', () => ({
  employeeMatchesSupervisorAccess: vi.fn(() => false),
}));

vi.mock('../employeeUtils', () => ({
  employeeDisplayName: vi.fn(() => 'Employee'),
  isActiveDashboardEmployee: vi.fn(() => true),
}));

import { inboxItemToManagerAttentionItem, sortManagerAttentionItems } from './portalAttention';
import type { HrInboxItem } from '../hrInbox';

describe('portalAttention', () => {
  it('maps leave inbox items to manager attention rows with request id', () => {
    const item: HrInboxItem = {
      id: 'leave:abc-123',
      kind: 'leave_request',
      severity: 'due_soon',
      title: 'Time off approval — Alex Smith',
      detail: 'Vacation · Jul 28–Jul 30',
      employeeName: 'Alex Smith',
      dueDate: '2026-07-28',
      route: { type: 'employee', employeeId: 'emp-1', drawerTab: 'time-off' },
    };

    const mapped = inboxItemToManagerAttentionItem(item);
    expect(mapped.kind).toBe('leave_request');
    expect(mapped.leaveRequestId).toBe('abc-123');
    expect(mapped.route).toEqual(item.route);
  });

  it('sorts manager attention rows by severity then name', () => {
    const sorted = sortManagerAttentionItems([
      {
        id: 'b',
        kind: 'stay_interview',
        severity: 'due_soon',
        employeeId: '2',
        employeeName: 'Zoe Adams',
        title: 'Stay interview due soon',
        detail: 'Due soon',
        drawerTab: 'stay-interviews',
      },
      {
        id: 'a',
        kind: 'performance_review',
        severity: 'overdue',
        employeeId: '1',
        employeeName: 'Alex Smith',
        title: 'Review due',
        detail: 'Overdue',
        drawerTab: 'reviews',
      },
    ]);

    expect(sorted[0]?.id).toBe('a');
    expect(sorted[1]?.id).toBe('b');
  });
});
