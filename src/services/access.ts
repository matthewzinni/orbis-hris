// ============================================
// User access / role scoping (from js/app.js)
// ============================================

import { applyPayrollReliefLinks } from '../brand/payrollPortal';
import { supabaseClient } from './supabaseClient';

export type UserAccessRow = {
  email?: string;
  display_name?: string;
  role?: string;
  supervisor_name?: string;
  /** When non-empty, supervisor roster + RLS are limited to these employees.id values. */
  supervised_employee_ids?: string[] | null;
  /** employees.id for role=user (self-service PTO portal). */
  linked_employee_id?: string | null;
  can_delete?: boolean;
  approval_status?: 'pending' | 'approved' | 'rejected' | string;
};

export type OrbisAccessState = 'approved' | 'pending' | 'rejected' | 'none';

function normalizeOrbisRole(role: string): string {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'employee') return 'user';
  return value;
}

export function getAccessApprovalStatus(
  row: UserAccessRow | null | undefined
): OrbisAccessState {
  const status = String(row?.approval_status || 'approved').trim().toLowerCase();
  if (status === 'pending') return 'pending';
  if (status === 'rejected') return 'rejected';
  if (status === 'approved') return 'approved';
  return 'none';
}

/** Leadership emails that must remain admin (not employee portal). */
export const LEADERSHIP_ADMIN_EMAILS = new Set([
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
]);

const EMPLOYEE_PORTAL_SECTIONS = new Set([
  'myProfileView',
  'myTasksView',
  'myDirectoryView',
  'myTimeOffView',
]);

