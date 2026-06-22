import { isRemoteEmployee } from './attendanceRemoteEmployees';
import { isContractEmployee } from './attendanceRollCallSections';

export {
  ATTENDANCE_ROLL_CALL_SECTIONS,
  getAttendanceRollCallSection,
  isContractEmployee,
  type AttendanceRollCallSection,
} from './attendanceRollCallSections';
export {
  formatEmployeeTenureMonths,
  formatEmployeeTenureYears,
  getEmployeeTenureMonths,
  getEmployeeTenureYears,
  resolveEmployeeTenureFields,
  type TenureEmployee,
} from './employeeTenure';

export type EmployeeLike = {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  first?: string;
  last?: string;
  first_name?: string;
  last_name?: string;
  displayName?: string;
  status?: string;
  displayStatus?: string;
  pay_type?: string;
  payType?: string;
  work_email?: string;
  workEmail?: string;
  personal_email?: string;
  personalEmail?: string;
  email?: string;
  [key: string]: unknown;
};

/** Leadership excluded from in-house FTE insurance headcount (owners). */
export const IN_HOUSE_FTE_EXCLUDED_EMPLOYEE_IDS = ['BTW1601', 'BTW1602'] as const;

/** Group health plans often change rates at 50+ FTE (ACA / carrier tiers). */
export const IN_HOUSE_FTE_INSURANCE_THRESHOLD = 50;

