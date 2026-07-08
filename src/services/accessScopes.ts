// Supervisor scoping, roster indexes, and per-employee permission checks.
import { instanceConfig, BTW_DEFAULT_ORG_WIDE_DISCIPLINE_EMAILS, BTW_DEFAULT_ORG_WIDE_SCOPE_EMAILS } from '../config/instanceConfig';
import { supabaseClient } from './supabaseClient';
import {
  type EmployeeLike,
  type UserAccessRow,
  hasExplicitSupervisorScope,
  parseSupervisedEmployeeIds,
} from './accessTypes';
import { supervisorNameMatches } from './supervisorNameMatch';

export { supervisorNameMatches };
import {
  getCurrentUserAccess,
  isAdminUser,
  isSupervisorUser,
} from './accessState';

function emailSet(emails: readonly string[]): Set<string> {
  return new Set(emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean));
}

/** HR leadership with org-wide performance review, attendance, and related scope. */
export function getOrgWideScopeEmails(): Set<string> {
  return emailSet(instanceConfig().orgWideScopeEmails);
}

/** Org-wide discipline dashboards and cross-team discipline CRUD. */
export function getOrgWideDisciplineEmails(): Set<string> {
  return emailSet(instanceConfig().orgWideDisciplineEmails);
}

/** @deprecated Use getOrgWideScopeEmails() — env-driven via VITE_ORG_WIDE_SCOPE_EMAILS. */
export const PERFORMANCE_REVIEW_EXECUTIVE_NOTIFY_EMAILS = emailSet(
  BTW_DEFAULT_ORG_WIDE_SCOPE_EMAILS
);

/** @deprecated Use getOrgWideDisciplineEmails() — env-driven via VITE_ORG_WIDE_DISCIPLINE_EMAILS. */
export const ORG_WIDE_DISCIPLINE_EMAILS = emailSet(BTW_DEFAULT_ORG_WIDE_DISCIPLINE_EMAILS);

/** @deprecated Use getOrgWideDisciplineEmails() */
export const DISCIPLINE_REPORTS_VIEWER_EMAIL = 'matthew.zinni@btwglobal.com';

/** Only this account may manually add/subtract banked PTO baseline hours. */
export const PTO_BALANCE_EDITOR_EMAIL = 'matthew.zinni@btwglobal.com';

/** @deprecated Use getOrgWideScopeEmails() */
export const ATTENDANCE_ORG_WIDE_EMAILS = PERFORMANCE_REVIEW_EXECUTIVE_NOTIFY_EMAILS;

export function getCurrentAuthEmail(): string {
  const accessEmail = String(getCurrentUserAccess()?.email || '').trim().toLowerCase();
  if (accessEmail) return accessEmail;

  if (typeof window === 'undefined') return '';
  return String((window as { currentUserEmail?: string }).currentUserEmail || '')
    .trim()
    .toLowerCase();
}

/** Manual banked-PTO adjustments are restricted to Matthew only. */
export function canAdjustPtoBalance(): boolean {
  return getCurrentAuthEmail() === PTO_BALANCE_EDITOR_EMAIL;
}

export function hasOrgWideDisciplineAccess(): boolean {
  return getOrgWideDisciplineEmails().has(getCurrentAuthEmail());
}

/** @deprecated Use hasOrgWideDisciplineAccess for org-wide feeds. */
export function canViewDisciplineReports(): boolean {
  return hasOrgWideDisciplineAccess();
}

/** Direct reports for discipline (supervisors + scoped admins). Matthew sees everyone. */
export function employeeMatchesDisciplineScope(
  employee: EmployeeLike | null | undefined
): boolean {
  if (!isAdminUser() && !isSupervisorUser()) return false;
  if (hasOrgWideDisciplineAccess()) return true;

  const access = getCurrentUserAccess();
  if (hasExplicitSupervisorScope(access)) {
    const scopedIds = parseSupervisedEmployeeIds(access);
    const empId = String(employee?.id || employee?.dbId || '')
      .trim()
      .toLowerCase();
    return Boolean(empId) && scopedIds.includes(empId);
  }

  const supervisorNames = [
    String(access?.supervisor_name || '').trim(),
    String(access?.display_name || '').trim(),
  ].filter(Boolean);

  const employeeSupervisor = String(employee?.supervisor || employee?.displaySupervisor || '');
  if (!employeeSupervisor || !supervisorNames.length) return false;

  return supervisorNames.some((name) => supervisorNameMatches(employeeSupervisor, name));
}

