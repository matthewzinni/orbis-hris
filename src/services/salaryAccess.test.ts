import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabaseClient: { from: vi.fn(), rpc: vi.fn() } }));

vi.mock('./accessState', () => ({
  accessSafeGet: vi.fn(() => null),
  getCurrentUserAccess: vi.fn(),
  getCurrentUserRole: vi.fn(() => 'admin'),
  getLinkedEmployeeId: vi.fn(() => null),
  hasJanusAccessGrant: vi.fn(() => false),
  isAdminUser: vi.fn(() => true),
  isEmployeeUser: vi.fn(() => false),
  isJanusReadonlyUser: vi.fn(() => false),
  isJanusUser: vi.fn(() => false),
  isPortalUser: vi.fn(() => false),
  isSupervisorUser: vi.fn(() => false),
  setAccessRole: vi.fn(),
  setAccessRow: vi.fn(),
  setAccessSession: vi.fn(),
  setLinkedEmployeeId: vi.fn(),
  setSupervisedEmployeeIds: vi.fn(),
  syncAccessToWindow: vi.fn(),
}));

import { getCurrentUserAccess, isAdminUser, isPortalUser, isSupervisorUser } from './accessState';
import { canViewSalaries, SALARY_VIEWER_EMAIL } from './accessScopes';
import { canAccessAppSection } from './accessRoles';

function signIn(email: string, role: 'admin' | 'supervisor' | 'user'): void {
  vi.mocked(getCurrentUserAccess).mockReturnValue({ email, role } as never);
  vi.mocked(isAdminUser).mockReturnValue(role === 'admin');
  vi.mocked(isSupervisorUser).mockReturnValue(role === 'supervisor');
  vi.mocked(isPortalUser).mockReturnValue(role === 'user');
}

describe('Salary page access', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  it('allows Matthew only', () => {
    signIn(SALARY_VIEWER_EMAIL, 'admin');
    expect(canViewSalaries()).toBe(true);
    expect(canAccessAppSection('salaryView')).toBe(true);
  });

  it('blocks other HR admins, including leadership', () => {
    for (const email of ['trent.wynne@btwglobal.com', 'david.allewalt@btwglobal.com', 'orlando.gomez@btwglobal.com']) {
      signIn(email, 'admin');
      expect(canViewSalaries()).toBe(false);
      expect(canAccessAppSection('salaryView')).toBe(false);
      // Sanity: the same admin still reaches other admin sections.
      expect(canAccessAppSection('reportsView')).toBe(true);
    }
  });

  it('blocks supervisors and employees', () => {
    signIn('someone@btwglobal.com', 'supervisor');
    expect(canAccessAppSection('salaryView')).toBe(false);
    signIn('employee@btwglobal.com', 'user');
    expect(canAccessAppSection('salaryView')).toBe(false);
  });

  it('blocks look-alike emails and signed-out users', () => {
    signIn('matthew.zinni@btwglobal.com.evil.test', 'admin');
    expect(canViewSalaries()).toBe(false);
    signIn('xmatthew.zinni@btwglobal.com', 'admin');
    expect(canViewSalaries()).toBe(false);
    vi.mocked(getCurrentUserAccess).mockReturnValue(null);
    expect(canViewSalaries()).toBe(false);
  });

  it('is case-insensitive for Matthew', () => {
    signIn('Matthew.Zinni@BTWGlobal.com', 'admin');
    expect(canViewSalaries()).toBe(true);
  });
});
