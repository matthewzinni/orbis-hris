import { describe, expect, it } from 'vitest';
import { buildInsuranceRosterRows } from './insuranceRoster';

describe('insurance roster', () => {
  it('includes active stateside full-time hourly and salary staff', () => {
    const rows = buildInsuranceRosterRows([
      { id: 'BTW2602', first_name: 'Zoe', last_name: 'Able', status: 'ACTIVE', pay_type: 'Hourly', is_remote: false },
      { id: 'BTW2601', first_name: 'Amy', last_name: 'Baker', status: 'Leave', pay_type: 'Salary', is_remote: false },
    ]);
    expect(rows.map(row => row[0])).toEqual(['BTW2602', 'BTW2601']);
  });

  it('excludes remote, part-time, contract, inactive, terminated, and excluded owners', () => {
    const employees = [
      { id: 'R', first_name: 'Remote', last_name: 'Worker', status: 'ACTIVE', pay_type: 'Hourly', is_remote: true },
      { id: 'P', first_name: 'Part', last_name: 'Time', status: 'ACTIVE', pay_type: 'Part Time' },
      { id: 'H', first_name: 'Low', last_name: 'Hours', status: 'ACTIVE', pay_type: 'Hourly', standard_hours: 22 },
      { id: 'C', first_name: 'Contract', last_name: 'Worker', status: 'ACTIVE', pay_type: 'Contract' },
      { id: 'I', first_name: 'Inactive', last_name: 'Worker', status: 'INACTIVE', pay_type: 'Hourly' },
      { id: 'T', first_name: 'Former', last_name: 'Worker', status: 'TERMINATED', pay_type: 'Hourly' },
      { id: 'BTW1601', first_name: 'Trent', last_name: 'Wynne', status: 'ACTIVE', pay_type: 'Salary' },
      { id: 'BTW1602', first_name: 'Brent', last_name: 'Wynne', status: 'ACTIVE', pay_type: 'Salary' },
    ];
    expect(buildInsuranceRosterRows(employees)).toEqual([]);
  });
});
