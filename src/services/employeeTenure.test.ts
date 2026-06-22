import { describe, expect, it } from 'vitest';
import {
  formatEmployeeTenureMonths,
  formatEmployeeTenureYears,
  getEmployeeTenureMonths,
  getEmployeeTenureYears,
  resolveEmployeeTenureFields,
} from './employeeTenure';

describe('employeeTenure', () => {
  const referenceDate = new Date('2026-06-18T12:00:00');

  it('computes tenure from hire date when stored values are missing', () => {
    const employee = { hire_date: '2015-06-15' };
    expect(getEmployeeTenureMonths(employee, referenceDate)).toBe(132);
    expect(getEmployeeTenureYears(employee, referenceDate)).toBe(11);
    expect(formatEmployeeTenureMonths(employee, referenceDate)).toBe('132');
    expect(formatEmployeeTenureYears(employee, referenceDate)).toBe('11');
  });

  it('uses stored tenure only when hire date is missing', () => {
    const employee = { tenure_months: 48, tenure_years: 4 };
    expect(getEmployeeTenureMonths(employee, referenceDate)).toBe(48);
    expect(getEmployeeTenureYears(employee, referenceDate)).toBe(4);
  });

  it('resolves payload fields for save', () => {
    expect(resolveEmployeeTenureFields({ hire_date: '2026-03-01' }, referenceDate)).toEqual({
      tenure_months: 3,
      tenure_years: 0,
    });
  });
});
