import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabaseClient: {} }));

import { setAccessSession } from './accessState';
import {
  canAccessDisciplineForEmployee,
  canAccessPerformanceReviews,
  canEditEmployeeAdmin,
} from './accessScopes';

const directReport = { id: 'BTW-REPORT', supervisor: 'Team Supervisor' };

describe('employee admin permissions', () => {
  beforeEach(() => {
    window.isCreatingEmployee = false;
    window.currentEmployee = null;
    setAccessSession(null, 'user');
  });

  it('allows an administrator to fill and save a new employee without an existing record', () => {
    setAccessSession(null, 'admin');
    window.isCreatingEmployee = true;
    expect(canEditEmployeeAdmin(null)).toBe(true);
  });

  it.each(['supervisor', 'user', 'janus', 'janus_readonly'])('blocks %s from creating employees', (role) => {
    setAccessSession({ supervised_employee_ids: [directReport.id] } as never, role);
    window.isCreatingEmployee = true;
    expect(canEditEmployeeAdmin(directReport)).toBe(false);
  });

  it('keeps administrators able to edit existing employees', () => {
    setAccessSession(null, 'admin');
    expect(canEditEmployeeAdmin(directReport)).toBe(true);
  });

  it('allows supervisors to edit only their existing direct reports', () => {
    setAccessSession({ supervised_employee_ids: [directReport.id] } as never, 'supervisor');
    expect(canEditEmployeeAdmin(directReport)).toBe(true);
    expect(canEditEmployeeAdmin({ id: 'OTHER' })).toBe(false);
  });

  it('keeps related records locked until a new employee has been saved', () => {
    setAccessSession(null, 'admin');
    window.isCreatingEmployee = true;
    expect(canAccessDisciplineForEmployee(null)).toBe(false);
    expect(canAccessPerformanceReviews(null)).toBe(false);
  });
});
