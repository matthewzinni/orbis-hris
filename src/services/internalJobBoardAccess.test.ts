import { describe, expect, it, vi } from 'vitest';

const { getCurrentUserAccess, isAdminUser, isSupervisorUser } = vi.hoisted(() => ({
  getCurrentUserAccess: vi.fn(),
  isAdminUser: vi.fn(() => false),
  isSupervisorUser: vi.fn(() => true),
}));

vi.mock('./access', () => ({
  getCurrentUserAccess,
  getLinkedEmployeeId: vi.fn(),
  getSupervisorDepartmentScope: vi.fn(() => []),
  isAdminUser,
  isSupervisorUser,
  employeeMatchesSupervisorAccess: vi.fn(() => false),
}));

import { hiringManagerMatchesScope } from './internalJobBoardAccess';

describe('hiringManagerMatchesScope', () => {
  it('does not match a short substring collision (e.g. "Lee" vs "Ashley Lee")', () => {
    getCurrentUserAccess.mockReturnValue({ supervisor_name: 'Lee', display_name: '' });

    expect(hiringManagerMatchesScope('Ashley Lee')).toBe(false);
  });

  it('still matches a genuine exact or multi-token name', () => {
    getCurrentUserAccess.mockReturnValue({ supervisor_name: 'Jordan Lee', display_name: '' });

    expect(hiringManagerMatchesScope('Jordan Lee')).toBe(true);
  });
});
