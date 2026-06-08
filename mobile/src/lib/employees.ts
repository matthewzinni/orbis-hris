import { supabase } from './supabase';

export type EmployeeRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
  position?: string | null;
  supervisor?: string | null;
  status?: string | null;
  email?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  pay_type?: string | null;
  standard_hours?: number | string | null;
  is_remote?: boolean | null;
  next_review_date?: string | null;
  benefits_status?: string | null;
  [key: string]: unknown;
};

export function employeeDisplayName(employee: EmployeeRecord): string {
  const first = String(employee.first_name || '').trim();
  const last = String(employee.last_name || '').trim();
  const combined = `${first} ${last}`.trim();
  return combined || String(employee.id || 'Employee');
}

export function employeeStatusLabel(status: unknown): string {
  return String(status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE';
}

export function isActiveEmployee(employee: EmployeeRecord): boolean {
  return employeeStatusLabel(employee.status) === 'ACTIVE';
}

export async function fetchAllEmployees(): Promise<EmployeeRecord[]> {
  const { data, error } = await supabase.from('employees').select('*');

  if (error) {
    throw new Error(error.message || 'Could not load employees.');
  }

  return (Array.isArray(data) ? data : []) as EmployeeRecord[];
}

export function sortEmployeesByName(rows: EmployeeRecord[]): EmployeeRecord[] {
  return rows.slice().sort((a, b) => {
    const nameCmp = employeeDisplayName(a).localeCompare(employeeDisplayName(b), undefined, {
      sensitivity: 'base',
    });
    if (nameCmp !== 0) return nameCmp;
    return String(a.id).localeCompare(String(b.id), undefined, { sensitivity: 'base' });
  });
}

export function filterEmployees(
  rows: EmployeeRecord[],
  query: string,
  activeOnly: boolean
): EmployeeRecord[] {
  const needle = query.trim().toLowerCase();

  return rows.filter((employee) => {
    if (activeOnly && !isActiveEmployee(employee)) return false;
    if (!needle) return true;

    const haystack = [
      employee.id,
      employee.first_name,
      employee.last_name,
      employee.department,
      employee.position,
      employee.supervisor,
      employee.email,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return haystack.includes(needle);
  });
}
