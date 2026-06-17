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
import { AUTO_BENEFITS_ELIGIBLE_STATUS } from '../services/employeeUtils';

export type EmployeeRecord = Record<string, unknown>;

export type NormalizedEmployeeStatus =
  | 'active'
  | 'inactive'
  | 'leave'
  | 'terminated'
  | 'unknown';

let loadEmployeesInFlight: Promise<EmployeeRecord[]> | null = null;
let loadEmployeesQueued = false;
let employeeLoadUiRefreshScheduled = false;

function patchEmployeeRecords(
  patches: Array<{ id: string; values: Record<string, unknown> }>
): void {
  if (!patches.length) return;

  const patchList = (list: EmployeeRecord[] | undefined): void => {
    if (!Array.isArray(list)) return;

    patches.forEach(({ id, values }) => {
      const row = list.find((employee) => String(employee.id || '') === id);
      if (row) {
        Object.assign(row, values);
      }
    });
  };

  patchList(window.ALL_EMPLOYEES as EmployeeRecord[] | undefined);
  patchList(window.EMPLOYEES as EmployeeRecord[] | undefined);
  patchList(window.currentFilteredEmployees as EmployeeRecord[] | undefined);
  patchList(window.currentEmployeeRoster as EmployeeRecord[] | undefined);
  patchList(appState.employees as EmployeeRecord[] | undefined);

  if (
    window.currentEmployee &&
    patches.some(({ id }) => String((window.currentEmployee as EmployeeRecord).id || '') === id)
  ) {
    const currentPatch = patches.find(
      ({ id }) => String((window.currentEmployee as EmployeeRecord).id || '') === id
    );
    if (currentPatch) {
      Object.assign(window.currentEmployee as EmployeeRecord, currentPatch.values);
    }
  }
}

function runEmployeeRosterUiRefresh(): void {
  if (typeof window.renderRoster === 'function') {
    window.renderRoster();
  }

  if (typeof window.populateDepartmentFilter === 'function') {
    window.populateDepartmentFilter();
  }

  if (typeof window.renderDepartmentSummary === 'function') {
    window.renderDepartmentSummary();
  }
}

function runEmployeeDashboardUiRefresh(): void {
  if (typeof window.renderKpiEmployeeMetrics === 'function') {
    window.renderKpiEmployeeMetrics();
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

function runEmployeeAccessUiRefresh(): void {
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

  if (typeof window.applyJanusAccess === 'function') {
    window.applyJanusAccess();
  }

  if (typeof window.applyLeaveAccess === 'function') {
    window.applyLeaveAccess();
  }
}

function runEmployeeLoadUiRefresh(): void {
  runEmployeeRosterUiRefresh();
  runEmployeeDashboardUiRefresh();
  runEmployeeAccessUiRefresh();
}

function scheduleEmployeeLoadUiRefresh(): void {
  if (employeeLoadUiRefreshScheduled) return;

  employeeLoadUiRefreshScheduled = true;
  requestAnimationFrame(() => {
    employeeLoadUiRefreshScheduled = false;
    runEmployeeLoadUiRefresh();
  });
}

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
  if (loadEmployeesInFlight) {
    loadEmployeesQueued = true;
    return loadEmployeesInFlight;
  }

  loadEmployeesInFlight = loadEmployeesInternal().finally(() => {
    loadEmployeesInFlight = null;
    if (loadEmployeesQueued) {
      loadEmployeesQueued = false;
      void loadEmployees();
    }
  });

  return loadEmployeesInFlight;
}

async function loadEmployeesInternal(): Promise<EmployeeRecord[]> {
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

  scheduleEmployeeLoadUiRefresh();

  if (isAdminUser()) {
    void syncAutoBenefitsEligibility(normalizedEmployees).then((result) => {
      if (!result.updatedCount) return;

      patchEmployeeRecords(
        result.updatedEmployeeIds.map((id) => ({
          id,
          values: {
            benefits_status: AUTO_BENEFITS_ELIGIBLE_STATUS,
            benefitsStatus: AUTO_BENEFITS_ELIGIBLE_STATUS,
          },
        }))
      );

      scheduleEmployeeLoadUiRefresh();

      if (typeof window.loadHrInbox === 'function') {
        void window.loadHrInbox(true);
      }
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

window.loadEmployees = loadEmployees;
