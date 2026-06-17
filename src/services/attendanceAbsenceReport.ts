import { employeeMatchesAttendanceScope } from './access';
import type { EmployeeLike } from './accessTypes';
import { normalizePeopleList, type AttendancePerson } from './attendance';
import { employeeDisplayName } from './employeeUtils';
import { supabaseClient } from './supabaseClient';

export const ATTENDANCE_LOOKBACK_DAYS = 28;
export const ATTENDANCE_REPEAT_ABSENCE_MIN = 2;

export type AbsenceRollupRow = {
  employeeId: string;
  name: string;
  department: string;
  absenceCount: number;
  absenceDates: string[];
};

type EmployeeRow = Record<string, unknown>;

function isoDateDaysAgo(days: number, fromDate = new Date()): string {
  const date = new Date(fromDate);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function personRollupKey(person: AttendancePerson): string {
  const id = String(person.employeeId || '')
    .trim()
    .toLowerCase();
  if (id && id !== '—') return `id:${id}`;
  return `name:${String(person.name || '')
    .trim()
    .toLowerCase()}`;
}

function employeeRollupKeys(employee: EmployeeRow): string[] {
  const keys = new Set<string>();
  [employee.id, employee.employee_id, employee.displayId, employee.dbId].forEach((value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized) keys.add(`id:${normalized}`);
  });

  const name = employeeDisplayName(employee).trim().toLowerCase();
  if (name) keys.add(`name:${name}`);

  return Array.from(keys);
}

function resolveEmployeeFromKeys(
  keys: string[],
  roster: EmployeeRow[]
): EmployeeRow | undefined {
  for (const employee of roster) {
    const employeeKeys = employeeRollupKeys(employee);
    if (employeeKeys.some((key) => keys.includes(key))) {
      return employee;
    }
  }
  return undefined;
}

function employeeInScope(employee: EmployeeRow | undefined, _roster: EmployeeRow[]): boolean {
  if (!employee) return false;
  return employeeMatchesAttendanceScope(employee as EmployeeLike);
}

export async function loadRepeatedAbsenceReport(options?: {
  lookbackDays?: number;
  minAbsences?: number;
  endDate?: string;
  roster?: EmployeeRow[];
}): Promise<AbsenceRollupRow[]> {
  const lookbackDays = options?.lookbackDays ?? ATTENDANCE_LOOKBACK_DAYS;
  const minAbsences = options?.minAbsences ?? ATTENDANCE_REPEAT_ABSENCE_MIN;
  const endDate = String(options?.endDate || new Date().toISOString().slice(0, 10)).trim();
  const startDate = isoDateDaysAgo(lookbackDays - 1, new Date(`${endDate}T12:00:00`));

  const { data, error } = await supabaseClient.rpc('orbis_list_attendance_snapshots', {
    p_from: startDate,
    p_to: endDate,
  });

  if (error) {
    throw new Error(error.message || 'Could not load attendance history.');
  }

  const roster = options?.roster || [];
  const byEmployee = new Map<
    string,
    {
      employeeId: string;
      name: string;
      department: string;
      keys: Set<string>;
      dates: Set<string>;
    }
  >();

  (data || []).forEach((row) => {
    const date = String((row as { attendance_date?: string }).attendance_date || '').slice(0, 10);
    if (!date) return;

    const absent = normalizePeopleList((row as { absent?: unknown }).absent);
    absent.forEach((person) => {
      const key = personRollupKey(person);
      const existing = byEmployee.get(key);
      const keys = new Set<string>([key]);
      const id = String(person.employeeId || '').trim();
      if (id && id !== '—') keys.add(`id:${id.toLowerCase()}`);

      const nameKey = String(person.name || '')
        .trim()
        .toLowerCase();
      if (nameKey) keys.add(`name:${nameKey}`);

      if (existing) {
        existing.dates.add(date);
        keys.forEach((value) => existing.keys.add(value));
        return;
      }

      const matched = resolveEmployeeFromKeys(Array.from(keys), roster);
      if (!employeeInScope(matched, roster)) return;

      const employeeId =
        String(
          matched?.id || matched?.employee_id || matched?.displayId || person.employeeId || ''
        ).trim() || person.employeeId || '—';

      byEmployee.set(key, {
        employeeId,
        name: matched ? employeeDisplayName(matched) : person.name,
        department: String(
          matched?.department || matched?.dept || person.department || ''
        ).trim(),
        keys,
        dates: new Set([date]),
      });
    });
  });

  return [...byEmployee.values()]
    .map((row) => ({
      employeeId: row.employeeId,
      name: row.name,
      department: row.department,
      absenceCount: row.dates.size,
      absenceDates: [...row.dates].sort((left, right) => right.localeCompare(left)),
    }))
    .filter((row) => row.absenceCount >= minAbsences)
    .sort((left, right) => {
      if (right.absenceCount !== left.absenceCount) {
        return right.absenceCount - left.absenceCount;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });
}
