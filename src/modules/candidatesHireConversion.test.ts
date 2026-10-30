import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../ui/confirmModal', () => ({ showOrbisConfirm: vi.fn() }));
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

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../services/supabaseClient', () => ({ supabaseClient: { from } }));

/** A chainable, awaitable fake Supabase query builder that always resolves to `response`. */
function builder(response: unknown) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    or: () => obj,
    limit: () => obj,
    single: () => Promise.resolve(response),
    maybeSingle: () => Promise.resolve(response),
    then: (resolve: (value: unknown) => void) => resolve(response),
  };
  return obj;
}

vi.stubGlobal('document', {
  readyState: 'complete',
  addEventListener: vi.fn(),
  getElementById: () => null,
});

const { convertCandidateToEmployee } = await import('./candidates');

describe('convertCandidateToEmployee (match-by-email/name branch)', () => {
  const employeeUpdates: Array<{ table: string; payload: Record<string, unknown>; id: string }> = [];

  beforeEach(() => {
    employeeUpdates.length = 0;
    vi.stubGlobal('window', { showToast: vi.fn() });

    from.mockImplementation((table: string) => {
      if (table === 'candidates') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: 'cand-1',
                    first_name: 'Jamie',
                    last_name: 'Rivera',
                    email: 'jamie.rivera@btwglobal.com',
                    phone: '555-0100',
                    position: 'Senior Analyst',
                    department: 'Finance',
                    linked_employee_id: '',
                  },
                  error: null,
                }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              employeeUpdates.push({ table: 'candidates', payload, id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === 'employees') {
        return {
          select: (fields: string) => {
            if (fields.includes('first_name')) {
              // Name-match lookup: no match by name.
              return { eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) };
            }
            if (fields === 'id') {
              // Email-match lookup: matches an existing employee.
              return { or: () => ({ limit: () => Promise.resolve({ data: [{ id: 'EMP-200' }], error: null }) }) };
            }
            if (fields.includes('position')) {
              // Fetch the matched employee's current position/department before diffing.
              return {
                eq: () =>
                  builder({ data: { id: 'EMP-200', position: 'Analyst', department: 'Finance' }, error: null }),
              };
            }
            return builder({ data: null, error: null });
          },
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              employeeUpdates.push({ table: 'employees', payload, id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      return builder({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the candidate phone, position, and email onto the matched employee record', async () => {
    const result = await convertCandidateToEmployee('cand-1');

    expect(result).toBe(true);

    const employeeUpdate = employeeUpdates.find((u) => u.table === 'employees' && u.id === 'EMP-200');
    expect(employeeUpdate).toBeDefined();
    expect(employeeUpdate?.payload).toMatchObject({
      phone: '555-0100',
      position: 'Senior Analyst',
      work_email: 'jamie.rivera@btwglobal.com',
    });

    const candidateUpdate = employeeUpdates.find((u) => u.table === 'candidates');
    expect(candidateUpdate?.payload).toMatchObject({ stage: 'Hired', linked_employee_id: 'EMP-200' });
  });
});
