/**
 * Overseas / remote employee detection (excluded from Attendance roll call).
 * Primary source: employees.is_remote (set in employee drawer).
 * Fallback: legacy numeric ids until all records are updated in admin.
 */
export const REMOTE_EMPLOYEE_NUMBERS = [
  '2610',
  '2401',
  '2404',
  '1801',
  '2301',
  '2403',
  '2606',
] as const;

const REMOTE_NUMBER_SET = new Set<string>(REMOTE_EMPLOYEE_NUMBERS);

export type RemoteCheckable = {
  employee_id?: string;
  id?: string;
  displayId?: string;
  dbId?: string;
  is_remote?: boolean | string | number | null;
};

export function rosterIdFromEmployee(employee: RemoteCheckable): string {
  return String(
    employee.employee_id || employee.displayId || employee.id || employee.dbId || ''
  ).trim();
}

/** Normalize BTW2401, 2401, etc. to the numeric employee number. */
export function getEmployeeNumberKey(id: string): string {
  const raw = String(id || '').trim().toUpperCase();
  if (!raw) return '';

  if (/^BTW\d+$/i.test(raw)) {
    return raw.replace(/^BTW/i, '');
  }

  if (/^\d+$/.test(raw)) {
    return raw;
  }

  const suffix = raw.match(/(\d{3,})$/);
  return suffix ? suffix[1] : raw;
}

export function isRemoteEmployeeId(employeeId: string): boolean {
  const key = getEmployeeNumberKey(employeeId);
  return Boolean(key) && REMOTE_NUMBER_SET.has(key);
}

function isTruthyRemoteFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function isRemoteEmployee(
  employee: RemoteCheckable | string | null | undefined
): boolean {
  if (!employee) return false;
  if (typeof employee === 'string') {
    return isRemoteEmployeeId(employee);
  }
  if (isTruthyRemoteFlag(employee.is_remote)) {
    return true;
  }
  return isRemoteEmployeeId(rosterIdFromEmployee(employee));
}
