// ============================================
// User access / role scoping (from js/app.js)
// ============================================

import { supabaseClient } from './supabaseClient';

export type UserAccessRow = {
  email?: string;
  display_name?: string;
  role?: string;
  supervisor_name?: string;
  /** When non-empty, supervisor roster + RLS are limited to these employees.id (UUID) values. */
  supervised_employee_ids?: string[] | null;
  /** employees.id for role=employee (self-service PTO portal). */
  linked_employee_id?: string | null;
  can_delete?: boolean;
};

/** Leadership emails that must remain admin (not employee portal). */
export const LEADERSHIP_ADMIN_EMAILS = new Set([
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
]);

const ADMIN_ONLY_SECTIONS = new Set([
  'candidatesView',
  'documentsView',
  'investigationsView',
  'reportsView',
  'settingsView',
]);

const SUPERVISOR_SECTIONS = new Set([
  'dashboardView',
  'employeesView',
  'orgChartView',
  'attendanceView',
  'operationsView',
  'careEngagementView',
]);

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

export async function fetchUserAccessRowForEmail(email: string): Promise<UserAccessRow | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const select =
    'email, display_name, role, supervisor_name, supervised_employee_ids, linked_employee_id, can_delete';

  // Prefer SECURITY DEFINER RPC: matches auth.users.email to user_access so RLS/casing
  // on the table cannot hide the row when JWT email differs from stored user_access.email.
  const { data: rpcRow, error: rpcErr } = await supabaseClient.rpc('orbis_get_my_user_access');
  if (!rpcErr && rpcRow) {
    const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as UserAccessRow | undefined;
    if (row && typeof row === 'object') {
      const rowEmail = String(row.email || '')
        .trim()
        .toLowerCase();
      if (rowEmail === normalized) {
        return row;
      }
    }
  }

  const { data: exactMatch, error: exactErr } = await supabaseClient
    .from('user_access')
    .select(select)
    .eq('email', normalized)
    .limit(1);

  if (!exactErr && exactMatch?.[0]) {
    return exactMatch[0] as UserAccessRow;
  }

  const { data: ilikeMatch, error: ilikeErr } = await supabaseClient
    .from('user_access')
    .select(select)
    .ilike('email', normalized)
    .limit(1);

  if (!ilikeErr && ilikeMatch?.[0]) {
    return ilikeMatch[0] as UserAccessRow;
  }

  return null;
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

    let accessRow = await fetchUserAccessRowForEmail(userEmail);

    if (!accessRow) {
      const { data: linked, error: linkErr } = await supabaseClient.rpc(
        'orbis_ensure_employee_portal_access'
      );
      if (!linkErr && linked) {
        accessRow = (Array.isArray(linked) ? linked[0] : linked) as UserAccessRow;
      }
    }

    if (accessRow) {
      currentUserAccess = accessRow;
      const accessRole = String(accessRow.role || '')
        .toLowerCase()
        .trim();
      if (accessRole === 'admin' || accessRole === 'supervisor' || accessRole === 'employee') {
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

    if (roles.includes('admin')) {
      currentUserRole = 'admin';
      window.currentUserRole = currentUserRole;
      return 'admin';
    }

    if (roles.includes('supervisor')) {
      currentUserRole = 'supervisor';
      window.currentUserRole = currentUserRole;
      return 'supervisor';
    }

    currentUserRole = '';
    window.currentUserRole = currentUserRole;
    window.currentUserAccess = null;
    return null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function isAdminUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'admin';
}

export function canManageEmployeeRecords(): boolean {
  return isAdminUser();
}

export function isSupervisorUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'supervisor';
}

export function isEmployeeUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'employee';
}

export function canAccessOrbisApp(): boolean {
  return isAdminUser() || isSupervisorUser() || isEmployeeUser();
}

export function canAccessAppSection(sectionId: string): boolean {
  const section = String(sectionId || '').trim();
  if (!section) return false;

  if (isEmployeeUser()) {
    return section === 'myTimeOffView';
  }

  if (isAdminUser()) {
    return section !== 'myTimeOffView';
  }

  if (isSupervisorUser()) {
    if (section === 'myTimeOffView') return false;
    if (ADMIN_ONLY_SECTIONS.has(section)) return false;
    return SUPERVISOR_SECTIONS.has(section);
  }

  return false;
}

