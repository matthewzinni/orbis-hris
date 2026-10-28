import { describe, expect, it } from 'vitest';
import { countInHouseFteEmployees, isInHouseFteEmployee } from './employeeUtils';

describe('in-house full-time headcount', () => {
  const hourlyEmployee = { id: 'BTW9999', status: 'ACTIVE', pay_type: 'Hourly' };

  it('excludes hourly workers whose recorded weekly hours are below 30', () => {
    expect(countInHouseFteEmployees([
      { ...hourlyEmployee, standard_hours: 20 },
      { ...hourlyEmployee, standard_hours: '24' },
      { ...hourlyEmployee, standardHours: 29.5 },
      { ...hourlyEmployee, standard_hours: 30 },
      { ...hourlyEmployee, standard_hours: 40 },
    ])).toBe(2);
  });

  it('continues to exclude an explicit part-time label even with full-time hours', () => {
    expect(isInHouseFteEmployee({
      ...hourlyEmployee, pay_type: 'Part Time', standard_hours: 40,
    })).toBe(false);
  });

  it.each([undefined, null, '', 0, 'unknown', -1])(
    'preserves existing behavior when weekly hours are unspecified or invalid (%s)',
    (standard_hours) => {
      expect(isInHouseFteEmployee({ ...hourlyEmployee, standard_hours })).toBe(true);
    },
  );

  it('preserves the existing exclusions regardless of weekly hours', () => {
    expect(countInHouseFteEmployees([
      { ...hourlyEmployee, status: 'TERMINATED', termination_date: '2026-01-01', standard_hours: 40 },
      { ...hourlyEmployee, status: 'INACTIVE', standard_hours: 40 },
      { ...hourlyEmployee, pay_type: 'Contract', standard_hours: 40 },
      { ...hourlyEmployee, is_remote: true, standard_hours: 40 },
      { ...hourlyEmployee, id: 'BTW1601', standard_hours: 40 },
      { ...hourlyEmployee, id: 'BTW1602', standard_hours: 40 },
    ])).toBe(0);
  });
});