/** Employee-portal sections admins may use alongside full HRIS access. */
const ADMIN_PORTAL_SECTIONS = new Set(['myTasksView', 'myDirectoryView']);

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
    'email, display_name, role, supervisor_name, supervised_employee_ids, linked_employee_id, can_delete, approval_status';

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

    const accessRow = await fetchUserAccessRowForEmail(userEmail);

    if (accessRow) {
      currentUserAccess = accessRow;
      const approval = getAccessApprovalStatus(accessRow);

      if (approval === 'pending') {
        currentUserRole = 'pending';
        window.currentUserRole = currentUserRole;
        window.currentUserAccess = currentUserAccess;
        return 'pending';
      }

      if (approval === 'rejected') {
        currentUserRole = 'rejected';
        window.currentUserRole = currentUserRole;
        window.currentUserAccess = currentUserAccess;
        return 'rejected';
      }

      const accessRole = normalizeOrbisRole(String(accessRow.role || ''));
      if (accessRole === 'admin' || accessRole === 'supervisor' || accessRole === 'user') {
        currentUserRole = accessRole;
        window.currentUserRole = currentUserRole;
        window.currentUserAccess = currentUserAccess;
        await ensureLinkedEmployeeRecord();
        if (accessRole === 'supervisor') {
          await ensureSupervisorEmployeeScope();
        }
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

/** PTO portal role (user = self-service time off only). */
export function isEmployeeUser(): boolean {
  return normalizeOrbisRole(currentUserRole) === 'user';
}

export function isPortalUser(): boolean {
  return isEmployeeUser();
}

/** Self-service profile / tasks / PTO for employees and supervisors linked to a roster record. */
export function hasPersonalEmployeePortal(): boolean {
  if (isEmployeeUser()) return true;
  if (!getLinkedEmployeeId()) return false;
  return isSupervisorUser();
}

export async function ensureLinkedEmployeeRecord(): Promise<string | null> {
  const existing = getLinkedEmployeeId();
  if (existing) return existing;

  if (!currentUserAccess) return null;

  const role = normalizeOrbisRole(String(currentUserAccess.role || ''));
  if (role !== 'user' && role !== 'supervisor' && role !== 'admin') return null;

  const { data, error } = await supabaseClient.rpc('orbis_link_my_employee_record');

  if (error) {
    console.warn('[Access] Could not link employee record:', error.message || error);
    return null;
  }

  const employeeId = String(data || '').trim();
  if (employeeId) {
    currentUserAccess.linked_employee_id = employeeId;
    window.currentUserAccess = currentUserAccess;
  }

  return employeeId || null;
}

/** Refresh explicit supervisor team ids from roster supervisor field when a stale list exists. */
export async function ensureSupervisorEmployeeScope(): Promise<string[] | null> {
  if (!isSupervisorUser() || !currentUserAccess) return null;

  const current = parseSupervisedEmployeeIds(currentUserAccess);
  if (!current.length) return null;

  const { data, error } = await supabaseClient.rpc('orbis_sync_my_supervisor_scope');

  if (error) {
    console.warn('[Access] Could not sync supervisor scope:', error.message || error);
    return null;
  }

  const synced = Array.isArray(data)
    ? data.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  if (synced.length) {
    currentUserAccess.supervised_employee_ids = synced;
    window.currentUserAccess = currentUserAccess;
  }

  return synced.length ? synced : null;
}

export function canAccessOrbisApp(): boolean {
  return isAdminUser() || isSupervisorUser() || isPortalUser();
}

export function canAccessAppSection(sectionId: string): boolean {
  const section = String(sectionId || '').trim();
  if (!section) return false;

  if (isPortalUser()) {
    return EMPLOYEE_PORTAL_SECTIONS.has(section);
  }

  if (isAdminUser()) {
    if (ADMIN_PORTAL_SECTIONS.has(section)) return true;
    return !EMPLOYEE_PORTAL_SECTIONS.has(section);
  }

  if (isSupervisorUser()) {
    if (EMPLOYEE_PORTAL_SECTIONS.has(section) && hasPersonalEmployeePortal()) return true;
    if (EMPLOYEE_PORTAL_SECTIONS.has(section)) return false;
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

  document.querySelectorAll<HTMLElement>('[data-personal-portal-link]').forEach((element) => {
    const sectionId = String(element.dataset.navView || '').trim();
    const allowed = sectionId ? canAccessAppSection(sectionId) : hasPersonalEmployeePortal();
    element.classList.toggle('hidden', !allowed);
  });

  if (role === 'admin') {
    document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
      (el as HTMLElement).classList.remove('hidden');
      (el as HTMLInputElement).disabled = false;
    });
  }

  if (typeof window.refreshMobileNavigation === 'function') {
    window.refreshMobileNavigation();
  }
}

export function getLinkedEmployeeId(): string {
  return String(currentUserAccess?.linked_employee_id || '').trim();
}

export function applyEmployeePortalView(): void {
  if (!isEmployeeUser()) return;

  document.getElementById('supervisorBanner')?.remove();

  const name = currentUserAccess?.display_name || 'My Profile';
  const title = safeGet('dashboardTitle');
  if (title) title.textContent = name;

  document.querySelectorAll('.orbis-sidebar-nav .orbis-nav-item').forEach((button) => {
    const view = String((button as HTMLElement).dataset.navView || '');
    const allowed = EMPLOYEE_PORTAL_SECTIONS.has(view);
    (button as HTMLElement).classList.toggle('hidden', !allowed);
    (button as HTMLButtonElement).disabled = !allowed;
    if (!allowed) {
      button.classList.remove('active');
      button.removeAttribute('aria-current');
    }
  });

  const myProfileNav = document.getElementById('navMyProfile');
  if (myProfileNav) {
    myProfileNav.classList.add('active');
    myProfileNav.setAttribute('aria-current', 'page');
  }

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

/** Employee Admin tab + flags: admins always; supervisors only for their direct reports. */
export function canEditEmployeeAdmin(employee?: EmployeeLike | null): boolean {
  if (Boolean(window.isCreatingEmployee)) return false;

  if (isAdminUser()) return true;

  if (isSupervisorUser()) {
    const target =
      employee ?? (window.currentEmployee as EmployeeLike | null | undefined) ?? null;
    return employeeMatchesSupervisorAccess(target);
  }

  return false;
}

const EMPLOYEE_ADMIN_FIELD_IDS = [
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

const EMPLOYEE_ID_FIELD_IDS = [
  'empId',
  'employeeId',
  'empEmployeeId',
  'employeeIdInput',
];

const EMPLOYEE_FLAG_BUTTON_IDS = [
  'markAtRiskBtn',
  'clearAtRiskBtn',
  'markImpactPlayerBtn',
  'clearImpactPlayerBtn',
];

function setEmployeeAdminFieldsLocked(locked: boolean, lockTitle: string): void {
  const lockMessage =
    lockTitle ||
    'Locked: you can only edit employee admin for people on your team';

  EMPLOYEE_ADMIN_FIELD_IDS.forEach((id) => {
    const field = safeGet(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!field) return;
    field.disabled = locked;
    field.readOnly = locked;
    if (locked) {
      field.title = lockMessage;
    } else {
      field.removeAttribute('title');
    }
  });

  const adminPanel = document.getElementById('tab-employee');
  adminPanel
    ?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea'
    )
    .forEach((field) => {
      field.disabled = locked;
      field.readOnly = locked;
      if (locked) {
        field.title = lockMessage;
      } else {
        field.removeAttribute('title');
      }
    });
}

function setSupervisorEmployeeIdFieldsLocked(): void {
  if (!isSupervisorUser()) return;

  const lockMessage = 'Employee ID can only be changed by HR administrators';
  EMPLOYEE_ID_FIELD_IDS.forEach((id) => {
    const field = safeGet(id) as HTMLInputElement | null;
    if (!field) return;
    field.disabled = true;
    field.readOnly = true;
    field.title = lockMessage;
  });
}

function setEmployeeFlagButtonsLocked(locked: boolean, lockTitle: string): void {
  const lockMessage =
    lockTitle || 'Locked: you can only change flags for people on your team';

  EMPLOYEE_FLAG_BUTTON_IDS.forEach((id) => {
    const btn = safeGet(id) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = locked;
    btn.classList.toggle('hidden', locked);
    if (locked) {
      btn.title = lockMessage;
    } else {
      btn.removeAttribute('title');
    }
  });
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

  const employeeSupervisor = String(employee?.supervisor || employee?.displaySupervisor || '');

  if (!employeeSupervisor) {
    console.warn('[Supervisor Match Fail] No supervisor on employee:', employee);
    return false;
  }

  return supervisorNameMatches(employeeSupervisor, supervisorName);
}

export function applyAdminDashboardView(): void {
  document.getElementById('supervisorBanner')?.remove();
  window.applyManagerHomeAccess?.();

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

  window.applyManagerHomeAccess?.();

  const existingBanner = document.getElementById('supervisorBanner');
  if (!existingBanner && !document.getElementById('managerHomeCard')) {
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

  applyAddEmployeeAsCandidateAccess();
}

export function applyAddEmployeeAsCandidateAccess(): void {
  const section = safeGet('employeeInternalMobilitySection');
  const button = safeGet('addEmployeeAsCandidateBtn') as HTMLButtonElement | null;
  if (!section && !button) return;

  const show =
    isAdminUser() &&
    !Boolean(window.isCreatingEmployee) &&
    Boolean(window.currentEmployee);

  if (section) {
    section.classList.toggle('hidden', !show);
  }

  if (button) {
    button.classList.toggle('hidden', !show);
    button.disabled = !show;
    if (show) {
      button.removeAttribute('title');
    } else {
      button.title = isAdminUser()
        ? 'Open a saved employee record to add them as a candidate'
        : 'Admin access required';
    }
  }
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
        '#deleteEmployeeBtn, #terminateEmployeeBtn, #addEmployeeAsCandidateBtn, #employeeInternalMobilitySection, .delete-btn, .danger-delete, [data-delete-review-id], [data-admin-only="true"]'
      )
      .forEach((el) => {
        (el as HTMLElement).classList.add('hidden');
        (el as HTMLInputElement).disabled = true;
        (el as HTMLElement).title =
          'Locked: supervisors cannot delete or terminate records';
      });

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
  }

  const canEditAdmin = canEditEmployeeAdmin(currentEmployee as EmployeeLike | null | undefined);
  const saveEmployeeBtn = safeGet('saveEmployeeBtn') as HTMLButtonElement | null;

  if (canEditAdmin) {
    setEmployeeAdminFieldsLocked(false, '');
    setEmployeeFlagButtonsLocked(false, '');
    setSupervisorEmployeeIdFieldsLocked();

    if (saveEmployeeBtn) {
      saveEmployeeBtn.classList.remove('hidden');
      saveEmployeeBtn.disabled = false;
      saveEmployeeBtn.removeAttribute('title');
    }
  } else {
    setEmployeeAdminFieldsLocked(
      true,
      supervisorMode
        ? 'Locked: you can only edit employee admin for people on your team'
        : 'Locked: admin access required'
    );
    setEmployeeFlagButtonsLocked(
      true,
      supervisorMode
        ? 'Locked: you can only change flags for people on your team'
        : 'Locked: admin access required'
    );

    if (saveEmployeeBtn) {
      saveEmployeeBtn.disabled = true;
      saveEmployeeBtn.classList.add('hidden');
      saveEmployeeBtn.title = supervisorMode
        ? 'Locked: you can only edit employee admin for people on your team'
        : 'Locked: admin access required';
    }
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
  applyPayrollReliefLinks();

  if (isPortalUser()) {
    applyEmployeePortalView();
  }
}

function supervisorNameMatches(rosterSupervisor: string, accessSupervisor: string): boolean {
  const supervisorName = String(accessSupervisor || '').trim().toLowerCase();
  const employeeSupervisor = String(rosterSupervisor || '').trim().toLowerCase();

  if (!supervisorName || !employeeSupervisor) return false;

  const compactAccessName = supervisorName.replace(/[^a-z0-9]/g, '');
  const compactEmployeeSupervisor = employeeSupervisor.replace(/[^a-z0-9]/g, '');

  return (
    employeeSupervisor.includes(supervisorName) ||
    supervisorName.includes(employeeSupervisor) ||
    compactEmployeeSupervisor.includes(compactAccessName) ||
    compactAccessName.includes(compactEmployeeSupervisor)
  );
}

/** Employee ids whose roster supervisor field matches this supervisor name. */
export async function resolveDirectReportIdsForSupervisorName(
  supervisorName: string
): Promise<string[]> {
  const needle = String(supervisorName || '').trim();
  if (!needle) return [];

  const { data, error } = await supabaseClient
    .from('employees')
    .select('id, supervisor, status');

  if (error || !data?.length) return [];

  return data
    .filter((row) => {
      const status = String((row as { status?: string }).status || '')
        .trim()
        .toUpperCase();
      if (status === 'TERMINATED' || status === 'INACTIVE') return false;
      return supervisorNameMatches(String((row as { supervisor?: string }).supervisor || ''), needle);
    })
    .map((row) => String((row as { id?: string }).id || '').trim())
    .filter(Boolean);
}

export async function resolveEmployeeRosterName(employeeId: string): Promise<string> {
  const id = String(employeeId || '').trim();
  if (!id) return '';

  const { data } = await supabaseClient
    .from('employees')
    .select('first_name, last_name')
    .eq('id', id)
    .maybeSingle();

  if (!data) return '';

  return `${String(data.first_name || '').trim()} ${String(data.last_name || '').trim()}`.trim();
}

/** Suggest supervisor_name + direct report ids when approving a roster supervisor. */
export async function resolveSupervisorScopeForEmployee(
  employeeId: string
): Promise<{ supervisor_name: string; supervised_employee_ids: string[] }> {
  const rosterName = await resolveEmployeeRosterName(employeeId);
  if (!rosterName) {
    return { supervisor_name: '', supervised_employee_ids: [] };
  }

  const supervised_employee_ids = await resolveDirectReportIdsForSupervisorName(rosterName);
  return { supervisor_name: rosterName, supervised_employee_ids };
}

/** Match roster employee id (BTW code) from login email for user-role PTO linking. */
export async function resolveLinkedEmployeeIdForEmail(email: string): Promise<string | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabaseClient
    .from('employees')
    .select('id, work_email, personal_email, status');

  if (error || !data?.length) {
    return null;
  }

  const matches = data.filter((row) => {
    const fields = [
      (row as { work_email?: string }).work_email,
      (row as { personal_email?: string }).personal_email,
    ];
    return fields.some((value) => String(value || '').trim().toLowerCase() === normalized);
  });

  if (!matches.length) return null;

  const active = matches.find((row) => {
    const status = String((row as { status?: string }).status || '')
      .trim()
      .toUpperCase();
    return status !== 'TERMINATED' && status !== 'INACTIVE';
  });

  const pick = active || matches[0];
  return String((pick as { id?: string }).id || '').trim() || null;
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
    canEditEmployeeAdmin?: (employee?: EmployeeLike | null) => boolean;
    employeeMatchesSupervisorAccess?: (employee: EmployeeLike) => boolean;
    applyAdminDashboardView?: () => void;
    applySupervisorDashboardView?: () => void;
    clearOrbisSessionState?: () => void;
    currentFilteredEmployees?: unknown[];
    isActiveDashboardEmployee?: (employee: EmployeeLike) => boolean;
    applyRoleLocks?: () => void;
    applyAddEmployeeAsCandidateAccess?: () => void;
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
window.canEditEmployeeAdmin = canEditEmployeeAdmin;
window.employeeMatchesSupervisorAccess = employeeMatchesSupervisorAccess;
window.applyAdminDashboardView = applyAdminDashboardView;
window.applySupervisorDashboardView = applySupervisorDashboardView;
window.clearOrbisSessionState = clearOrbisSessionState;
window.applyRoleLocks = applyRoleLocks;
window.applyAddEmployeeAsCandidateAccess = applyAddEmployeeAsCandidateAccess;
window.applyRolePermissions = applyRolePermissions;
window.ensureDeleteEmployeeButton = ensureDeleteEmployeeButton;
