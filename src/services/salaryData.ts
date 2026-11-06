/**
 * Matthew-only Salary page: parse the combined Employee Navigator compensation CSV
 * ("Orbis Salary Import") and shape stored rows for display. Pure functions only.
 *
 * Expected columns (EN's per-employee Compensation CSV columns, plus who it is):
 *   First Name, Last Name, Hire Date, [Employment Status], Salary Type, Effective Date,
 *   [Pay Basis], Annual Base Salary, Hourly Rate, Hours Per Week, Annual Benefit Salary,
 *   Change Reason
 * Any SSN or email column is ignored.
 */
import {
  enPersonKey,
  parseCsvRows,
  parseMoney,
  toIsoDate,
  type EnPerson,
} from './employeeNavigatorBenefits';

export type PayBasis = 'annual' | 'hourly';

export type SalaryHistoryRow = {
  person_key: string;
  en_name: string;
  salary_type: string;
  effective_date: string | null;
  pay_basis: PayBasis | null;
  annual_base_salary: number | null;
  hourly_rate: number | null;
  hours_per_week: number | null;
  annual_benefit_salary: number | null;
  change_reason: string;
};

export type SalaryImportParseResult = {
  people: EnPerson[];
  history: SalaryHistoryRow[];
  rowCount: number;
  warnings: string[];
};

export const SALARY_REQUIRED_COLUMNS = [
  'First Name', 'Last Name', 'Hire Date', 'Effective Date', 'Annual Base Salary', 'Hourly Rate',
] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  first: ['first name'],
  last: ['last name'],
  hire: ['hire date'],
  status: ['employment status', 'employee status', 'status'],
  type: ['salary type', 'type'],
  effective: ['effective date', 'compensation effective date'],
  basis: ['pay basis'],
  annual: ['annual base salary', 'annual compensation'],
  hourly: ['hourly rate'],
  hours: ['hours per week'],
  benefit: ['annual benefit salary', 'benefit salary'],
  reason: ['change reason'],
};

