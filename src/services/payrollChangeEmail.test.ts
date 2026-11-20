import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const insertedRow = {
  id: 'handoff-1',
  employee_id: 'BTW2150',
  change_type: 'termination',
  effective_date: '2026-11-20',
  summary: 'Termination — Jordan Rivera',
  payload: {},
  status: 'pending',
  created_at: '2026-11-20T15:00:00Z',
};

vi.mock('./supabaseClient', () => {
  const pendingCheck = {
    select: () => pendingCheck,
    eq: () => pendingCheck,
    limit: async () => ({ data: [], error: null }),
  };
  return {
    supabaseClient: {
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
      from: () => ({
        ...pendingCheck,
        insert: () => ({
          select: () => ({ single: async () => ({ data: insertedRow, error: null }) }),
        }),
      }),
    },
  };
});

vi.mock('./access', () => ({ getCurrentUserAccess: () => ({ email: 'hr@example.com' }) }));
vi.mock('./employeeUtils', () => ({ employeeDisplayName: () => 'Jordan Rivera' }));

describe('payroll change email request', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('asks the Edge Function to email once for each new handoff', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { createPayrollHandoff } = await import('./payrollHandoff');

    const row = await createPayrollHandoff({
      employee_id: 'BTW2150',
      change_type: 'termination',
      effective_date: '2026-11-20',
      summary: 'Termination — Jordan Rivera',
    });

    expect(row?.id).toBe('handoff-1');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('notify-payroll-change', {
      body: { handoff_id: 'handoff-1' },
    });
  });

  it('still returns the handoff when the email request fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    invoke.mockRejectedValue(new Error('network down'));
    const { createPayrollHandoff } = await import('./payrollHandoff');

    const row = await createPayrollHandoff({
      employee_id: 'BTW2150',
      change_type: 'new_hire',
      effective_date: '2026-11-24',
      summary: 'New hire — Jordan Rivera',
    });

    expect(row?.id).toBe('handoff-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith(
      '[PayrollChangeEmail] Payroll email failed:',
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
