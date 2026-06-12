// ============================================
// Employee loading + access-scoped roster state
// ============================================

import { supabaseClient } from '../services/supabaseClient';
import { appState } from '../core/state';
import {
  isAdminUser,
  isSupervisorUser,
  isEmployeeUser,
  getLinkedEmployeeId,
  applyEmployeePortalView,
  employeeMatchesSupervisorAccess,
  parseSupervisedEmployeeIds,
  getUserRole,
} from '../services/access';
import { syncAutoBenefitsEligibility } from '../services/benefitsEligibilitySync';

export type EmployeeRecord = Record<string, unknown>;

export type NormalizedEmployeeStatus =
  | 'active'
  | 'inactive'
  | 'leave'
  | 'terminated'
  | 'unknown';

let skipBenefitsEligibilitySync = false;

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
  if (normalized === 'absent') return 'absent';
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
    await getUserRole();
    console.log('[Access Loaded In loadEmployees]', window.currentUserRole, window.currentUserAccess);
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
    const scopedIds = parseSupervisedEmployeeIds(window.currentUserAccess);
    const hasSupervisorName = Boolean(
      String(window.currentUserAccess?.supervisor_name || '').trim()
    );

    if (!scopedIds.length && !hasSupervisorName) {
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
  } else if (isEmployeeUser()) {
    const linkedId = getLinkedEmployeeId();
    scoped = linkedId
      ? normalizedEmployees.filter(
          (employee) => String(employee.id || '').trim() === linkedId
        )
      : [];
    if (!scoped.length && linkedId) {
      showToast(
        'Your employee record could not be loaded. Confirm the personal or work email on file matches your login.',
        'error'
      );
    }
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

  if (isEmployeeUser()) {
    applyEmployeePortalView();
    if (scoped[0]) {
      window.currentEmployee = scoped[0];
    }
  } else if (isSupervisorUser()) {
    window.applySupervisorDashboardView?.();
  } else {
    window.applyAdminDashboardView?.();
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }

  if (typeof window.applyOperationsCenterAccess === 'function') {
    window.applyOperationsCenterAccess();
  }

  if (typeof window.applyCareEngagementCenterAccess === 'function') {
    window.applyCareEngagementCenterAccess();
  }

  if (typeof window.applyInvestigationsCenterAccess === 'function') {
    window.applyInvestigationsCenterAccess();
  }

  if (typeof window.applyAttendanceAccess === 'function') {
    window.applyAttendanceAccess();
  }

  if (typeof window.applyHrInboxAccess === 'function') {
    window.applyHrInboxAccess();
  }

  if (typeof window.applyLeaveAccess === 'function') {
    window.applyLeaveAccess();
  }

  if (typeof window.ensureOperationsIssuesLoaded === 'function') {
    window.ensureOperationsIssuesLoaded();
  }

  if (typeof window.ensureInvestigationsLoaded === 'function') {
    window.ensureInvestigationsLoaded();
  }

  if (isAdminUser() && !skipBenefitsEligibilitySync) {
    void syncAutoBenefitsEligibility(normalizedEmployees).then((count) => {
      if (!count) return;

      skipBenefitsEligibilitySync = true;
      void loadEmployees()
        .then(() => {
          if (typeof window.loadHrInbox === 'function') {
            void window.loadHrInbox(true);
          }
        })
        .finally(() => {
          skipBenefitsEligibilitySync = false;
        });
    });
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
