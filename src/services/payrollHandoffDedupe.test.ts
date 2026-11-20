import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const rows: Row[] = [];
const invoke = vi.fn();

vi.mock('./supabaseClient', () => {
  function from() {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push([col, value]);
        return builder;
      },
      limit: async () => ({
        data: rows.filter((row) => filters.every(([col, value]) => row[col] === value)),
        error: null,
      }),
      insert: (values: Row[]) => ({
        select: () => ({
          single: async () => {
            const row = { id: `h-${rows.length + 1}`, status: 'pending', ...values[0] };
            rows.push(row);
            return { data: row, error: null };
          },
        }),
      }),
    };
    return builder;
  }
  return {
    supabaseClient: {
      from,
      functions: { invoke: (...args: unknown[]) => invoke(...args) },
    },
  };
});

vi.mock('./access', () => ({ getCurrentUserAccess: () => ({ email: 'hr@example.com' }) }));
vi.mock('./employeeUtils', () => ({ employeeDisplayName: () => 'Jordan Rivera' }));

describe('payroll handoff duplicate check', () => {
  beforeEach(() => {
    rows.length = 0;
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('logs and emails a new change even when an older one of the same type is pending', async () => {
    rows.push({
      id: 'old',
      employee_id: 'BTW2150',
      change_type: 'department',
      effective_date: '2026-10-13',
      summary: 'Department: Warehouse → Production — Jordan Rivera',
      status: 'pending',
    });
    const { createPayrollHandoff } = await import('./payrollHandoff');

    const row = await createPayrollHandoff({
      employee_id: 'BTW2150',
      change_type: 'department',
      effective_date: '2026-11-20',
      summary: 'Department: Production → Shipping — Jordan Rivera',
    });

    expect(row).not.toBeNull();
    expect(rows).toHaveLength(2);
    expect(invoke).toHaveBeenCalledWith('notify-payroll-change', {
      body: { handoff_id: row?.id },
    });
  });

  it('skips an identical pending change so payroll is not emailed twice', async () => {
    const draft = {
      employee_id: 'BTW2150',
      change_type: 'termination' as const,
      effective_date: '2026-11-20',
      summary: 'Termination — Jordan Rivera',
    };
    const { createPayrollHandoff } = await import('./payrollHandoff');

    expect(await createPayrollHandoff(draft)).not.toBeNull();
    expect(await createPayrollHandoff(draft)).toBeNull();
    expect(rows).toHaveLength(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('logs the same change again once the earlier one was sent to payroll', async () => {
    rows.push({
      id: 'old',
      employee_id: 'BTW2150',
      change_type: 'new_hire',
      effective_date: '2026-11-24',
      summary: 'New hire — Jordan Rivera',
      status: 'sent',
    });
    const { createPayrollHandoff } = await import('./payrollHandoff');

    const row = await createPayrollHandoff({
      employee_id: 'BTW2150',
      change_type: 'new_hire',
      effective_date: '2026-11-24',
      summary: 'New hire — Jordan Rivera',
    });

    expect(row).not.toBeNull();
  });
});
