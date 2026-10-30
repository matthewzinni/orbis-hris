import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../mobile/mobileOverlays', () => ({ applySharedDrawerOpenStyles: vi.fn() }));
vi.mock('../services/access', () => ({
  getCurrentUserAccess: vi.fn(() => null),
  getSupervisorDepartmentScope: vi.fn(() => []),
  isAdminUser: vi.fn(() => true),
  isSupervisorUser: vi.fn(() => false),
}));
vi.mock('../services/candidateSummaryEmail', () => ({ openCandidateSummaryLeadershipEmail: vi.fn() }));
vi.mock('../services/employeeIds', () => ({ generateAvailableEmployeeId: vi.fn(() => Promise.resolve('BTW9999')) }));
vi.mock('../services/employeeUtils', () => ({ employeePortalSignInEmail: vi.fn() }));
vi.mock('../services/payrollHandoff', () => ({ logNewHirePayrollHandoff: vi.fn() }));
vi.mock('../ui/dashboardRetry', () => ({ renderDashboardRetryState: vi.fn() }));
vi.mock('../ui/drawerIdentityHeader', () => ({
  mountDrawerIdentityHeader: vi.fn(),
  mountLegacyDrawerHeader: vi.fn(),
  removeDrawerIdentityHeader: vi.fn(),
  restoreDrawerLegacyHeader: vi.fn(),
  restoreDrawerTabPlacement: vi.fn(),
}));
vi.mock('../services/candidateResume', () => ({
  candidateResumeIsAvailable: vi.fn(),
  clearCandidateResume: vi.fn(),
  isResumeReferenceValid: vi.fn(),
  openCandidateResume: vi.fn(),
  parseResumeReference: vi.fn(),
  resumeFileLabel: vi.fn(),
  uploadCandidateResume: vi.fn(),
}));
vi.mock('../services/derivedDataRefresh', () => ({ refreshDerivedUiProfile: vi.fn() }));

const { showOrbisConfirm } = vi.hoisted(() => ({ showOrbisConfirm: vi.fn() }));
vi.mock('../ui/confirmModal', () => ({ showOrbisConfirm }));

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../services/supabaseClient', () => ({ supabaseClient: { from } }));

vi.stubGlobal('document', {
  readyState: 'complete',
  addEventListener: vi.fn(),
  getElementById: () => null,
});

const { moveCandidateToStage } = await import('./candidates');

describe('moveCandidateToStage', () => {
  let updateCalls: Array<{ table: string; payload: Record<string, unknown> }>;

  beforeEach(() => {
    updateCalls = [];
    vi.clearAllMocks();
    vi.stubGlobal('window', { showToast: vi.fn() });

    from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { id: 'cand-1', first_name: 'Taylor', last_name: 'Reed', department: 'Ops', stage: 'Offer' },
              error: null,
            }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, _id: string) => {
          updateCalls.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      }),
    }));
  });

  it('asks for confirmation before moving a candidate to Hired, and does nothing if declined', async () => {
    showOrbisConfirm.mockResolvedValue(false);

    await moveCandidateToStage('cand-1', 'Hired');

    expect(showOrbisConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Taylor Reed'),
      expect.objectContaining({ title: 'Hire candidate' })
    );
    expect(updateCalls.some((c) => (c.payload as { stage?: string }).stage === 'Hired')).toBe(false);
  });

  it('does not ask for confirmation on an ordinary stage move', async () => {
    await moveCandidateToStage('cand-1', 'Interview');

    expect(showOrbisConfirm).not.toHaveBeenCalled();
    expect(updateCalls).toContainEqual({ table: 'candidates', payload: { stage: 'Interview' } });
  });
});
