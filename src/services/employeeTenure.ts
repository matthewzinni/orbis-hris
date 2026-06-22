export type TenureEmployee = {
  hire_date?: string;
  hireDate?: string;
  tenure_months?: number | string | null;
  tenureMonths?: number | string | null;
  tenure_years?: number | string | null;
  tenureYears?: number | string | null;
};

function parseHireDate(employee: TenureEmployee | null | undefined): Date | null {
  const raw = String(employee?.hire_date || employee?.hireDate || '').trim();
  if (!raw) return null;

  const date = new Date(`${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readStoredTenureMonths(employee: TenureEmployee | null | undefined): number {
  const raw = employee?.tenureMonths ?? employee?.tenure_months;
  if (raw === null || raw === undefined || raw === '') return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function readStoredTenureYears(employee: TenureEmployee | null | undefined): number {
  const raw = employee?.tenureYears ?? employee?.tenure_years;
  if (raw === null || raw === undefined || raw === '') return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function computeTenureMonthsFromHire(hiredAt: Date, referenceDate: Date): number {
  let months =
    (referenceDate.getFullYear() - hiredAt.getFullYear()) * 12 +
    (referenceDate.getMonth() - hiredAt.getMonth());

  if (referenceDate.getDate() < hiredAt.getDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

function computeTenureYearsFromHire(hiredAt: Date, referenceDate: Date): number {
  let years = referenceDate.getFullYear() - hiredAt.getFullYear();
  const anniversaryPassed =
    referenceDate.getMonth() > hiredAt.getMonth() ||
    (referenceDate.getMonth() === hiredAt.getMonth() &&
      referenceDate.getDate() >= hiredAt.getDate());

  if (!anniversaryPassed) {
    years -= 1;
  }

  return Math.max(0, years);
}

/** Whole months since hire date (day-adjusted), falling back to stored tenure. */
export function getEmployeeTenureMonths(
  employee: TenureEmployee | null | undefined,
  referenceDate: Date = new Date()
): number {
  const hiredAt = parseHireDate(employee);
  if (hiredAt) {
    return computeTenureMonthsFromHire(hiredAt, referenceDate);
  }

  return readStoredTenureMonths(employee);
}

/** Whole years since hire date, falling back to stored tenure. */
export function getEmployeeTenureYears(
  employee: TenureEmployee | null | undefined,
  referenceDate: Date = new Date()
): number {
  const hiredAt = parseHireDate(employee);
  if (hiredAt) {
    return computeTenureYearsFromHire(hiredAt, referenceDate);
  }

  const storedYears = readStoredTenureYears(employee);
  if (storedYears > 0) return storedYears;

  const storedMonths = readStoredTenureMonths(employee);
  return storedMonths > 0 ? Math.floor(storedMonths / 12) : 0;
}

export function resolveEmployeeTenureFields(
  employee: TenureEmployee | null | undefined,
  referenceDate: Date = new Date()
): { tenure_months: number; tenure_years: number } {
  return {
    tenure_months: getEmployeeTenureMonths(employee, referenceDate),
    tenure_years: getEmployeeTenureYears(employee, referenceDate),
  };
}

export function formatEmployeeTenureMonths(
  employee: TenureEmployee | null | undefined,
  referenceDate: Date = new Date()
): string {
  const months = getEmployeeTenureMonths(employee, referenceDate);
  return months > 0 ? String(months) : '';
}

export function formatEmployeeTenureYears(
  employee: TenureEmployee | null | undefined,
  referenceDate: Date = new Date()
): string {
  const years = getEmployeeTenureYears(employee, referenceDate);
  return years > 0 ? String(years) : '';
}
