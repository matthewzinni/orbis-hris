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

export function daysUntilDate(dateValue: unknown): number | null {
  if (!dateValue) return null;

  const date = new Date(`${String(dateValue)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
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