export function applyRoleNavigation(): void {
  const role = String(currentUserRole || '').toLowerCase();

  document.querySelectorAll<HTMLElement>('[data-nav-view]').forEach((button) => {
    const sectionId = String(button.dataset.navView || '').trim();
    const allowed = canAccessAppSection(sectionId);
    button.classList.toggle('hidden', !allowed);
    (button as HTMLButtonElement).disabled = !allowed;
  });

  document
    .querySelectorAll<HTMLElement>('#dashboardQuickLinks [data-nav-view], .orbis-quick-links [data-nav-view]')
    .forEach((button) => {
      const sectionId = String(button.dataset.navView || '').trim();
      const allowed = canAccessAppSection(sectionId);
      button.classList.toggle('hidden', !allowed);
      (button as HTMLButtonElement).disabled = !allowed;
    });

  if (role === 'admin') {
    document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
      (el as HTMLElement).classList.remove('hidden');
      (el as HTMLInputElement).disabled = false;
    });
  }
}

export function getLinkedEmployeeId(): string {
  return String(currentUserAccess?.linked_employee_id || '').trim();
}

export function applyEmployeePortalView(): void {
  if (!isEmployeeUser()) return;

  document.getElementById('supervisorBanner')?.remove();

  const name = currentUserAccess?.display_name || 'My Time Off';
  const title = safeGet('dashboardTitle');
  if (title) title.textContent = name;

  const myTimeOffNav = document.getElementById('navMyTimeOff');
  if (myTimeOffNav) {
    myTimeOffNav.classList.remove('hidden');
    myTimeOffNav.classList.add('active');
    myTimeOffNav.setAttribute('aria-current', 'page');
  }

  document.querySelectorAll('.orbis-sidebar-nav .orbis-nav-item').forEach((button) => {
    const view = String((button as HTMLElement).dataset.navView || '');
    const allowed = view === 'myTimeOffView';
    if (view !== 'myTimeOffView') {
      (button as HTMLElement).classList.add('hidden');
      (button as HTMLButtonElement).disabled = true;
    }
  });

  document.querySelectorAll('[data-employee-portal-hide="true"]').forEach((el) => {
    (el as HTMLElement).classList.add('hidden');
  });

  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    (el as HTMLElement).classList.add('hidden');
    (el as HTMLInputElement).disabled = true;
  });
}

/** Departments derived from employees visible to the current supervisor. */
export function getSupervisorDepartmentScope(): string[] {
  if (!isSupervisorUser()) return [];

  const employees = Array.isArray(window.EMPLOYEES) ? window.EMPLOYEES : [];
  const departments = new Set<string>();

  employees.forEach((employee) => {
    const dept = String(employee.department || employee.dept || '')
      .trim()
      .toLowerCase();

    if (dept) departments.add(dept);
  });

  return Array.from(departments);
}

/** Performance reviews: admins always; supervisors only for their direct reports. */
export function canAccessPerformanceReviews(employee?: EmployeeLike | null): boolean {
  if (Boolean(window.isCreatingEmployee)) return false;

  if (isAdminUser()) return true;

  if (isSupervisorUser()) {
    const target =
      employee ?? (window.currentEmployee as EmployeeLike | null | undefined) ?? null;
    return employeeMatchesSupervisorAccess(target);
  }

  return false;
}

