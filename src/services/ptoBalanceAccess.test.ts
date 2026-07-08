import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseClient: {
    from: vi.fn(),
  },
}));

vi.mock('./accessState', () => ({
  getCurrentUserAccess: vi.fn(),
  isAdminUser: vi.fn(() => false),
  isSupervisorUser: vi.fn(() => false),
}));

vi.mock('../config/instanceConfig', () => ({
  instanceConfig: () => ({
    orgWideScopeEmails: ['matthew.zinni@btwglobal.com'],
    orgWideDisciplineEmails: ['matthew.zinni@btwglobal.com'],
  }),
  BTW_DEFAULT_ORG_WIDE_SCOPE_EMAILS: ['matthew.zinni@btwglobal.com'],
  BTW_DEFAULT_ORG_WIDE_DISCIPLINE_EMAILS: ['matthew.zinni@btwglobal.com'],
}));

import { getCurrentUserAccess } from './accessState';
import { canAdjustPtoBalance, PTO_BALANCE_EDITOR_EMAIL } from './accessScopes';

describe('canAdjustPtoBalance', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserAccess).mockReset();
  });

  it('allows only Matthew Zinni email', () => {
    vi.mocked(getCurrentUserAccess).mockReturnValue({
      email: PTO_BALANCE_EDITOR_EMAIL,
    } as never);
    expect(canAdjustPtoBalance()).toBe(true);
  });

  it('blocks other admin emails', () => {
    vi.mocked(getCurrentUserAccess).mockReturnValue({
      email: 'trent.wynne@btwglobal.com',
    } as never);
    expect(canAdjustPtoBalance()).toBe(false);
  });

  it('blocks when no email is present', () => {
    vi.mocked(getCurrentUserAccess).mockReturnValue(null);
    expect(canAdjustPtoBalance()).toBe(false);
  });
});
