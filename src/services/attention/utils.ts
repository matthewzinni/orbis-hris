import { daysUntilDate, parseDueDate } from '../employeeUtils';

type RecordLike = Record<string, unknown>;

export function drawerEmployeeId(employee: RecordLike): string {
  return String(employee.id || employee.dbId || employee.employee_id || '').trim();
}

export function isoDateFromValue(value: unknown): string | null {
  const parsed = parseDueDate(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(value: unknown): number | null {
  return daysUntilDate(value);
}

export function evaluationTimestamp(): string {
  return new Date().toISOString();
}
