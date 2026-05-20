// ============================================
// User access / role scoping (from js/app.js)
// ============================================

import { supabaseClient } from './supabaseClient';

export type UserAccessRow = {
  email?: string;
  display_name?: string;
  role?: string;
  supervisor_name?: string;
  can_delete?: boolean;
};

export type EmployeeLike = Record<string, unknown>;

let currentUserRole = 'user';
let currentUserAccess: UserAccessRow | null = null;

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

export function getCurrentUserRole(): string {
  return currentUserRole;
}

export function getCurrentUserAccess(): UserAccessRow | null {
  return currentUserAccess;
}

export function setCurrentUserAccess(access: UserAccessRow | null, role?: string): void {
  currentUserAccess = access;
  if (role !== undefined) {
    currentUserRole = String(role || 'user').trim().toLowerCase();
  }
  window.currentUserRole = currentUserRole;
  window.currentUserAccess = currentUserAccess;
}

export async function getUserRole(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const userEmail = String(user.email || '')
      .trim()
      .toLowerCase();

    currentUserAccess = null;

    const { data: accessRows, error: accessError } = await supabaseClient
      .from('user_access')
      .select('email, display_name, role, supervisor_name, can_delete')
      .eq('email', userEmail)
      .limit(1);

    if (!accessError && accessRows?.[0]) {
      currentUserAccess = accessRows[0] as UserAccessRow;
      const accessRole = String(accessRows[0].role || '')
        .toLowerCase()
        .trim();
      if (accessRole) {
        currentUserRole = accessRole;
        window.currentUserRole = currentUserRole;
        window.currentUserAccess = currentUserAccess;
        return accessRole;
      }
    }

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('hr_role')
      .eq('id', user.id);

    if (error) {
      console.error(error);
      return null;
    }

    const roles = (data || [])
      .map((row: { hr_role?: string }) =>
        String(row.hr_role || '')
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);

    if (roles.includes('admin')) return 'admin';
    if (roles.includes('supervisor')) return 'supervisor';
    if (roles.includes('user')) return 'user';

    const resolved = roles[0] || 'user';
    currentUserRole = resolved;
    window.currentUserRole = currentUserRole;
    return resolved;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function canManageEmployeeRecords(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'admin';
}

export function isSupervisorUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'supervisor';
}

export function employeeMatchesSupervisorAccess(employee: EmployeeLike | null | undefined): boolean {
  if (!isSupervisorUser()) return true;

  const supervisorName = String(currentUserAccess?.supervisor_name || '')
    .trim()
    .toLowerCase();

  if (!supervisorName) {
    console.warn(
      '[Supervisor Match Fail] No supervisor_name on currentUserAccess:',
      currentUserAccess
    );
    return false;
  }

  const employeeSupervisor = String(employee?.supervisor || employee?.displaySupervisor || '')
    .trim()
    .toLowerCase();

  if (!employeeSupervisor) {
    console.warn('[Supervisor Match Fail] No supervisor on employee:', employee);
    return false;
  }

  const compactAccessName = supervisorName.replace(/[^a-z0-9]/g, '');
  const compactEmployeeSupervisor = employeeSupervisor.replace(/[^a-z0-9]/g, '');

  return (
    employeeSupervisor.includes(supervisorName) ||
    supervisorName.includes(employeeSupervisor) ||
    compactEmployeeSupervisor.includes(compactAccessName) ||
    compactAccessName.includes(compactEmployeeSupervisor)
  );
}

export function applySupervisorDashboardView(): void {
  if (!isSupervisorUser()) return;

  const name =
    currentUserAccess?.display_name || currentUserAccess?.supervisor_name || 'Supervisor';

  const title = safeGet('dashboardTitle') || document.querySelector('h1');
  if (title) title.textContent = `${name}'s Team Dashboard`;

  const rosterTitle =
    safeGet('rosterTitle') ||
    document.querySelector('#employeeRosterCard h2, #employeeRosterCard h3, .roster-title');

  if (rosterTitle) rosterTitle.textContent = 'My Team';

  const activeLabel = document
    .querySelector('#kActiveHC')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (activeLabel) activeLabel.textContent = 'My Team Size';

  const reviewsLabel = document
    .querySelector('#kReviewsDue')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (reviewsLabel) reviewsLabel.textContent = 'My Reviews Due';

  const riskLabel = document
    .querySelector('#kTurnoverRisk')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (riskLabel) riskLabel.textContent = 'My Team Risk';

  const leaveLabel = document
    .querySelector('#kOnLeave')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (leaveLabel) leaveLabel.textContent = 'My Team On Leave';

  const deptCard = document.querySelector('#kDepartments')?.closest('.kpi-card');
  if (deptCard) deptCard.classList.add('hidden');

  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    (el as HTMLElement).classList.add('hidden');
    (el as HTMLInputElement).disabled = true;
  });

  const existingBanner = document.getElementById('supervisorBanner');
  if (!existingBanner) {
    const banner = document.createElement('div');
    banner.id = 'supervisorBanner';
    banner.style.padding = '10px';
    banner.style.marginBottom = '10px';
    banner.style.borderRadius = '6px';
    banner.style.background = '#eef2ff';
    banner.style.fontSize = '14px';

    const employees = window.EMPLOYEES || [];
    const riskMap = window.currentAtRiskRosterMap || {};
    const atRisk = employees.filter((e: EmployeeLike) => {
      const key = String(e.dbId || e.id || '');
      const risk = riskMap[key] as { lowReview?: boolean; openIncidentCount?: number; manualReason?: string } | undefined;
      return risk && (risk.lowReview || (risk.openIncidentCount ?? 0) > 0 || risk.manualReason);
    }).length;

    banner.textContent = `You have ${employees.length} employees. ${atRisk} may need attention.`;
    const container = document.querySelector('.dashboard') || document.body;
    container?.prepend(banner);
  }
}