/** Normalize UUID list from user_access (PostgREST may return string[] or JSON). */
export function parseSupervisedEmployeeIds(access: UserAccessRow | null | undefined): string[] {
  const raw = access?.supervised_employee_ids;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export function employeeMatchesSupervisorAccess(employee: EmployeeLike | null | undefined): boolean {
  if (!isSupervisorUser()) return true;

  const scopedIds = parseSupervisedEmployeeIds(currentUserAccess);
  if (scopedIds.length > 0) {
    const empId = String(employee?.id || employee?.dbId || '')
      .trim()
      .toLowerCase();
    return Boolean(empId) && scopedIds.includes(empId);
  }

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

export function applyAdminDashboardView(): void {
  document.getElementById('supervisorBanner')?.remove();

  const currentView = String(window.currentMainView || 'dashboardView');
  const dashboardTitle = safeGet('dashboardTitle');
  if (dashboardTitle && currentView === 'dashboardView') {
    dashboardTitle.textContent = 'Dashboard';
  }

  const rosterHeader = document.querySelector('#employeeRosterCard .card-header > span');
  if (rosterHeader) rosterHeader.textContent = 'Employee Roster';

  const activeLabel = document
    .querySelector('#kActiveHC')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (activeLabel) activeLabel.textContent = 'Active Headcount';

  const reviewsLabel = document.querySelector('#cardReviewsDue .kpi-label');
  if (reviewsLabel) {
    reviewsLabel.innerHTML = `Stay Interviews Due
              <span
                id="kReviewsDueInfo"
                class="info-icon"
                title="Counts active employees whose next stay interview date is today or earlier."
                style="cursor: help; font-size: 0.8rem; color: var(--muted)"
                >ⓘ</span
              >`;
  }

  const riskLabel = document.querySelector('#cardTurnoverRisk .kpi-label');
  if (riskLabel) {
    riskLabel.innerHTML = `Turnover Risk
              <span
                class="info-icon"
                title="Score is based on early tenure (0-6 months) and overdue reviews. Higher score = higher retention risk."
                style="cursor: help; font-size: 0.8rem; color: var(--muted)"
                >ⓘ</span
              >`;
  }

  const leaveLabel = document
    .querySelector('#kOnLeave')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (leaveLabel) leaveLabel.textContent = 'Employees on Leave';

  const deptCard = document.querySelector('#kDepartments')?.closest('.kpi-card');
  if (deptCard) deptCard.classList.remove('hidden');

  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    (el as HTMLElement).classList.remove('hidden');
    (el as HTMLInputElement).disabled = false;
    (el as HTMLElement).removeAttribute('title');
  });
}

export function clearOrbisSessionState(): void {
  setCurrentUserAccess(null, 'user');
  window.EMPLOYEES = [];
  window.ALL_EMPLOYEES = [];
  window.currentEmployeeRoster = [];
  window.currentFilteredEmployees = [];
  applyAdminDashboardView();
}