function normalizeHeader(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseNumber(value: unknown): number | null {
  const raw = String(value ?? '').replace(/[,\s]/g, '');
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

export function inferPayBasis(input: {
  pay_basis?: string | null;
  annual_base_salary: number | null;
  hourly_rate: number | null;
}): PayBasis | null {
  const declared = String(input.pay_basis || '').trim().toLowerCase();
  if (declared.startsWith('hour')) return 'hourly';
  if (declared.startsWith('annual') || declared.startsWith('salar')) return 'annual';
  // EN fills both for hourly staff (annual = rate × hours × 52), so a rate means hourly.
  if (input.hourly_rate) return 'hourly';
  if (input.annual_base_salary) return 'annual';
  return null;
}

export function parseSalaryImport(text: string): SalaryImportParseResult {
  const rows = parseCsvRows(text);
  const warnings: string[] = [];
  if (rows.length < 2) {
    throw new Error('This file has no data rows.');
  }

  const headers = rows[0].map(normalizeHeader);
  const column = (key: string): number => {
    const aliases = COLUMN_ALIASES[key] || [];
    return headers.findIndex((header) => aliases.includes(header));
  };
  const idx = Object.fromEntries(Object.keys(COLUMN_ALIASES).map((key) => [key, column(key)]));
  const requiredKeys = ['first', 'last', 'hire', 'effective', 'annual', 'hourly'];
  const missing = SALARY_REQUIRED_COLUMNS.filter((_, i) => idx[requiredKeys[i]] < 0);
  if (missing.length) {
    throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }

  const cell = (cells: string[], key: string): string =>
    idx[key] >= 0 ? String(cells[idx[key]] ?? '').trim() : '';

  const people = new Map<string, EnPerson>();
  const history: SalaryHistoryRow[] = [];
  let skipped = 0;

  for (const cells of rows.slice(1)) {
    const first = cell(cells, 'first');
    const last = cell(cells, 'last');
    if (!first && !last) {
      skipped += 1;
      continue;
    }
    const hireDate = toIsoDate(cell(cells, 'hire'));
    const key = enPersonKey(first, last, hireDate);
    if (!people.has(key)) {
      people.set(key, {
        person_key: key,
        first_name: first,
        last_name: last,
        preferred_name: '',
        employment_status: cell(cells, 'status') || 'Active',
        hire_date: hireDate,
        emails: [],
        enrollments: [],
        dependents: [],
      });
    }

    const annual = parseMoney(cell(cells, 'annual'));
    const hourly = parseMoney(cell(cells, 'hourly'));
    const effective = toIsoDate(cell(cells, 'effective'));
    // EN "Benefit" rows (benefit-salary overrides for insurance) and blank rows carry
    // no pay amount: they are not pay history.
    if (annual === null && hourly === null) continue;

    history.push({
      person_key: key,
      en_name: `${first} ${last}`.trim(),
      salary_type: cell(cells, 'type'),
      effective_date: effective,
      pay_basis: inferPayBasis({ pay_basis: cell(cells, 'basis'), annual_base_salary: annual, hourly_rate: hourly }),
      annual_base_salary: annual,
      hourly_rate: hourly,
      hours_per_week: parseNumber(cell(cells, 'hours')),
      annual_benefit_salary: parseMoney(cell(cells, 'benefit')),
      change_reason: cell(cells, 'reason'),
    });
  }

  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} without a name were skipped.`);
  const withoutSalary = [...people.keys()].filter((key) => !history.some((row) => row.person_key === key));
  if (withoutSalary.length) {
    warnings.push(`${withoutSalary.length} employee${withoutSalary.length === 1 ? ' has' : 's have'} no salary rows in Employee Navigator.`);
  }

  return { people: [...people.values()], history, rowCount: rows.length - 1, warnings };
}

/* --------------------------------------------------------------- Display */

export type StoredSalaryRow = SalaryHistoryRow & { id?: string; employee_id: string | null };

export type CompensationExtra = {
  id: string;
  employee_id: string;
  comp_type: 'bonus' | 'commission' | 'other';
  amount: number;
  effective_date: string | null;
  note: string | null;
};

export const COMP_TYPE_LABELS: Record<CompensationExtra['comp_type'], string> = {
  bonus: 'Bonus',
  commission: 'Commission',
  other: 'Other',
};

const WEEKS_PER_YEAR = 52;
const DEFAULT_HOURS_PER_WEEK = 40;

/** Annual amount for a salary row; hourly rows are rate × hours/week × 52. */
export function annualizedSalary(
  row: Pick<SalaryHistoryRow, 'annual_base_salary' | 'hourly_rate' | 'hours_per_week'>,
  fallbackHoursPerWeek: number | null = null
): { amount: number | null; estimated: boolean } {
  if (row.annual_base_salary) return { amount: row.annual_base_salary, estimated: false };
  if (row.hourly_rate) {
    const hours = row.hours_per_week || fallbackHoursPerWeek || DEFAULT_HOURS_PER_WEEK;
    return { amount: Math.round(row.hourly_rate * hours * WEEKS_PER_YEAR * 100) / 100, estimated: true };
  }
  return { amount: null, estimated: false };
}

function byEffectiveDesc(a: SalaryHistoryRow, b: SalaryHistoryRow): number {
  return String(b.effective_date || '').localeCompare(String(a.effective_date || ''));
}

/**
 * EN's page marks one row "Current" (its CSV says "Base"); otherwise the latest row
 * with a pay amount that is effective on or before today.
 */
export function currentSalaryRow<T extends SalaryHistoryRow>(rows: T[], todayIso: string): T | null {
  const sorted = rows.filter((row) => row.annual_base_salary || row.hourly_rate).sort(byEffectiveDesc);
  return (
    sorted.find((row) => /^current$/i.test(row.salary_type)) ||
    sorted.find((row) => !row.effective_date || row.effective_date <= todayIso) ||
    null
  );
}

export type EmployeeSalarySummary = {
  employee_id: string;
  current: StoredSalaryRow | null;
  annualized: number | null;
  estimated: boolean;
  history: StoredSalaryRow[];
  extras: CompensationExtra[];
  /** Bonus + commission + other dated in the last 12 months. */
  extrasLast12Months: number;
  lastChange: string | null;
};

export function summarizeEmployeeSalary(input: {
  employeeId: string;
  history: StoredSalaryRow[];
  extras: CompensationExtra[];
  todayIso: string;
  standardHours?: number | null;
}): EmployeeSalarySummary {
  const history = input.history.filter((row) => row.employee_id === input.employeeId).sort(byEffectiveDesc);
  const extras = input.extras
    .filter((extra) => extra.employee_id === input.employeeId)
    .sort((a, b) => String(b.effective_date || '').localeCompare(String(a.effective_date || '')));
  const current = currentSalaryRow(history, input.todayIso);
  const { amount, estimated } = current
    ? annualizedSalary(current, input.standardHours ?? null)
    : { amount: null, estimated: false };

  const yearAgo = new Date(`${input.todayIso}T00:00:00Z`);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const yearAgoIso = yearAgo.toISOString().slice(0, 10);
  const extrasLast12Months = extras
    .filter((extra) => extra.effective_date && extra.effective_date > yearAgoIso && extra.effective_date <= input.todayIso)
    .reduce((sum, extra) => sum + Number(extra.amount || 0), 0);

  return {
    employee_id: input.employeeId,
    current,
    annualized: amount,
    estimated,
    history,
    extras,
    extrasLast12Months,
    lastChange: current?.effective_date || null,
  };
}

/** Percent change from the previous row's annualized pay, e.g. 10 for a 10% raise. */
export function raisePercent(
  row: SalaryHistoryRow,
  previous: SalaryHistoryRow | undefined,
  fallbackHoursPerWeek: number | null = null
): number | null {
  if (!previous) return null;
  const now = annualizedSalary(row, fallbackHoursPerWeek).amount;
  const before = annualizedSalary(previous, fallbackHoursPerWeek).amount;
  if (!now || !before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}