export function canAccessDisciplineForEmployee(employee?: EmployeeLike | null): boolean {
  if (Boolean(window.isCreatingEmployee)) return false;

  if (!isAdminUser() && !isSupervisorUser()) return false;

  const target =
    employee ?? (window.currentEmployee as EmployeeLike | null | undefined) ?? null;
  return employeeMatchesDisciplineScope(target);
}

export function canQueryDisciplineReports(): boolean {
  return hasOrgWideDisciplineAccess() || isAdminUser() || isSupervisorUser();
}

export function canEmailSupervisorsPerformanceReviews(): boolean {
  return getOrgWideScopeEmails().has(getCurrentAuthEmail());
}

export function employeeMatchesSupervisorAccess(employee: EmployeeLike | null | undefined): boolean {
  if (!isSupervisorUser()) return true;

  const access = getCurrentUserAccess();
  if (hasExplicitSupervisorScope(access)) {
    const scopedIds = parseSupervisedEmployeeIds(access);
    const empId = String(employee?.id || employee?.dbId || '')
      .trim()
      .toLowerCase();
    return Boolean(empId) && scopedIds.includes(empId);
  }

  const supervisorName = String(access?.supervisor_name || '')
    .trim()
    .toLowerCase();

  if (!supervisorName) {
    console.warn(
      '[Supervisor Match Fail] No supervisor_name on currentUserAccess:',
      access
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

/** Org-wide performance review visibility (HR leadership only). */
export function hasOrgWidePerformanceReviewAccess(): boolean {
  return canEmailSupervisorsPerformanceReviews();
}

/** Direct reports for performance reviews (supervisors + department-head admins). */
export function employeeMatchesPerformanceReviewScope(
  employee: EmployeeLike | null | undefined
): boolean {
  if (!isAdminUser() && !isSupervisorUser()) return false;
  if (hasOrgWidePerformanceReviewAccess()) return true;

  const access = getCurrentUserAccess();
  if (hasExplicitSupervisorScope(access)) {
    const scopedIds = parseSupervisedEmployeeIds(access);
    const empId = String(employee?.id || employee?.dbId || '')
      .trim()
      .toLowerCase();
    return Boolean(empId) && scopedIds.includes(empId);
  }

  const supervisorNames = [
    String(access?.supervisor_name || '').trim(),
    String(access?.display_name || '').trim(),
  ].filter(Boolean);

  const employeeSupervisor = String(employee?.supervisor || employee?.displaySupervisor || '');
  if (!employeeSupervisor || !supervisorNames.length) return false;

  return supervisorNames.some((name) => supervisorNameMatches(employeeSupervisor, name));
}

/** Org-wide attendance roll call (Matthew, Trent, Brent only). */
export function hasOrgWideAttendanceAccess(): boolean {
  return canEmailSupervisorsPerformanceReviews();
}

/** Attendance: org-wide leaders see everyone; filtered admins and supervisors see direct reports only. */
export function employeeMatchesAttendanceScope(
  employee: EmployeeLike | null | undefined
): boolean {
  if (!isAdminUser() && !isSupervisorUser()) return false;
  if (hasOrgWideAttendanceAccess()) return true;
  return employeeMatchesPerformanceReviewScope(employee);
}

/** Performance reviews: HR leadership org-wide; other admins/supervisors direct reports only. */
export function canAccessPerformanceReviews(employee?: EmployeeLike | null): boolean {
  if (Boolean(window.isCreatingEmployee)) return false;

  if (!isAdminUser() && !isSupervisorUser()) return false;

  const target =
    employee ?? (window.currentEmployee as EmployeeLike | null | undefined) ?? null;
  return employeeMatchesPerformanceReviewScope(target);
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

type RosterEmployeeForTeam = {
  id?: string;
  supervisor?: string;
  status?: string;
};

function isActiveRosterEmployee(row: RosterEmployeeForTeam): boolean {
  const status = String(row.status || '')
    .trim()
    .toUpperCase();
  return status !== 'TERMINATED' && status !== 'INACTIVE';
}

/** Employee ids whose roster supervisor field matches this supervisor name. */
export function resolveDirectReportIdsFromRoster(
  supervisorName: string,
  employees: RosterEmployeeForTeam[]
): string[] {
  const needle = String(supervisorName || '').trim();
  if (!needle || !employees.length) return [];

  return employees
    .filter((row) => isActiveRosterEmployee(row))
    .filter((row) => supervisorNameMatches(String(row.supervisor || ''), needle))
    .map((row) => String(row.id || '').trim())
    .filter(Boolean);
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

  return resolveDirectReportIdsFromRoster(needle, data as RosterEmployeeForTeam[]);
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

export type EmployeeRosterIndex = {
  activeEmployees: RosterEmployeeForTeam[];
  supervisorByEmployeeId: Map<string, string>;
  supervisorByEmail: Map<string, string>;
  rosterNameByEmployeeId: Map<string, string>;
};

export type EmployeeSupervisorLookup = {
  byEmployeeId: Map<string, string>;
  byEmail: Map<string, string>;
};

/** Roster fields used for admin user-access supervisor + team columns. */
export async function loadEmployeeRosterIndex(): Promise<EmployeeRosterIndex> {
  const activeEmployees: RosterEmployeeForTeam[] = [];
  const supervisorByEmployeeId = new Map<string, string>();
  const supervisorByEmail = new Map<string, string>();
  const rosterNameByEmployeeId = new Map<string, string>();

  const { data, error } = await supabaseClient
    .from('employees')
    .select('id, supervisor, status, first_name, last_name, work_email, personal_email');

  if (error) {
    console.warn('[Access] Could not load employee roster index:', error);
    return {
      activeEmployees,
      supervisorByEmployeeId,
      supervisorByEmail,
      rosterNameByEmployeeId,
    };
  }

  (data || []).forEach((row) => {
    const employeeId = String((row as { id?: string }).id || '').trim();
    const employeeKey = employeeId.toLowerCase();
    const supervisor = String((row as { supervisor?: string }).supervisor || '').trim();
    const rosterName =
      `${String((row as { first_name?: string }).first_name || '').trim()} ${String((row as { last_name?: string }).last_name || '').trim()}`.trim();

    if (employeeKey && rosterName) {
      rosterNameByEmployeeId.set(employeeKey, rosterName);
    }

    if (employeeKey && supervisor) {
      supervisorByEmployeeId.set(employeeKey, supervisor);
    }

    const emails = [
      (row as { work_email?: string }).work_email,
      (row as { personal_email?: string }).personal_email,
    ];
    emails.forEach((value) => {
      const email = String(value || '').trim().toLowerCase();
      if (email && supervisor) supervisorByEmail.set(email, supervisor);
    });

    if (isActiveRosterEmployee(row as RosterEmployeeForTeam)) {
      activeEmployees.push({
        id: employeeId,
        supervisor,
        status: String((row as { status?: string }).status || ''),
      });
    }
  });

  return {
    activeEmployees,
    supervisorByEmployeeId,
    supervisorByEmail,
    rosterNameByEmployeeId,
  };
}

/** Supervisor on file (employees.supervisor) keyed by roster id and login email. */
export async function loadEmployeeSupervisorLookup(): Promise<EmployeeSupervisorLookup> {
  const index = await loadEmployeeRosterIndex();
  return {
    byEmployeeId: index.supervisorByEmployeeId,
    byEmail: index.supervisorByEmail,
  };
}

/** Manager name from the employee roster record linked to this login. */
export function resolveEmployeeFileSupervisor(
  row: UserAccessRow | null | undefined,
  index: EmployeeRosterIndex | null | undefined
): string {
  if (!row || !index) return '';

  const linkedId = String(row.linked_employee_id || '')
    .trim()
    .toLowerCase();
  if (linkedId && index.supervisorByEmployeeId.has(linkedId)) {
    return index.supervisorByEmployeeId.get(linkedId) || '';
  }

  const email = String(row.email || '')
    .trim()
    .toLowerCase();
  if (email && index.supervisorByEmail.has(email)) {
    return index.supervisorByEmail.get(email) || '';
  }

  return '';
}

/** Roster name used to match employees.supervisor for direct-report team IDs. */
export function resolveSupervisorRosterName(
  row: UserAccessRow | null | undefined,
  index: EmployeeRosterIndex | null | undefined
): string {
  if (!row || !index) return '';

  const linkedId = String(row.linked_employee_id || '')
    .trim()
    .toLowerCase();
  if (linkedId && index.rosterNameByEmployeeId.has(linkedId)) {
    return index.rosterNameByEmployeeId.get(linkedId) || '';
  }

  return String(row.supervisor_name || row.display_name || '').trim();
}

/** Direct-report BTW ids from roster (supervisor role only). */
export function resolveTeamIdsForAccessRow(
  row: UserAccessRow | null | undefined,
  index: EmployeeRosterIndex | null | undefined
): string[] {
  if (!row || !index) return [];

  const role = String(row.role || 'user')
    .trim()
    .toLowerCase();
  if (role !== 'supervisor') return [];

  const rosterName = resolveSupervisorRosterName(row, index);
  if (!rosterName) return [];

  return resolveDirectReportIdsFromRoster(rosterName, index.activeEmployees);
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

// Re-export for backward compatibility with existing import sites.
export { parseSupervisedEmployeeIds };
