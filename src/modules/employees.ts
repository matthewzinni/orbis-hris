// ============================================
// Employee loading + access-scoped roster state
// ============================================

import { supabaseClient } from '../services/supabaseClient';
import { appState } from '../core/state';
import {
  isSupervisorUser,
  employeeMatchesSupervisorAccess,
  setCurrentUserAccess,
} from '../services/access';

export type EmployeeRecord = Record<string, unknown>;

export type NormalizedEmployeeStatus =
  | 'active'
  | 'inactive'
  | 'leave'
  | 'terminated'
  | 'unknown';

export function normalizeEmployeeStatus(status: unknown): NormalizedEmployeeStatus {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  if (
    !normalized ||
    normalized === 'active' ||
    normalized === 'full-time' ||
    normalized === 'part-time'
  ) {
    return 'active';
  }

  if (normalized === 'inactive') return 'inactive';
  if (normalized === 'leave' || normalized === 'on leave') return 'leave';
  if (normalized === 'terminated' || normalized === 'termination') return 'terminated';

  return 'unknown';
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function normalizeRow(employee: EmployeeRecord): EmployeeRecord | null {
  if (typeof window.normalizeEmployee === 'function') {
    return window.normalizeEmployee(employee) as EmployeeRecord | null;
  }
  return employee;
}

export async function loadEmployees(): Promise<EmployeeRecord[]> {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    const userEmail = String(user?.email || '')
      .trim()
      .toLowerCase();

    if (userEmail) {
      const { data: accessRows, error: accessError } = await supabaseClient
        .from('user_access')
        .select('email, display_name, role, supervisor_name, can_delete')
        .eq('email', userEmail)
        .limit(1);

      if (!accessError && accessRows?.[0]) {
        const role = String(accessRows[0].role || window.currentUserRole || 'user')
          .trim()
          .toLowerCase();
        setCurrentUserAccess(accessRows[0], role);
        console.log('[Access Loaded In loadEmployees]', role, accessRows[0]);
      }
    }
  } catch (accessErr) {
    console.warn('Could not load user access before employee scope.', accessErr);
  }

  const { data, error } = await supabaseClient.from('employees').select('*');

  if (error) {
    console.error(error);
    showToast('Could not load employees.', 'error');
    return [];
  }

  const normalizedEmployees = (Array.isArray(data) ? data : [])
    .map((employee) => normalizeRow(employee as EmployeeRecord))
    .filter(Boolean) as EmployeeRecord[];

  window.ALL_EMPLOYEES = normalizedEmployees;

  let scoped: EmployeeRecord[];

  if (isSupervisorUser()) {
    if (!window.currentUserAccess?.supervisor_name) {
      showToast('No employee access assigned. Contact HR.', 'error');
      scoped = [];
    } else {
      scoped = normalizedEmployees.filter((employee) =>
        employeeMatchesSupervisorAccess(employee)
      );
    }

    console.log('[Supervisor Filter Applied]', {
      supervisorName: window.currentUserAccess?.supervisor_name,
      before: normalizedEmployees.length,
      after: scoped.length,
    });
  } else {
    scoped = normalizedEmployees;
  }

  window.EMPLOYEES = scoped;
  window.currentFilteredEmployees = scoped;
  window.currentEmployeeRoster = scoped;
  appState.employees = scoped;

  console.log(
    '[Access Scope]',
    window.currentUserRole,
    window.currentUserAccess,
    'visible employees:',
    scoped.length
  );

  if (typeof window.renderRoster === 'function') {
    window.renderRoster();
  }

  if (typeof window.renderKpiEmployeeMetrics === 'function') {
    window.renderKpiEmployeeMetrics();
  }

  if (typeof window.populateDepartmentFilter === 'function') {
    window.populateDepartmentFilter();
  }

  if (typeof window.renderDepartmentSummary === 'function') {
    window.renderDepartmentSummary();
  }

  if (isSupervisorUser()) {
    window.applySupervisorDashboardView?.();
  } else {
    window.applyAdminDashboardView?.();
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }

  return scoped;
}

export function getEmployees(): EmployeeRecord[] {
  if (Array.isArray(appState.employees) && appState.employees.length) {
    return appState.employees as EmployeeRecord[];
  }
  return Array.isArray(window.EMPLOYEES) ? window.EMPLOYEES : [];
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
  return getEmployees().filter(
    (employee) => normalizeEmployeeStatus(employee.status) === 'active'
  );
}

export function getInactiveEmployees(): EmployeeRecord[] {
  return getEmployees().filter(
    (employee) => normalizeEmployeeStatus(employee.status) === 'inactive'
  );
}

export function getTerminatedEmployees(): EmployeeRecord[] {
  return getEmployees().filter(
    (employee) => normalizeEmployeeStatus(employee.status) === 'terminated'
  );
}

export function getEmployeesOnLeave(): EmployeeRecord[] {
  return getEmployees().filter(
    (employee) => normalizeEmployeeStatus(employee.status) === 'leave'
  );
}

declare global {
  interface Window {
    EMPLOYEES?: EmployeeRecord[];
    ALL_EMPLOYEES?: EmployeeRecord[];
    currentEmployeeRoster?: EmployeeRecord[];
    currentFilteredEmployees?: EmployeeRecord[];
    loadEmployees?: () => Promise<EmployeeRecord[]>;
  }
}

window.loadEmployees = loadEmployees;
