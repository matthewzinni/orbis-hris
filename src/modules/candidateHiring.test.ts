import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { from, refreshDerivedUiProfile, logNewHirePayrollHandoff } = vi.hoisted(() => ({
  from: vi.fn(),
  refreshDerivedUiProfile: vi.fn(),
  logNewHirePayrollHandoff: vi.fn(),
}));

vi.mock('../services/supabaseClient', () => ({ supabaseClient: { from } }));
vi.mock('../services/access', () => ({
  getCurrentUserAccess: vi.fn(),
  getSupervisorDepartmentScope: vi.fn(() => []),
  isAdminUser: vi.fn(() => true),
  isSupervisorUser: vi.fn(() => false),
}));
vi.mock('../services/employeeIds', () => ({
  generateAvailableEmployeeId: vi.fn(async () => 'BTW26100'),
}));
vi.mock('../services/payrollHandoff', () => ({ logNewHirePayrollHandoff }));
vi.mock('../services/derivedDataRefresh', () => ({ refreshDerivedUiProfile }));

function query(data: unknown, error: unknown = null) {
  const result = Promise.resolve({ data, error });
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    or: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    then: result.then.bind(result),
  };
  from.mockReturnValueOnce(chain);
  return chain;
}

const candidate = {
  id: 'candidate-1', first_name: 'Test', last_name: 'Hire',
  phone: '  (555) 010-1234  ', email: '', stage: 'Offer',
};
let convertCandidateToEmployee: typeof import('./candidates').convertCandidateToEmployee;

beforeAll(async () => {
  vi.stubGlobal('document', {
    readyState: 'loading', addEventListener: vi.fn(), getElementById: vi.fn(() => null),
  });
  ({ convertCandidateToEmployee } = await import('./candidates'));
});

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReset();
  window.showToast = vi.fn();
  window.loadEmployees = vi.fn(async () => undefined);
});

describe('candidate hiring phone transfer', () => {
  it.each([null, '', '   '])('fills an existing employee phone when it is %j', async (phone) => {
    query(candidate);
    query([{ id: 'BTW2601', phone }]);
    const employeeUpdate = query(null);
    const candidateUpdate = query(null);

    expect(await convertCandidateToEmployee(candidate.id)).toBe(true);
    expect(employeeUpdate.update).toHaveBeenCalledWith({ phone: '(555) 010-1234' });
    expect(employeeUpdate.eq).toHaveBeenCalledWith('id', 'BTW2601');
    if (phone === null) {
      expect(employeeUpdate.is).toHaveBeenCalledWith('phone', null);
    } else {
      expect(employeeUpdate.eq).toHaveBeenCalledWith('phone', phone);
    }
    expect(candidateUpdate.update).toHaveBeenCalledWith({
      stage: 'Hired', linked_employee_id: 'BTW2601',
    });
  });

  it('copies the number to the employee matched by email instead of a same-name employee', async () => {
    query({ ...candidate, email: 'hire@example.test' });
    query([{ id: 'same-name', phone: null }]);
    const emailLookup = query([{ id: 'email-match', phone: null }]);
    const employeeUpdate = query(null);
    query(null);

    expect(await convertCandidateToEmployee(candidate.id)).toBe(true);
    expect(emailLookup.select).toHaveBeenCalledWith('id, phone');
    expect(employeeUpdate.eq).toHaveBeenCalledWith('id', 'email-match');
    expect(employeeUpdate.update).toHaveBeenCalledWith({ phone: '(555) 010-1234' });
  });

  it.each([
    { candidatePhone: candidate.phone, employeePhone: '555-010-9876' },
    { candidatePhone: '', employeePhone: null },
  ])('preserves existing contact data: %j', async ({ candidatePhone, employeePhone }) => {
    query({ ...candidate, phone: candidatePhone });
    query([{ id: 'BTW2601', phone: employeePhone }]);
    const candidateUpdate = query(null);

    expect(await convertCandidateToEmployee(candidate.id)).toBe(true);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['candidates', 'employees', 'candidates']);
    expect(candidateUpdate.update).toHaveBeenCalledWith({
      stage: 'Hired', linked_employee_id: 'BTW2601',
    });
  });

  it('keeps the candidate unhired when saving their phone fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    query(candidate);
    query([{ id: 'BTW2601', phone: null }]);
    query(null, { message: 'Permission denied' });

    expect(await convertCandidateToEmployee(candidate.id)).toBe(false);
    expect(from).toHaveBeenCalledTimes(3);
    expect(window.showToast).toHaveBeenCalledWith(
      'Could not save the employee phone number. Please try hiring again.', 'error'
    );
    expect(refreshDerivedUiProfile).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('retains the phone when creating a new employee', async () => {
    query(candidate);
    query([]);
    const employeeInsert = query([{ id: 'BTW26100' }]);
    query(null);

    expect(await convertCandidateToEmployee(candidate.id)).toBe(true);
    expect(employeeInsert.insert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'BTW26100', phone: '(555) 010-1234' }),
    ]);
  });

  it('retains the phone when completing a linked internal move', async () => {
    query({ ...candidate, linked_employee_id: 'BTW2601' });
    query({ id: 'BTW2601' });
    const employeeUpdate = query(null);
    query(null);

    expect(await convertCandidateToEmployee(candidate.id)).toBe(true);
    expect(employeeUpdate.update).toHaveBeenCalledWith({ phone: '(555) 010-1234' });
  });
});
