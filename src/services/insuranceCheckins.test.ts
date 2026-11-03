import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabaseClient: {} }));
vi.mock('./accessScopes', () => ({ getCurrentAuthEmail: () => 'hr@example.com' }));

import { buildInsuranceCheckinRows } from './insuranceCheckins';

const today = new Date(2026, 10, 3);

function employee(id: string, first: string, hireDate: string, extra: Record<string, unknown> = {}) {
  return { id, first, last: 'Tester', status: 'Active', pay_type: 'Hourly', hire_date: hireDate, department: 'Fulfillment', ...extra };
}

describe('buildInsuranceCheckinRows', () => {
  it('lists in-house employees once they reach 30 days', () => {
    const rows = buildInsuranceCheckinRows(
      [employee('E1', 'Thirty', '2026-10-04'), employee('E2', 'TwentyNine', '2026-10-05')],
      {},
      today
    );
    expect(rows.map((row) => row.employeeId)).toEqual(['E1']);
    expect(rows[0].daysEmployed).toBe(30);
  });

  it('skips terminated, part-time, and contract employees', () => {
    const rows = buildInsuranceCheckinRows(
      [
        employee('E1', 'Gone', '2026-01-01', { status: 'Terminated', termination_date: '2026-10-01' }),
        employee('E2', 'Part', '2026-01-01', { pay_type: 'Part-Time' }),
        employee('E3', 'Kept', '2026-01-01'),
      ],
      {},
      today
    );
    expect(rows.map((row) => row.employeeId)).toEqual(['E3']);
  });

  it('puts people not yet spoken with first, newest hires first', () => {
    const rows = buildInsuranceCheckinRows(
      [
        employee('E1', 'Old', '2024-01-01'),
        employee('E2', 'Recent', '2026-09-01'),
        employee('E3', 'Done', '2026-09-15'),
      ],
      { E3: { discussedBy: 'hr@example.com', discussedAt: '2026-11-01T15:00:00Z' } },
      today
    );
    expect(rows.map((row) => row.employeeId)).toEqual(['E2', 'E1', 'E3']);
    expect(rows[2].discussion?.discussedBy).toBe('hr@example.com');
  });

  it('skips employees without a hire date', () => {
    expect(buildInsuranceCheckinRows([employee('E1', 'NoDate', '')], {}, today)).toEqual([]);
  });
});