export function applyRoleLocks(): void {
  const adminOnlyIds = ['deleteEmployeeBtn', 'terminateEmployeeBtn'];
  adminOnlyIds.forEach((id) => {
    const el = safeGet(id) as HTMLButtonElement | null;
    if (!el) return;
    const locked = !canManageEmployeeRecords();
    el.disabled = locked;
    el.title = locked ? 'Locked: admin access required' : '';
  });
}

export function ensureDeleteEmployeeButton(): HTMLButtonElement | null {
  const drawer =
    safeGet('employeeDrawer') ||
    document.querySelector('#employeeDrawer') ||
    document.querySelector('.drawer.open');
  const searchRoot = drawer || document;

  const findButtonByText = (labels: string[]) => {
    const normalizedLabels = labels.map((label) => String(label).trim().toLowerCase());
    return Array.from(searchRoot.querySelectorAll('button')).find((button) =>
      normalizedLabels.includes(
        String(button.textContent || '')
          .trim()
          .toLowerCase()
      )
    );
  };

  const newBtn =
    (drawer?.querySelector("button[onclick='openNewEmployeeForm()']") as HTMLButtonElement | null) ||
    (drawer?.querySelector('#newEmployeeBtn') as HTMLButtonElement | null) ||
    findButtonByText(['New Employee']);

  const saveBtn =
    (drawer?.querySelector('#saveEmployeeBtn') as HTMLButtonElement | null) ||
    findButtonByText(['Update Employee', 'Save Employee']);

  const actionsRow =
    (newBtn?.parentElement as HTMLElement | null) ||
    (saveBtn?.parentElement as HTMLElement | null) ||
    (drawer?.querySelector('.form-actions') as HTMLElement | null) ||
    (drawer?.querySelector('.actions') as HTMLElement | null) ||
    (drawer?.querySelector('#tab-employee') as HTMLElement | null) ||
    (drawer?.querySelector('#tab-profile') as HTMLElement | null) ||
    (drawer as HTMLElement | null);

  if (!actionsRow) {
    console.warn('Could not find employee action row for Archive/Terminate buttons.');
    return null;
  }

  let archiveBtn = safeGet('deleteEmployeeBtn') as HTMLButtonElement | null;
  if (!archiveBtn) {
    archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.id = 'deleteEmployeeBtn';
    archiveBtn.className = 'button danger';
    archiveBtn.textContent = 'Delete Employee';
    archiveBtn.onclick = () => {
      if (typeof window.runDeleteEmployee === 'function') {
        window.runDeleteEmployee();
      }
    };
  }

  let terminateBtn = safeGet('terminateEmployeeBtn') as HTMLButtonElement | null;
  if (!terminateBtn) {
    terminateBtn = document.createElement('button');
    terminateBtn.type = 'button';
    terminateBtn.id = 'terminateEmployeeBtn';
    terminateBtn.className = 'button danger';
    terminateBtn.textContent = 'Terminate Employee';
    terminateBtn.onclick = () => {
      if (typeof window.runTerminateEmployee === 'function') {
        window.runTerminateEmployee();
      }
    };
  }

  if (!actionsRow.contains(archiveBtn)) {
    if (newBtn?.nextSibling) {
      actionsRow.insertBefore(archiveBtn, newBtn.nextSibling);
    } else {
      actionsRow.appendChild(archiveBtn);
    }
  }

  if (!actionsRow.contains(terminateBtn)) {
    if (archiveBtn?.nextSibling) {
      actionsRow.insertBefore(terminateBtn, archiveBtn.nextSibling);
    } else {
      actionsRow.appendChild(terminateBtn);
    }
  }

  archiveBtn.classList.remove('hidden');
  terminateBtn.classList.remove('hidden');
  applyRoleLocks();
  return archiveBtn;
}