export function applySupervisorDashboardView(): void {
  if (!isSupervisorUser()) return;

  applyAdminDashboardView();

  const name =
    currentUserAccess?.display_name || currentUserAccess?.supervisor_name || 'Supervisor';

  const currentView = String(window.currentMainView || 'dashboardView');
  const title = safeGet('dashboardTitle');
  if (title && currentView === 'dashboardView') {
    title.textContent = `${name}'s Team Dashboard`;
  }

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
  if (reviewsLabel) reviewsLabel.textContent = 'My Stay Interviews Due';

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
      const risk = riskMap[key] as {
        lowReview?: boolean;
        manualReason?: string;
        disciplineRisk?: boolean;
      } | undefined;
      return (
        risk &&
        (risk.lowReview ||
          Boolean(String(risk.manualReason || '').trim()) ||
          risk.disciplineRisk)
      );
    }).length;

    const teamCount = employees.filter((e: EmployeeLike) => {
      if (typeof window.isActiveDashboardEmployee === 'function') {
        return window.isActiveDashboardEmployee(e);
      }
      const status = String(e.status || e.displayStatus || '')
        .trim()
        .toUpperCase();
      return status === 'ACTIVE' || status === 'LEAVE';
    }).length;

    banner.textContent = `You have ${teamCount} active team member${teamCount === 1 ? '' : 's'}. ${atRisk} may need attention.`;
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
        '#deleteEmployeeBtn, #terminateEmployeeBtn, .delete-btn, .danger-delete, [data-delete-review-id], [data-admin-only="true"]'
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
      'employeeIdInput',
      'empStatus',
      'status',
      'employeeStatusInput',
      'empFirstName',
      'firstName',
      'employeeFirstName',
      'employeeFirstNameInput',
      'empLastName',
      'lastName',
      'employeeLastName',
      'employeeLastNameInput',
      'empDepartment',
      'department',
      'employeeDepartment',
      'employeeDepartmentInput',
      'empPosition',
      'position',
      'employeePosition',
      'employeePositionInput',
      'empSupervisor',
      'supervisor',
      'employeeSupervisor',
      'employeeSupervisorInput',
      'empPayType',
      'payType',
      'employeePayTypeInput',
      'empStandardHours',
      'standardHours',
      'employeeStandardHoursInput',
      'empBenefitsStatus',
      'benefitsStatus',
      'employeeBenefitsStatusInput',
      'empHireDate',
      'hireDate',
      'employeeHireDateInput',
      'employeeTerminationDateInput',
      'employeeTerminationDate',
      'empTerminationDate',
      'terminationDate',
      'empNextReviewDate',
      'nextReviewDate',
      'employeeNextReviewInput',
      'empAnniversaryDate',
      'anniversaryDate',
      'employeeAnniversaryDateInput',
      'empTenureBracket',
      'tenureBracket',
      'employeeTenureBracketInput',
      'empWorkEmail',
      'workEmail',
      'employeeWorkEmailInput',
      'empPersonalEmail',
      'personalEmail',
      'employeePersonalEmailInput',
      'empPhone',
      'phone',
      'empNotes',
      'notes',
      'atRiskReasonInput',
      'impactPlayerReasonInput',
    ];

    employeeAdminFieldIds.forEach((id) => {
      const field = safeGet(id) as HTMLInputElement | null;
      if (!field) return;
      field.disabled = true;
      field.readOnly = true;
      field.title = 'Locked: supervisors cannot edit core employee profile fields';
    });

    const adminPanel = document.getElementById('tab-employee');
    adminPanel
      ?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea'
      )
      .forEach((field) => {
        field.disabled = true;
        field.readOnly = true;
        field.title = 'Locked: supervisors cannot edit core employee profile fields';
      });

    ['markAtRiskBtn', 'clearAtRiskBtn', 'markImpactPlayerBtn', 'clearImpactPlayerBtn'].forEach(
      (id) => {
        const btn = safeGet(id) as HTMLButtonElement | null;
        if (!btn) return;
        btn.disabled = true;
        btn.classList.add('hidden');
        btn.title = 'Locked: supervisors cannot change HR flags';
      }
    );

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
  } else {
    const saveEmployeeBtn = safeGet('saveEmployeeBtn') as HTMLButtonElement | null;
    if (saveEmployeeBtn) {
      saveEmployeeBtn.classList.remove('hidden');
      saveEmployeeBtn.disabled = false;
      saveEmployeeBtn.removeAttribute('title');
    }

    const newEmployeeBtn =
      (safeGet('newEmployeeBtn') as HTMLButtonElement | null) ||
      (document.querySelector(
        "button[onclick='openNewEmployeeForm()']"
      ) as HTMLButtonElement | null);

    if (newEmployeeBtn) {
      newEmployeeBtn.classList.remove('hidden');
      newEmployeeBtn.disabled = false;
      newEmployeeBtn.removeAttribute('title');
    }

    const adminPanel = document.getElementById('tab-employee');
    adminPanel
      ?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea'
      )
      .forEach((field) => {
        field.disabled = false;
        field.readOnly = false;
        field.removeAttribute('title');
      });

    ['markAtRiskBtn', 'clearAtRiskBtn', 'markImpactPlayerBtn', 'clearImpactPlayerBtn'].forEach(
      (id) => {
        const btn = safeGet(id) as HTMLButtonElement | null;
        if (!btn) return;
        btn.disabled = false;
        btn.classList.remove('hidden');
        btn.removeAttribute('title');
      }
    );
  }

  applyRoleLocks();
  applyPerformanceReviewTabAccess(currentEmployee as EmployeeLike | null | undefined);

  if (typeof window.applyAttendanceAccess === 'function') {
    window.applyAttendanceAccess();
  }

  if (typeof window.applyHrInboxAccess === 'function') {
    window.applyHrInboxAccess();
  }

  if (typeof window.applyLeaveAccess === 'function') {
    window.applyLeaveAccess();
  }

  applyRoleNavigation();

  if (isEmployeeUser()) {
    applyEmployeePortalView();
  }
}

