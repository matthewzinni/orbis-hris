import { describe, expect, it } from 'vitest';
import {
  annualizedSalary,
  currentSalaryRow,
  inferPayBasis,
  parseSalaryImport,
  raisePercent,
  summarizeEmployeeSalary,
  type CompensationExtra,
  type StoredSalaryRow,
} from './salaryData';
import { enPersonKey } from './employeeNavigatorBenefits';

const HEADER = 'Employee SSN,First Name,Last Name,Hire Date,Employment Status,Salary Type,Effective Date,Annual Base Salary,Hourly Rate,Hours Per Week,Annual Benefit Salary,Change Reason';

describe('parseSalaryImport', () => {
  it('groups rows per EN person, drops SSN, and infers pay basis', () => {
    const csv = [
      HEADER,
      '111-22-3333,Pat,Example,01/15/2020,Active,Current,03/01/2025,"$90,000.00",,,"$90,000.00",Merit',
      '111-22-3333,Pat,Example,01/15/2020,Active,Past,01/15/2020,"$80,000.00",,,,',
      ',Sam,Sample,06/01/2024,Active,Current,06/01/2024,,$22.50,32,,New hire',
    ].join('\n');
    const result = parseSalaryImport(csv);
    expect(result.rowCount).toBe(3);
    expect(result.people.map((p) => p.person_key)).toEqual([
      enPersonKey('Pat', 'Example', '2020-01-15'),
      enPersonKey('Sam', 'Sample', '2024-06-01'),
    ]);
    expect(result.history).toHaveLength(3);
    expect(result.history[0]).toMatchObject({
      salary_type: 'Current', effective_date: '2025-03-01', pay_basis: 'annual',
      annual_base_salary: 90000, annual_benefit_salary: 90000, change_reason: 'Merit',
    });
    expect(result.history[2]).toMatchObject({ pay_basis: 'hourly', hourly_rate: 22.5, hours_per_week: 32 });
    expect(JSON.stringify(result)).not.toContain('111-22-3333');
  });

  it('skips EN "Benefit" (benefit-salary override) rows from pay history', () => {
    const csv = [
      HEADER,
      ',Pat,Example,01/15/2020,Active,Base,03/01/2025,"$90,000.00",,,,Merit',
      ',Pat,Example,01/15/2020,Active,Benefit,03/01/2025,,,,"$95,000.00",',
    ].join('\n');
    const result = parseSalaryImport(csv);
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({ salary_type: 'Base', annual_base_salary: 90000 });
    expect(result.warnings).toEqual([]);
  });

  it('keeps people with no salary rows and warns about them', () => {
    const csv = [HEADER, ',Lee,Nopay,02/02/2022,Active,,,,,,,'].join('\n');
    const result = parseSalaryImport(csv);
    expect(result.people).toHaveLength(1);
    expect(result.history).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/no salary rows/);
  });

  it('rejects files missing required columns', () => {
    expect(() => parseSalaryImport('First Name,Last Name\nPat,Example')).toThrow(/Missing columns/);
    expect(() => parseSalaryImport(HEADER)).toThrow(/no data rows/);
  });
});

describe('salary math', () => {
  it('annualizes hourly pay with row hours, then standard hours, then 40', () => {
    expect(annualizedSalary({ annual_base_salary: 50000, hourly_rate: null, hours_per_week: null }))
      .toEqual({ amount: 50000, estimated: false });
    expect(annualizedSalary({ annual_base_salary: null, hourly_rate: 20, hours_per_week: 30 }).amount).toBe(31200);
    expect(annualizedSalary({ annual_base_salary: null, hourly_rate: 20, hours_per_week: null }, 35).amount).toBe(36400);
    expect(annualizedSalary({ annual_base_salary: null, hourly_rate: 20, hours_per_week: null })).toEqual({ amount: 41600, estimated: true });
    expect(annualizedSalary({ annual_base_salary: null, hourly_rate: null, hours_per_week: null }).amount).toBeNull();
  });

  it('infers pay basis from declared basis or amounts', () => {
    expect(inferPayBasis({ pay_basis: 'Hourly', annual_base_salary: null, hourly_rate: null })).toBe('hourly');
    expect(inferPayBasis({ pay_basis: 'Salary', annual_base_salary: null, hourly_rate: null })).toBe('annual');
    expect(inferPayBasis({ annual_base_salary: null, hourly_rate: 18 })).toBe('hourly');
    expect(inferPayBasis({ annual_base_salary: 37440, hourly_rate: 18 })).toBe('hourly');
    expect(inferPayBasis({ annual_base_salary: 90000, hourly_rate: null })).toBe('annual');
    expect(inferPayBasis({ annual_base_salary: null, hourly_rate: null })).toBeNull();
  });

  it('computes raise percent against the previous row', () => {
    const before = { annual_base_salary: 100000, hourly_rate: null, hours_per_week: null } as StoredSalaryRow;
    const after = { annual_base_salary: 110000, hourly_rate: null, hours_per_week: null } as StoredSalaryRow;
    expect(raisePercent(after, before)).toBe(10);
    expect(raisePercent(after, undefined)).toBeNull();
  });
});

function row(partial: Partial<StoredSalaryRow>): StoredSalaryRow {
  return {
    person_key: 'k', employee_id: 'e1', en_name: '', salary_type: '', effective_date: null, pay_basis: 'annual',
    annual_base_salary: null, hourly_rate: null, hours_per_week: null, annual_benefit_salary: null, change_reason: '',
    ...partial,
  };
}

describe('currentSalaryRow / summarizeEmployeeSalary', () => {
  it('prefers EN "Current", else latest row effective by today (ignores scheduled raises)', () => {
    const rows = [
      row({ salary_type: 'Past', effective_date: '2023-01-01', annual_base_salary: 1 }),
      row({ salary_type: 'Scheduled', effective_date: '2099-01-01', annual_base_salary: 3 }),
      row({ salary_type: 'Past', effective_date: '2025-01-01', annual_base_salary: 2 }),
    ];
    expect(currentSalaryRow(rows, '2026-11-06')?.annual_base_salary).toBe(2);
    rows.push(row({ salary_type: 'Current', effective_date: '2024-01-01', annual_base_salary: 9 }));
    expect(currentSalaryRow(rows, '2026-11-06')?.annual_base_salary).toBe(9);
  });

  it('only counts this employee and extras from the last 12 months', () => {
    const extras: CompensationExtra[] = [
      { id: 'a', employee_id: 'e1', comp_type: 'bonus', amount: 1000, effective_date: '2026-06-01', note: null },
      { id: 'b', employee_id: 'e1', comp_type: 'other', amount: 500, effective_date: '2025-06-01', note: null },
      { id: 'c', employee_id: 'e2', comp_type: 'bonus', amount: 9999, effective_date: '2026-06-01', note: null },
    ];
    const summary = summarizeEmployeeSalary({
      employeeId: 'e1',
      history: [
        row({ salary_type: 'Current', effective_date: '2025-03-01', annual_base_salary: 110000 }),
        row({ employee_id: 'e2', salary_type: 'Current', annual_base_salary: 1 }),
      ],
      extras,
      todayIso: '2026-11-06',
    });
    expect(summary.annualized).toBe(110000);
    expect(summary.history).toHaveLength(1);
    expect(summary.extras.map((extra) => extra.id)).toEqual(['a', 'b']);
    expect(summary.extrasLast12Months).toBe(1000);
    expect(summary.lastChange).toBe('2025-03-01');
  });
});
