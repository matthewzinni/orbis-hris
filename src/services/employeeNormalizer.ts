import { cleanEmployeeNameValue } from './employeeUtils';

export type NormalizableEmployee = {
  id?: string;
  dbId?: string;
  employee_id?: string;

  first?: string;
  last?: string;
  first_name?: string;
  last_name?: string;

  name?: string;
  displayName?: string;
  full_name?: string;
  fullName?: string;

  dept?: string;
  department?: string;

  position?: string;
  supervisor?: string;

  status?: string;
  displayStatus?: string;

  payType?: string;
  pay_type?: string;

  hireDate?: string | Date | null;
  hire_date?: string;

  nextReview?: string | Date | null;
  nextReviewDate?: string;
  next_review_date?: string;

  tenureMonths?: number | string;
  tenure_months?: number | string;

  benefitsStatus?: string;
  benefits_status?: string;

  [key: string]: unknown;
};

export type NormalizedEmployee = NormalizableEmployee & {
  id: string;
  dbId: string;
  employee_id: string;

  first: string;
  last: string;

  first_name: string;
  last_name: string;

  displayName: string;

  dept: string;
  department: string;

  position: string;
  supervisor: string;

  status: string;
  displayStatus: string;

  payType: string;
  pay_type: string;

  hireDate: Date | null;
  hire_date: string;

  nextReview: Date | null;
  next_review_date: string;

  tenureMonths: number;
  tenure_months: number;

  benefitsStatus: string;
  benefits_status: string;
};

function parseLocalDate(value: unknown): Date | null {
  const raw = String(value || '').trim();

  if (!raw) return null;

  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeNumber(value: unknown): number {
  const numberValue = Number(value || 0);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function normalizeEmployee(
  employee: NormalizableEmployee | null | undefined
): NormalizedEmployee | null {
  if (!employee) return null;

  const first = cleanEmployeeNameValue(employee.first || employee.first_name || '');

  const last = cleanEmployeeNameValue(employee.last || employee.last_name || '');

  const combinedName = `${first} ${last}`.trim();

  const fallbackName = cleanEmployeeNameValue(
    String(
      employee.displayName
      || employee.name
      || employee.full_name
      || employee.fullName
      || ''
    )
  );

  const dept = String(employee.dept || employee.department || '');

  const status = String(employee.status || 'ACTIVE').toUpperCase();

  const hireDateRaw = String(employee.hire_date || employee.hireDate || '');

  const nextReviewRaw = String(
    employee.next_review_date || employee.nextReviewDate || employee.nextReview || ''
  );

  const hireDate = parseLocalDate(hireDateRaw);

  const nextReview = parseLocalDate(nextReviewRaw);

  return {
    ...employee,

    id: String(employee.id || employee.employee_id || ''),

    dbId: String(employee.id || ''),

    employee_id: String(employee.employee_id || employee.id || ''),

    first,
    last,

    first_name: first,
    last_name: last,

    displayName: combinedName || fallbackName,

    dept,
    department: dept,

    position: String(employee.position || ''),

    supervisor: String(employee.supervisor || ''),

    status,
    displayStatus: status,

    payType: String(employee.payType || employee.pay_type || ''),

    pay_type: String(employee.pay_type || employee.payType || ''),

    hireDate,
    hire_date: hireDateRaw,

    nextReview,
    next_review_date: nextReviewRaw,

    tenureMonths: normalizeNumber(employee.tenureMonths || employee.tenure_months),

    tenure_months: normalizeNumber(employee.tenure_months || employee.tenureMonths),

    benefitsStatus: String(employee.benefitsStatus || employee.benefits_status || ''),

    benefits_status: String(employee.benefits_status || employee.benefitsStatus || ''),
  };
}

window.normalizeEmployee = normalizeEmployee;
