// ============================================
// ORBIS EMPLOYEE MODULE
// Employee loading, retrieval, and state sync
// ============================================

import { supabase } from '../services/supabaseClient';
import { appState } from '../core/state';

export interface EmployeeRecord {
  id?: string;
  dbId?: string;
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department?: string;
  position?: string;
  supervisor?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'LEAVE' | 'TERMINATED' | string;
  hire_date?: string;
  next_review_date?: string;
  pay_type?: string;
  benefits_status?: string;
  standard_hours?: number;
  [key: string]: unknown;
}

export type NormalizedEmployeeStatus = 'active' | 'inactive' | 'leave' | 'terminated' | 'unknown';

export function normalizeEmployeeStatus(status: unknown): NormalizedEmployeeStatus {
  const normalized = String(status || '').trim().toLowerCase();

  if (!normalized || normalized === 'active' || normalized === 'full-time' || normalized === 'part-time') {
    return 'active';
  }

  if (normalized === 'inactive') return 'inactive';
  if (normalized === 'leave' || normalized === 'on leave') return 'leave';
  if (normalized === 'terminated' || normalized === 'termination') return 'terminated';

  return 'unknown';
}

export async function loadEmployees(): Promise<EmployeeRecord[]> {
  try {
    console.log('Loading employees...');

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('last_name', { ascending: true });

    if (error) {
      console.error('Failed to load employees:', error);
      throw error;
    }

    const employees = (data || []) as EmployeeRecord[];

    appState.employees = employees;

    console.log(`Loaded ${employees.length} employees`);

    return employees;
  } catch (err) {
    console.error('Employee load failure:', err);
    return [];
  }
}

export function getEmployees(): EmployeeRecord[] {
  return appState.employees as EmployeeRecord[];
}

export function getEmployeeById(id: string): EmployeeRecord | undefined {
  return getEmployees().find((employee) => {
    const identifiers = [employee.id, employee.dbId, employee.employee_id]
      .filter(Boolean)
      .map(String);

    return identifiers.includes(String(id));
  });
}

export function getActiveEmployees(): EmployeeRecord[] {
  return getEmployees().filter((employee) => normalizeEmployeeStatus(employee.status) === 'active');
}

export function getInactiveEmployees(): EmployeeRecord[] {
  return getEmployees().filter((employee) => normalizeEmployeeStatus(employee.status) === 'inactive');
}

export function getTerminatedEmployees(): EmployeeRecord[] {
  return getEmployees().filter((employee) => normalizeEmployeeStatus(employee.status) === 'terminated');
}

export function getEmployeesOnLeave(): EmployeeRecord[] {
  return getEmployees().filter((employee) => normalizeEmployeeStatus(employee.status) === 'leave');
}

export function employeeDisplayName(employee: EmployeeRecord): string {
  const first = String(employee.first_name || '').trim();
  const last = String(employee.last_name || '').trim();

  const fullName = `${first} ${last}`.trim();

  if (fullName) return fullName;

  return String(employee.email || employee.employee_id || 'Unknown Employee');
}
