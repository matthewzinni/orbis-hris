import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabaseClient: {} }));

const { getCurrentUserAccess, isSupervisorUser } = vi.hoisted(() => ({
  getCurrentUserAccess: vi.fn(),
  isSupervisorUser: vi.fn(() => true),
}));
vi.mock('./accessState', () => ({
  getCurrentUserAccess,
  isAdminUser: vi.fn(() => false),
  isSupervisorUser,
}));

import { employeeMatchesSupervisorAccess } from './accessScopes';

describe('employeeMatchesSupervisorAccess', () => {
  it('matches via display_name when supervisor_name is blank, like the sibling discipline-scope check', () => {
    getCurrentUserAccess.mockReturnValue({ supervisor_name: '', display_name: 'Jordan Lee' });

    expect(employeeMatchesSupervisorAccess({ supervisor: 'Jordan Lee' })).toBe(true);
  });

  it('still matches via supervisor_name when it is set', () => {
    getCurrentUserAccess.mockReturnValue({ supervisor_name: 'Jordan Lee', display_name: '' });

    expect(employeeMatchesSupervisorAccess({ supervisor: 'Jordan Lee' })).toBe(true);
  });

  it('returns false when neither supervisor_name nor display_name is set', () => {
    getCurrentUserAccess.mockReturnValue({ supervisor_name: '', display_name: '' });

    expect(employeeMatchesSupervisorAccess({ supervisor: 'Jordan Lee' })).toBe(false);
  });
});
