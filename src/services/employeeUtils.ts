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
  [key: string]: unknown;
};

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

export function isContractEmployee(employee: EmployeeLike | null | undefined): boolean {
  return String(employee?.pay_type || employee?.payType || '')
    .trim()
    .toLowerCase()
    .includes('contract');
}

/** Active roster employees who receive stay interview scheduling (excludes contract). */
export function isStayInterviewEligibleEmployee(
  employee: EmployeeLike | null | undefined
): boolean {
  return isActiveDashboardEmployee(employee) && !isContractEmployee(employee);
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

declare global {
  interface Window {
    cleanEmployeeNameValue?: (value: unknown) => string;
    employeeDisplayName?: (
      employee: EmployeeLike | null | undefined
    ) => string;
    isActiveDashboardEmployee?: (
      employee: EmployeeLike | null | undefined
    ) => boolean;
    daysUntilDate?: (
      dateValue: unknown
    ) => number | null;
  }
}

window.cleanEmployeeNameValue =
  cleanEmployeeNameValue;

window.employeeDisplayName =
  employeeDisplayName;

window.isActiveDashboardEmployee =
  isActiveDashboardEmployee;

window.daysUntilDate =
  daysUntilDate;