export function cleanEmployeeNameValue(value: unknown): string {
  return String(value || '')
    .replace(/\bAt[-\s]*Risk\b/gi, '')
    .replace(/\bImpact\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function employeeDisplayName(employee: EmployeeLike | null | undefined): string {
  if (!employee) return 'Employee';

  const displayName = cleanEmployeeNameValue(employee.displayName || '');

  if (displayName) return displayName;

  const first = cleanEmployeeNameValue(employee.first || employee.first_name || '');
  const last = cleanEmployeeNameValue(employee.last || employee.last_name || '');

  return `${first} ${last}`.trim() || 'Employee';
}

/** Email used for employee PTO portal account linking (personal preferred for hourly staff). */
export function employeePortalSignInEmail(employee: EmployeeLike | null | undefined): string {
  if (!employee) return '';
  const personal = String(employee.personal_email || employee.personalEmail || '').trim();
  const work = String(employee.work_email || employee.workEmail || '').trim();
  const legacy = String(employee.email || '').trim();
  return personal || work || legacy;
}

export function employeeWorkEmail(employee: EmployeeLike | null | undefined): string {
  if (!employee) return '';
  return String(employee.work_email || employee.workEmail || '').trim();
}

export function employeePersonalEmail(employee: EmployeeLike | null | undefined): string {
  if (!employee) return '';
  return String(employee.personal_email || employee.personalEmail || '').trim();
}

/** Sort key for roster lists (last name, then first name). */
export function employeeLastNameSortKey(employee: EmployeeLike | null | undefined): string {
  if (!employee) return '';

  const last = cleanEmployeeNameValue(employee.last || employee.last_name || '');
  const first = cleanEmployeeNameValue(employee.first || employee.first_name || '');

  if (last) {
    return `${last}\u0000${first}`.toLowerCase();
  }

  const displayName = cleanEmployeeNameValue(employee.displayName || '');
  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    const inferredLast = parts.length > 1 ? parts[parts.length - 1] : displayName;
    const inferredFirst = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    return `${inferredLast}\u0000${inferredFirst}`.toLowerCase();
  }

  return first.toLowerCase();
}

export function compareEmployeesByLastName(
  left: EmployeeLike | null | undefined,
  right: EmployeeLike | null | undefined
): number {
  const nameCompare = employeeLastNameSortKey(left).localeCompare(
    employeeLastNameSortKey(right),
    undefined,
    { sensitivity: 'base' }
  );

  if (nameCompare !== 0) {
    return nameCompare;
  }

  const leftId = String(
    left?.displayId || left?.employee_id || left?.id || ''
  ).trim();
  const rightId = String(
    right?.displayId || right?.employee_id || right?.id || ''
  ).trim();

  return leftId.localeCompare(rightId, undefined, { sensitivity: 'base' });
}

export function isActiveDashboardEmployee(employee: EmployeeLike | null | undefined): boolean {
  const status = String(employee?.status || employee?.displayStatus || '')
    .trim()
    .toUpperCase();

  if (status === 'TERMINATED') {
    const terminationDate = String(
      (employee as { termination_date?: string; terminationDate?: string })?.termination_date
      || (employee as { terminationDate?: string })?.terminationDate
      || ''
    ).trim();

    return !terminationDate;
  }

  return status !== 'INACTIVE' && status !== 'ARCHIVED';
}

export const STAY_INTERVIEW_DUE_SOON_DAYS = 14;

/** Company policy: benefits eligibility begins 90 calendar days after hire date. */
export const BENEFITS_ELIGIBILITY_WAIT_DAYS = 90;

export function readEmployeeHireDateRaw(employee: EmployeeLike | null | undefined): string {
  return String(
    employee?.hire_date || employee?.hireDate || employee?.displayHireDate || ''
  ).trim();
}

export function getBenefitsEligibilityDate(
  employee: EmployeeLike | null | undefined
): Date | null {
  const hireDate = parseDueDate(readEmployeeHireDateRaw(employee));
  if (!hireDate) return null;

  const eligible = new Date(hireDate);
  eligible.setDate(eligible.getDate() + BENEFITS_ELIGIBILITY_WAIT_DAYS);
  return eligible;
}

export function getBenefitsEligibilityDateIso(
  employee: EmployeeLike | null | undefined
): string | null {
  const eligibleDate = getBenefitsEligibilityDate(employee);
  return eligibleDate ? eligibleDate.toISOString().slice(0, 10) : null;
}

/** Status value written when the 90-day wait is satisfied. */
export const AUTO_BENEFITS_ELIGIBLE_STATUS = 'Eligible';

export function daysUntilBenefitsEligible(
  employee: EmployeeLike | null | undefined
): number | null {
  const eligibleDate = getBenefitsEligibilityDate(employee);
  if (!eligibleDate) return null;
  return daysUntilDate(eligibleDate);
}

export function isBenefitsEligibleEmployee(
  employee: EmployeeLike | null | undefined
): boolean {
  const days = daysUntilBenefitsEligible(employee);
  return days !== null && days <= 0;
}

export function formatBenefitsEligibilitySummary(
  employee: EmployeeLike | null | undefined
): string {
  if (!readEmployeeHireDateRaw(employee)) {
    return 'Add a hire date to calculate benefits eligibility.';
  }

  const eligibleDate = getBenefitsEligibilityDate(employee);
  if (!eligibleDate) return 'Hire date is invalid — cannot calculate benefits eligibility.';

  const days = daysUntilBenefitsEligible(employee);
  if (days === null) return '';

  const dateLabel = formatDueDateLabel(eligibleDate, '');

  if (days <= 0) {
    return `Eligible for benefits since ${dateLabel} (${BENEFITS_ELIGIBILITY_WAIT_DAYS} days after hire).`;
  }

  return `Eligible for benefits on ${dateLabel} (in ${days} day${days === 1 ? '' : 's'}).`;
}

/** Active roster employees who receive stay interview scheduling (excludes contract). */
export function isStayInterviewEligibleEmployee(
  employee: EmployeeLike | null | undefined
): boolean {
  return isActiveDashboardEmployee(employee) && !isContractEmployee(employee);
}

export function isPartTimeEmployee(employee: EmployeeLike | null | undefined): boolean {
  const payType = String(employee?.pay_type || employee?.payType || '')
    .trim()
    .toLowerCase();
  return payType.includes('part');
}

export function isLeadershipExcludedFromInHouseFte(
  employee: EmployeeLike | null | undefined
): boolean {
  if (!employee) return false;

  const rosterId = String(employee.id || employee.employee_id || employee.displayId || '')
    .trim()
    .toUpperCase();

  if (
    IN_HOUSE_FTE_EXCLUDED_EMPLOYEE_IDS.some(
      (excludedId) => excludedId.toUpperCase() === rosterId
    )
  ) {
    return true;
  }

  const name = employeeDisplayName(employee).trim().toLowerCase();
  return name === 'trent wynne' || name === 'brent wynne';
}

/**
 * Active in-house full-time employees for insurance / scalability tracking.
 * Excludes contract, part-time, overseas/remote, and Brent/Trent Wynne.
 */
export function isInHouseFteEmployee(employee: EmployeeLike | null | undefined): boolean {
  if (!isActiveDashboardEmployee(employee)) return false;
  if (isContractEmployee(employee)) return false;
  if (isPartTimeEmployee(employee)) return false;
  if (isRemoteEmployee(employee)) return false;
  if (isLeadershipExcludedFromInHouseFte(employee)) return false;
  return true;
}

export function countInHouseFteEmployees(employees: EmployeeLike[]): number {
  if (!Array.isArray(employees)) return 0;
  return employees.filter(isInHouseFteEmployee).length;
}

export function inHouseFteInsuranceHeadline(count: number): string {
  if (count >= IN_HOUSE_FTE_INSURANCE_THRESHOLD) {
    return `At or above ${IN_HOUSE_FTE_INSURANCE_THRESHOLD} FTE — review insurance tier`;
  }
  const remaining = IN_HOUSE_FTE_INSURANCE_THRESHOLD - count;
  return `${remaining} until ${IN_HOUSE_FTE_INSURANCE_THRESHOLD} FTE insurance threshold`;
}

/** Matches roll call / stay interview dashboard: due date before today. */
export function isStayInterviewOverdue(employee: EmployeeLike | null | undefined): boolean {
  const days = daysUntilDate(readEmployeeNextStayInterviewDateRaw(employee));
  return days !== null && days < 0;
}

export function isStayInterviewDueSoon(employee: EmployeeLike | null | undefined): boolean {
  const days = daysUntilDate(readEmployeeNextStayInterviewDateRaw(employee));
  return days !== null && days >= 0 && days <= STAY_INTERVIEW_DUE_SOON_DAYS;
}

export function daysUntilDate(dateValue: unknown): number | null {
  if (!dateValue) return null;

  const date = parseDueDate(dateValue);

  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

/** Calendar date at local midnight, or null when invalid. */
export function parseDueDate(dateValue: unknown): Date | null {
  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    const copy = new Date(dateValue);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  if (!dateValue) return null;

  const parsed = new Date(`${String(dateValue).trim()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDueDateLabel(
  date: Date | null,
  rawFallback = ''
): string {
  if (date) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return String(rawFallback || '').trim();
}

export function readEmployeeNextStayInterviewDateRaw(
  employee: EmployeeLike | null | undefined
): string {
  if (!employee) return '';

  const record = employee as {
    nextReview?: string | Date | null;
    next_review_date?: string;
    nextReviewDate?: string | Date;
  };

  if (record.nextReview instanceof Date && !Number.isNaN(record.nextReview.getTime())) {
    return record.nextReview.toISOString().slice(0, 10);
  }

  return String(
    record.nextReview ||
      record.next_review_date ||
      record.nextReviewDate ||
      ''
  ).trim();
}

export function getEmployeeNextStayInterviewDueDate(
  employee: EmployeeLike | null | undefined
): Date | null {
  return parseDueDate(readEmployeeNextStayInterviewDateRaw(employee));
}

/** Earliest due date first (most overdue at top). Missing dates sort last. */
export function compareByDueDateAsc(
  leftDate: unknown,
  rightDate: unknown
): number {
  const leftKey = parseDueDate(leftDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightKey = parseDueDate(rightDate)?.getTime() ?? Number.POSITIVE_INFINITY;

  return leftKey - rightKey;
}

export function compareEmployeesByDueDateAsc(
  left: EmployeeLike | null | undefined,
  right: EmployeeLike | null | undefined,
  readDueDate: (
    employee: EmployeeLike | null | undefined
  ) => Date | null = getEmployeeNextStayInterviewDueDate
): number {
  const leftKey = readDueDate(left)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightKey = readDueDate(right)?.getTime() ?? Number.POSITIVE_INFINITY;

  if (leftKey !== rightKey) {
    return leftKey - rightKey;
  }

  return compareEmployeesByLastName(left, right);
}

export function formatEmployeeDueDateLine(
  employee: EmployeeLike | null | undefined,
  readDueDate: (
    employee: EmployeeLike | null | undefined
  ) => Date | null = getEmployeeNextStayInterviewDueDate,
  readRawDate: (
    employee: EmployeeLike | null | undefined
  ) => string = readEmployeeNextStayInterviewDateRaw
): string {
  const name = employeeDisplayName(employee);
  const dueDate = readDueDate(employee);
  const label = formatDueDateLabel(dueDate, readRawDate(employee));

  return label ? `${name} • ${label}` : name;
}

window.cleanEmployeeNameValue =
  cleanEmployeeNameValue;

window.employeeDisplayName =
  employeeDisplayName;

window.isActiveDashboardEmployee =
  isActiveDashboardEmployee;

window.isInHouseFteEmployee = isInHouseFteEmployee;

window.countInHouseFteEmployees = countInHouseFteEmployees;

window.daysUntilDate =
  daysUntilDate;
