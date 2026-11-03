import { getCurrentAuthEmail } from './accessScopes';
import {
  compareEmployeesByLastName,
  employeeDisplayName,
  isInHouseFteEmployee,
  parseDueDate,
  readEmployeeHireDateRaw,
  type EmployeeLike,
} from './employeeUtils';
import { supabaseClient } from './supabaseClient';

/** HR talks through insurance once an employee is past their first 30 days. */
export const INSURANCE_CHECKIN_AFTER_DAYS = 30;

export type InsuranceDiscussion = { discussedBy: string; discussedAt: string };

export type InsuranceCheckinRow = {
  employeeId: string;
  name: string;
  department: string;
  hireDate: string;
  daysEmployed: number;
  discussion: InsuranceDiscussion | null;
};

export function insuranceEmployeeKey(employee: EmployeeLike): string {
  return String(employee.dbId || employee.employee_id || employee.id || '').trim();
}

function daysSince(date: Date, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((start.getTime() - date.getTime()) / 86_400_000);
}

/** In-house FTE employees past 30 days, people not yet spoken with first, newest hires first. */
export function buildInsuranceCheckinRows(
  employees: EmployeeLike[],
  discussions: Record<string, InsuranceDiscussion>,
  today: Date = new Date()
): InsuranceCheckinRow[] {
  return employees
    .filter(isInHouseFteEmployee)
    .map((employee) => {
      const hire = parseDueDate(readEmployeeHireDateRaw(employee));
      if (!hire) return null;
      const daysEmployed = daysSince(hire, today);
      if (daysEmployed < INSURANCE_CHECKIN_AFTER_DAYS) return null;
      const employeeId = insuranceEmployeeKey(employee);
      if (!employeeId) return null;
      return {
        employee,
        row: {
          employeeId,
          name: employeeDisplayName(employee),
          department: String(employee.department || employee.dept || '').trim(),
          hireDate: readEmployeeHireDateRaw(employee).slice(0, 10),
          daysEmployed,
          discussion: discussions[employeeId] || null,
        },
      };
    })
    .filter((entry): entry is { employee: EmployeeLike; row: InsuranceCheckinRow } => Boolean(entry))
    .sort((a, b) => {
      if (Boolean(a.row.discussion) !== Boolean(b.row.discussion)) return a.row.discussion ? 1 : -1;
      if (a.row.daysEmployed !== b.row.daysEmployed) return a.row.daysEmployed - b.row.daysEmployed;
      return compareEmployeesByLastName(a.employee, b.employee);
    })
    .map((entry) => entry.row);
}

export async function loadInsuranceDiscussions(): Promise<Record<string, InsuranceDiscussion>> {
  const { data, error } = await supabaseClient
    .from('insurance_discussions')
    .select('employee_id, discussed_by, discussed_at');
  if (error) throw error;

  const map: Record<string, InsuranceDiscussion> = {};
  (data || []).forEach((row) => {
    const record = row as { employee_id?: string; discussed_by?: string; discussed_at?: string };
    const id = String(record.employee_id || '').trim();
    if (id) map[id] = { discussedBy: String(record.discussed_by || ''), discussedAt: String(record.discussed_at || '') };
  });
  return map;
}

export async function setInsuranceDiscussed(employeeId: string, discussed: boolean): Promise<void> {
  if (!discussed) {
    const { error } = await supabaseClient.from('insurance_discussions').delete().eq('employee_id', employeeId);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseClient.from('insurance_discussions').upsert(
    {
      employee_id: employeeId,
      discussed_by: String(getCurrentAuthEmail() || '').trim().toLowerCase(),
      discussed_at: new Date().toISOString(),
    },
    { onConflict: 'employee_id' }
  );
  if (error) throw error;
}