function applyPerformanceReviewTabAccess(employee?: EmployeeLike | null): void {
  const allowed = canAccessPerformanceReviews(employee);
  const drawer = document.getElementById('employeeDrawer');
  const tabBtn = drawer?.querySelector<HTMLButtonElement>('[data-tab="reviews"]');
  const panel = document.getElementById('tab-reviews');
  const wasOnReviewsTab =
    tabBtn?.getAttribute('aria-selected') === 'true' || tabBtn?.classList.contains('active');

  if (tabBtn) {
    tabBtn.classList.toggle('hidden', !allowed);
    tabBtn.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    if (!allowed) {
      tabBtn.classList.remove('active');
      tabBtn.setAttribute('aria-selected', 'false');
      tabBtn.tabIndex = -1;
    }
  }

  if (panel) {
    if (!allowed) {
      panel.classList.remove('active');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  if (!allowed && wasOnReviewsTab && typeof window.activateDrawerTab === 'function') {
    window.activateDrawerTab('employee', 'profile', false);
  }
}

declare global {
  interface Window {
    currentUserRole?: string;
    currentUserAccess?: UserAccessRow | null;
    getUserRole?: () => Promise<string | null>;
    isAdminUser?: () => boolean;
    canManageEmployeeRecords?: () => boolean;
    isSupervisorUser?: () => boolean;
    canAccessPerformanceReviews?: (employee?: EmployeeLike | null) => boolean;
    employeeMatchesSupervisorAccess?: (employee: EmployeeLike) => boolean;
    applyAdminDashboardView?: () => void;
    applySupervisorDashboardView?: () => void;
    clearOrbisSessionState?: () => void;
    currentFilteredEmployees?: unknown[];
    isActiveDashboardEmployee?: (employee: EmployeeLike) => boolean;
    applyRoleLocks?: () => void;
    applyRolePermissions?: () => void;
    ensureDeleteEmployeeButton?: () => HTMLButtonElement | null;
    runDeleteEmployee?: () => void;
    runTerminateEmployee?: () => void;
    isCreatingEmployee?: boolean;
    currentEmergencyContactId?: string | null;
    applyAttendanceAccess?: () => void;
    applyHrInboxAccess?: () => void;
    applyLeaveAccess?: () => void;
    applyEmployeePortalView?: () => void;
    applyRoleNavigation?: () => void;
    canAccessOrbisApp?: () => boolean;
    canAccessAppSection?: (sectionId: string) => boolean;
    isEmployeeUser?: () => boolean;
    getLinkedEmployeeId?: () => string;
    loadMyTimeOffPortal?: () => Promise<void>;
    loadHrInbox?: (force?: boolean) => Promise<void>;
    getHrInboxItems?: () => import('./hrInbox').HrInboxItem[];
    __hrInboxCache?: import('./hrInbox').HrInboxItem[];
  }
}

window.currentUserRole = currentUserRole;
window.currentUserAccess = currentUserAccess;
window.getUserRole = getUserRole;
window.isAdminUser = isAdminUser;
window.canManageEmployeeRecords = canManageEmployeeRecords;
window.isSupervisorUser = isSupervisorUser;
window.isEmployeeUser = isEmployeeUser;
window.canAccessOrbisApp = canAccessOrbisApp;
window.canAccessAppSection = canAccessAppSection;
window.applyRoleNavigation = applyRoleNavigation;
window.getLinkedEmployeeId = getLinkedEmployeeId;
window.applyEmployeePortalView = applyEmployeePortalView;
window.canAccessPerformanceReviews = canAccessPerformanceReviews;
window.employeeMatchesSupervisorAccess = employeeMatchesSupervisorAccess;
window.applyAdminDashboardView = applyAdminDashboardView;
window.applySupervisorDashboardView = applySupervisorDashboardView;
window.clearOrbisSessionState = clearOrbisSessionState;
window.applyRoleLocks = applyRoleLocks;
window.applyRolePermissions = applyRolePermissions;
window.ensureDeleteEmployeeButton = ensureDeleteEmployeeButton;
