import { describe, expect, it } from 'vitest';
import {
  getAccessApprovalStatus,
  hasExplicitSupervisorScope,
  normalizeOrbisRole,
  parseSupervisedEmployeeIds,
} from './accessTypes';

describe('accessTypes', () => {
  it('normalizes employee role alias to user', () => {
    expect(normalizeOrbisRole('employee')).toBe('user');
    expect(normalizeOrbisRole('Admin')).toBe('admin');
  });

  it('parses supervised employee ids', () => {
    expect(parseSupervisedEmployeeIds({ supervised_employee_ids: [' BTW100 ', 'btw200'] })).toEqual([
      'btw100',
      'btw200',
    ]);
    expect(parseSupervisedEmployeeIds(null)).toEqual([]);
    expect(parseSupervisedEmployeeIds({ supervised_employee_ids: [] })).toEqual([]);
  });

  it('distinguishes explicit empty scope from unset scope', () => {
    expect(hasExplicitSupervisorScope({ supervised_employee_ids: [] })).toBe(true);
    expect(hasExplicitSupervisorScope({ supervised_employee_ids: null })).toBe(false);
    expect(hasExplicitSupervisorScope({})).toBe(false);
  });

  it('reads approval status', () => {
    expect(getAccessApprovalStatus({ approval_status: 'pending' })).toBe('pending');
    expect(getAccessApprovalStatus({ approval_status: 'approved' })).toBe('approved');
  });
});