export function applyRolePermissions(): void {
  const supervisorMode = isSupervisorUser();
  const deleteEmployeeBtn = ensureDeleteEmployeeButton();
  const terminateBtn = safeGet('terminateEmployeeBtn') as HTMLButtonElement | null;
  const currentEmployee = window.currentEmployee as Record<string, unknown> | null | undefined;
  const isCreatingEmployee = Boolean(window.isCreatingEmployee);
  const currentEmergencyContactId = window.currentEmergencyContactId;

  if (currentEmployee) {
    const status = String(currentEmployee.status || '').toUpperCase();
    if (deleteEmployeeBtn) {
      const shouldHideDeleteEmployee = isCreatingEmployee || supervisorMode;
      deleteEmployeeBtn.classList.toggle('hidden', shouldHideDeleteEmployee);
    }
    if (terminateBtn) {
      const shouldHideTerminate = status === 'TERMINATED' || supervisorMode;
      terminateBtn.classList.toggle('hidden', shouldHideTerminate);
    }
  } else {
    deleteEmployeeBtn?.classList.add('hidden');
    terminateBtn?.classList.add('hidden');
  }

  const deleteECBtn = safeGet('deleteECBtn') as HTMLButtonElement | null;
  if (deleteECBtn) {
    deleteECBtn.classList.toggle('hidden', !currentEmergencyContactId);
  }

  if (supervisorMode) {
    document
      .querySelectorAll(
        '#deleteEmployeeBtn, #terminateEmployeeBtn, .delete-btn, .danger-delete, [data-admin-only="true"]'
      )
      .forEach((el) => {
        (el as HTMLElement).classList.add('hidden');
        (el as HTMLInputElement).disabled = true;
        (el as HTMLElement).title =
          'Locked: supervisors cannot delete or terminate records';
      });

    const employeeAdminFieldIds = [
      'empId',
      'employeeId',
      'empEmployeeId',
      'empStatus',
      'status',
      'empFirstName',
      'firstName',
      'employeeFirstName',
      'empLastName',
      'lastName',
      'employeeLastName',
      'empDepartment',
      'department',
      'employeeDepartment',
      'empPosition',
      'position',
      'employeePosition',
      'empSupervisor',
      'supervisor',
      'empPayType',
      'payType',
      'empStandardHours',
      'standardHours',
      'empBenefitsStatus',
      'benefitsStatus',
      'empHireDate',
      'hireDate',
      'empNextReviewDate',
      'nextReviewDate',
      'empAnniversaryDate',
      'anniversaryDate',
      'empTenureBracket',
      'tenureBracket',
      'empWorkEmail',
      'workEmail',
      'empPersonalEmail',
      'personalEmail',
      'empPhone',
      'phone',
      'empNotes',
      'notes',
    ];

    employeeAdminFieldIds.forEach((id) => {
      const field = safeGet(id) as HTMLInputElement | null;
      if (!field) return;
      field.disabled = true;
      field.readOnly = true;
      field.title = 'Locked: supervisors cannot edit core employee profile fields';
    });

    const saveEmployeeBtn = safeGet('saveEmployeeBtn') as HTMLButtonElement | null;
    if (saveEmployeeBtn) {
      saveEmployeeBtn.disabled = true;
      saveEmployeeBtn.classList.add('hidden');
      saveEmployeeBtn.title =
        'Locked: supervisors cannot edit core employee profile fields';
    }

    const newEmployeeBtn =
      (safeGet('newEmployeeBtn') as HTMLButtonElement | null) ||
      (document.querySelector(
        "button[onclick='openNewEmployeeForm()']"
      ) as HTMLButtonElement | null);

    if (newEmployeeBtn) {
      newEmployeeBtn.disabled = true;
      newEmployeeBtn.classList.add('hidden');
      newEmployeeBtn.title = 'Locked: supervisors cannot create employee records';
    }
  }
}

declare global {
  interface Window {
    currentUserRole?: string;
    currentUserAccess?: UserAccessRow | null;
    getUserRole?: () => Promise<string | null>;
    canManageEmployeeRecords?: () => boolean;
    isSupervisorUser?: () => boolean;
    employeeMatchesSupervisorAccess?: (employee: EmployeeLike) => boolean;
    applySupervisorDashboardView?: () => void;
    applyRoleLocks?: () => void;
    applyRolePermissions?: () => void;
    ensureDeleteEmployeeButton?: () => HTMLButtonElement | null;
    runDeleteEmployee?: () => void;
    runTerminateEmployee?: () => void;
    isCreatingEmployee?: boolean;
    currentEmergencyContactId?: string | null;
  }
}

window.currentUserRole = currentUserRole;
window.currentUserAccess = currentUserAccess;
window.getUserRole = getUserRole;
window.canManageEmployeeRecords = canManageEmployeeRecords;
window.isSupervisorUser = isSupervisorUser;
window.employeeMatchesSupervisorAccess = employeeMatchesSupervisorAccess;
window.applySupervisorDashboardView = applySupervisorDashboardView;
window.applyRoleLocks = applyRoleLocks;
window.applyRolePermissions = applyRolePermissions;
window.ensureDeleteEmployeeButton = ensureDeleteEmployeeButton;
