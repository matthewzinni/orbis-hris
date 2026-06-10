/**
 * Virtual HR Inbox (Phase 1): aggregates actionable items from existing Orbis data.
 */

import { supabaseClient } from './supabaseClient';
import { employeeMatchesSupervisorAccess, isAdminUser, isSupervisorUser } from './access';
import {
  loadPolicyCampaignInboxAssignments,
  type PolicyCampaign,
  type PolicyCampaignAssignment,
} from './policyCampaigns';
import {
  daysUntilDate,
  employeeDisplayName,
  formatDueDateLabel,
  getEmployeeNextStayInterviewDueDate,
  isActiveDashboardEmployee,
  isStayInterviewEligibleEmployee,
  parseDueDate,
  readEmployeeNextStayInterviewDateRaw,
} from './employeeUtils';
import { isOpenDisciplineStatus, isOpenInvestigationStatus } from './hrIntelligence';
import {
  getActiveEmployees,
  getEmployeeById,
  getEmployees,
  loadEmployees,
  normalizeEmployeeStatus,
} from '../modules/employees';
import type { Investigation } from '../types/investigationsTypes';
import { normalizeInvestigationStatus } from '../types/investigationsTypes';
import {
  loadPendingPayrollHandoffs,
  payrollChangeTypeLabel,
  type PayrollHandoffRecord,
} from './payrollHandoff';
import {
  formatLeaveDateRange,
  leaveTypeLabel,
  loadPendingLeaveRequests,
  type LeaveRequestRecord,
} from './leaveRequests';

export type HrInboxSeverity = 'overdue' | 'due_soon' | 'info';

export type HrInboxKind =
  | 'stay_interview'
  | 'onboarding'
  | 'new_hire'
  | 'discipline'
  | 'investigation'
  | 'care_follow_up'
  | 'operations'
  | 'payroll_handoff'
  | 'offboarding'
  | 'leave_request'
  | 'policy_campaign';

export type HrInboxRoute =
  | { type: 'employee'; employeeId: string; drawerTab?: string }
  | { type: 'investigation'; investigationId: string }
  | { type: 'operations'; issueId: string }
  | { type: 'view'; viewId: string };

export type HrInboxItem = {
  id: string;
  kind: HrInboxKind;
  severity: HrInboxSeverity;
  title: string;
  detail: string;
  employeeName: string;
  dueDate: string | null;
  route: HrInboxRoute;
};

const DUE_SOON_DAYS = 7;
const NEW_HIRE_DAYS = 14;
const ONBOARDING_HIRE_LOOKBACK_DAYS = 90;
const OFFBOARDING_TERM_LOOKBACK_DAYS = 30;

const SEVERITY_RANK: Record<HrInboxSeverity, number> = {
  overdue: 0,
  due_soon: 1,
  info: 2,
};

const KIND_LABELS: Record<HrInboxKind, string> = {
  stay_interview: 'Stay interview',
  onboarding: 'Onboarding',
  new_hire: 'New hire',
  discipline: 'Discipline',
  investigation: 'Investigation',
  care_follow_up: 'Care follow-up',
  operations: 'Operations',
  payroll_handoff: 'Payroll handoff',
  offboarding: 'Offboarding',
  leave_request: 'Time off',
  policy_campaign: 'Policy acknowledgment',
};

type EmployeeLike = Record<string, unknown>;

function isStayInterviewEligible(employee: EmployeeLike): boolean {
  return isStayInterviewEligibleEmployee(employee);
}

function drawerEmployeeId(employee: EmployeeLike): string {
  return String(employee.id || employee.dbId || employee.employee_id || '').trim();
}

function resolveEmployee(refId: string): EmployeeLike | undefined {
  const trimmed = String(refId || '').trim();
  if (!trimmed) return undefined;

  const direct = getEmployeeById(trimmed);
  if (direct) return direct;

  return getEmployees().find((employee) => {
    const ids = [employee.employee_id, employee.displayId, employee.id, employee.dbId]
      .filter(Boolean)
      .map(String);
    return ids.includes(trimmed);
  });
}

function severityFromDays(days: number | null, fallback: HrInboxSeverity = 'info'): HrInboxSeverity {
  if (days === null) return fallback;
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due_soon';
  return 'info';
}

function isoDateFromValue(value: unknown): string | null {
  const parsed = parseDueDate(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

function compareInboxItems(left: HrInboxItem, right: HrInboxItem): number {
  const severityDiff = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
  if (severityDiff !== 0) return severityDiff;

  const leftDue = parseDueDate(left.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDue = parseDueDate(right.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;

  const nameCmp = left.employeeName.localeCompare(right.employeeName, undefined, {
    sensitivity: 'base',
  });
  if (nameCmp !== 0) return nameCmp;

  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
}

function collectStayInterviewItems(employees: EmployeeLike[]): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  employees.filter(isStayInterviewEligible).forEach((employee) => {
    const dueRaw = readEmployeeNextStayInterviewDateRaw(employee);
    const days = daysUntilDate(dueRaw);
    if (days === null) return;

    const severity = severityFromDays(days);
    if (severity === 'info') return;

    const dueDate = isoDateFromValue(dueRaw);
    const employeeId = drawerEmployeeId(employee);
    if (!employeeId) return;

    const name = employeeDisplayName(employee);
    const dueLabel = formatDueDateLabel(getEmployeeNextStayInterviewDueDate(employee), dueRaw);

    items.push({
      id: `stay:${employeeId}`,
      kind: 'stay_interview',
      severity,
      employeeName: name,
      dueDate,
      title:
        severity === 'overdue' ? `Stay interview overdue — ${name}` : `Stay interview due soon — ${name}`,
      detail:
        severity === 'overdue'
          ? `Due ${dueLabel} (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue)`
          : `Due ${dueLabel} (in ${days} day${days === 1 ? '' : 's'})`,
      route: { type: 'employee', employeeId, drawerTab: 'stay-interviews' },
    });
  });

  return items;
}

function daysSinceHire(employee: EmployeeLike): number | null {
  const daysUntilHire = daysUntilDate(employee.hire_date || employee.hireDate);
  if (daysUntilHire === null) return null;
  return -daysUntilHire;
}

function collectOnboardingItems(
  tasks: Array<{
    id: string;
    employee_id?: string;
    task_name?: string;
    status?: string;
    due_date?: string | null;
    assigned_to?: string | null;
  }>,
  employees: EmployeeLike[]
): HrInboxItem[] {
  const items: HrInboxItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hireCutoff = new Date(today);
  hireCutoff.setDate(hireCutoff.getDate() - ONBOARDING_HIRE_LOOKBACK_DAYS);

  const employeeByRosterId = new Map<string, EmployeeLike>();
  employees.forEach((employee) => {
    const keys = [employee.employee_id, employee.displayId, employee.id, employee.dbId]
      .filter(Boolean)
      .map(String);
    keys.forEach((key) => employeeByRosterId.set(key, employee));
  });

  const pendingByEmployee = new Map<
    string,
    Array<{ id: string; task_name?: string; due_date?: string | null; assigned_to?: string | null }>
  >();

  tasks.forEach((task) => {
    if (String(task.status || '').toLowerCase() === 'completed') return;

    const rosterId = String(task.employee_id || '').trim();
    if (!rosterId) return;

    const employee = employeeByRosterId.get(rosterId) || resolveEmployee(rosterId);
    if (!employee || !isActiveDashboardEmployee(employee)) return;

    const hireDate = parseDueDate(employee.hire_date || employee.hireDate);
    if (!hireDate || hireDate < hireCutoff) return;

    const drawerId = drawerEmployeeId(employee);
    if (!drawerId) return;

    const bucket = pendingByEmployee.get(drawerId) || [];
    bucket.push({
      id: task.id,
      task_name: task.task_name,
      due_date: task.due_date,
      assigned_to: task.assigned_to,
    });
    pendingByEmployee.set(drawerId, bucket);
  });

  pendingByEmployee.forEach((pendingTasks, employeeId) => {
    const employee = getEmployeeById(employeeId) || resolveEmployee(employeeId);
    if (!employee) return;

    const name = employeeDisplayName(employee);
    const daysSince = daysSinceHire(employee);
    const isNewHire =
      daysSince !== null && daysSince >= 0 && daysSince <= NEW_HIRE_DAYS;

    if (isNewHire && pendingTasks.length > 1) {
      items.push({
        id: `new-hire:${employeeId}`,
        kind: 'new_hire',
        severity: 'due_soon',
        employeeName: name,
        dueDate: isoDateFromValue(employee.hire_date || employee.hireDate),
        title: `New hire onboarding — ${name}`,
        detail: `${pendingTasks.length} tasks still open (hired ${formatDueDateLabel(parseDueDate(employee.hire_date || employee.hireDate), String(employee.hire_date || ''))})`,
        route: { type: 'employee', employeeId, drawerTab: 'onboarding' },
      });
      return;
    }

    pendingTasks.forEach((task) => {
      const taskName = String(task.task_name || 'Task').trim() || 'Pending task';
      const dueRaw = task.due_date || employee.hire_date || employee.hireDate;
      const days = daysUntilDate(dueRaw);
      const isI9 = taskName === 'I-9';
      const assignee = String(task.assigned_to || '').trim();

      items.push({
        id: `onboarding:${task.id}`,
        kind: 'onboarding',
        severity: severityFromDays(days, isNewHire ? 'due_soon' : 'info'),
        employeeName: name,
        dueDate: isoDateFromValue(dueRaw),
        title: isI9 ? `I-9 due — ${name}` : `Onboarding — ${name}`,
        detail: [
          taskName,
          assignee ? `Assigned to ${assignee === 'employee' ? 'new hire' : assignee}` : '',
          isI9 && days !== null && days < 0 ? 'Section 2 verification overdue' : '',
        ]
          .filter(Boolean)
          .join(' · '),
        route: { type: 'employee', employeeId, drawerTab: 'onboarding' },
      });
    });
  });

  return items;
}

function collectPolicyCampaignItems(
  rows: Array<PolicyCampaignAssignment & { campaign: PolicyCampaign }>,
  supervisorOnly = false
): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  rows.forEach((row) => {
    const employee = resolveEmployee(row.employee_id);
    if (!employee) return;
    if (supervisorOnly && !employeeMatchesSupervisorAccess(employee)) return;

    const employeeId = drawerEmployeeId(employee);
    if (!employeeId) return;

    const name = employeeDisplayName(employee);
    const days = daysUntilDate(row.due_date);
    const isOverdue = row.status === 'overdue' || (days !== null && days < 0);
    const campaignTitle = String(row.campaign?.title || 'Policy campaign').trim();
    const documentTitle = String(row.campaign?.document_title || '').trim();

    items.push({
      id: `policy-campaign:${row.id}`,
      kind: 'policy_campaign',
      severity: isOverdue ? 'overdue' : severityFromDays(days, 'due_soon'),
      employeeName: name,
      dueDate: isoDateFromValue(row.due_date),
      title: isOverdue ? `Policy ack overdue — ${name}` : `Policy acknowledgment — ${name}`,
      detail: [campaignTitle, documentTitle, isOverdue ? 'Escalate to employee and manager' : '']
        .filter(Boolean)
        .join(' · '),
      route: { type: 'view', viewId: 'documentsView' },
    });
  });

  return items;
}

function collectDisciplineItems(
  rows: Array<{ id?: string; employee_id?: string; issue_type?: string; report_status?: string }>
): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  rows.forEach((row) => {
    if (!isOpenDisciplineStatus(row.report_status)) return;

    const employee = resolveEmployee(String(row.employee_id || ''));
    const employeeId = employee ? drawerEmployeeId(employee) : '';
    const name = employee ? employeeDisplayName(employee) : 'Employee';
    const issue = String(row.issue_type || 'Discipline').trim() || 'Open case';

    items.push({
      id: `discipline:${row.id || `${row.employee_id}-${issue}`}`,
      kind: 'discipline',
      severity: 'info',
      employeeName: name,
      dueDate: null,
      title: `Open discipline — ${name}`,
      detail: issue,
      route: employeeId
        ? { type: 'employee', employeeId, drawerTab: 'discipline' }
        : { type: 'view', viewId: 'dashboardView' },
    });
  });

  return items;
}

function investigationIsOverdue(investigation: Investigation): boolean {
  if (!isOpenInvestigationStatus(investigation.status)) return false;
  const target = parseDueDate(investigation.target_completion_date);
  if (!target) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target < today;
}

function collectInvestigationItems(investigations: Investigation[]): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  investigations.forEach((investigation) => {
    if (!investigationIsOverdue(investigation)) return;

    const invId = String(investigation.id || '').trim();
    if (!invId) return;

    const targetRaw = investigation.target_completion_date;
    const days = daysUntilDate(targetRaw);
    const caseLabel = String(investigation.case_number || investigation.title || 'Case').trim();

    const employee =
      resolveEmployee(String(investigation.primary_employee_id || '')) ||
      resolveEmployee(String(investigation.targeted_employee_id || ''));

    items.push({
      id: `investigation:${invId}`,
      kind: 'investigation',
      severity: 'overdue',
      employeeName: employee ? employeeDisplayName(employee) : '—',
      dueDate: isoDateFromValue(targetRaw),
      title: `Investigation overdue — ${caseLabel}`,
      detail: employee
        ? `${employeeDisplayName(employee)} · target ${formatDueDateLabel(parseDueDate(targetRaw), String(targetRaw || ''))}${days !== null ? ` (${Math.abs(days)}d late)` : ''}`
        : `Target ${formatDueDateLabel(parseDueDate(targetRaw), String(targetRaw || ''))}`,
      route: { type: 'investigation', investigationId: invId },
    });
  });

  return items;
}

function isOpenCareStatus(status: unknown): boolean {
  return ['open', 'in_progress', 'follow_up'].includes(
    String(status || '').trim().toLowerCase()
  );
}

function collectCareFollowUpItems(
  careItems: Array<{
    id?: string;
    employee_id?: string;
    need_or_concern?: string;
    status?: string;
    follow_up_date?: string;
  }>,
  followUps: Array<{ id?: string; employee_id?: string; title?: string; status?: string; due_date?: string }>
): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  const pushCareItem = (
    sourceId: string,
    employeeRef: string,
    title: string,
    dueRaw: string,
    prefix: string
  ): void => {
    const days = daysUntilDate(dueRaw);
    if (days === null || days > DUE_SOON_DAYS) return;

    const employee = resolveEmployee(employeeRef);
    const employeeId = employee ? drawerEmployeeId(employee) : '';
    const name = employee ? employeeDisplayName(employee) : 'Employee';
    const severity = severityFromDays(days);

    items.push({
      id: `${prefix}:${sourceId}`,
      kind: 'care_follow_up',
      severity,
      employeeName: name,
      dueDate: isoDateFromValue(dueRaw),
      title: `${severity === 'overdue' ? 'Care follow-up overdue' : 'Care follow-up due'} — ${name}`,
      detail: `${title} · ${formatDueDateLabel(parseDueDate(dueRaw), dueRaw)}`,
      route: employeeId
        ? { type: 'employee', employeeId, drawerTab: 'care-support' }
        : { type: 'view', viewId: 'careEngagementView' },
    });
  };

  careItems.forEach((item) => {
    if (!isOpenCareStatus(item.status)) return;
    const followUp = String(item.follow_up_date || '').trim();
    if (!followUp) return;
    pushCareItem(
      String(item.id || item.employee_id || ''),
      String(item.employee_id || ''),
      String(item.need_or_concern || 'Care item'),
      followUp,
      'care-item'
    );
  });

  followUps.forEach((item) => {
    if (!isOpenCareStatus(item.status)) return;
    const due = String(item.due_date || '').trim();
    if (!due) return;
    pushCareItem(
      String(item.id || item.employee_id || ''),
      String(item.employee_id || ''),
      String(item.title || 'Follow-up'),
      due,
      'care-follow-up'
    );
  });

  return items;
}

function collectOperationsItems(
  issues: Array<{
    id?: string;
    title?: string;
    status?: string;
    due_date?: string;
    department?: string;
  }>
): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  issues.forEach((issue) => {
    const status = String(issue.status || '').toLowerCase();
    if (status === 'resolved' || status === 'closed') return;

    const dueRaw = String(issue.due_date || '').trim();
    if (!dueRaw) return;

    const days = daysUntilDate(dueRaw);
    if (days === null || days > DUE_SOON_DAYS) return;

    const issueId = String(issue.id || '').trim();
    if (!issueId) return;

    const severity = severityFromDays(days);
    const title = String(issue.title || 'Operations issue').trim();

    items.push({
      id: `operations:${issueId}`,
      kind: 'operations',
      severity,
      employeeName: '—',
      dueDate: isoDateFromValue(dueRaw),
      title: `${severity === 'overdue' ? 'Operations overdue' : 'Operations due'} — ${title}`,
      detail: `${String(issue.department || 'Unassigned').trim()} · ${formatDueDateLabel(parseDueDate(dueRaw), dueRaw)}`,
      route: { type: 'operations', issueId },
    });
  });

  return items;
}

function daysSinceTermination(employee: EmployeeLike): number | null {
  const termRaw = employee.termination_date || employee.terminationDate;
  const daysUntil = daysUntilDate(termRaw);
  if (daysUntil === null) return null;
  return -daysUntil;
}

function collectOffboardingItems(
  tasks: Array<{ id: string; employee_id?: string; task_name?: string; status?: string }>,
  employees: EmployeeLike[]
): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  const employeeByRosterId = new Map<string, EmployeeLike>();
  employees.forEach((employee) => {
    const keys = [employee.employee_id, employee.displayId, employee.id, employee.dbId]
      .filter(Boolean)
      .map(String);
    keys.forEach((key) => employeeByRosterId.set(key, employee));
  });

  const pendingByEmployee = new Map<string, Array<{ id: string; task_name?: string }>>();

  tasks.forEach((task) => {
    if (String(task.status || '').toLowerCase() === 'completed') return;

    const rosterId = String(task.employee_id || '').trim();
    if (!rosterId) return;

    const employee = employeeByRosterId.get(rosterId) || resolveEmployee(rosterId);
    if (!employee || normalizeEmployeeStatus(employee.status) !== 'terminated') return;

    const daysSince = daysSinceTermination(employee);
    if (daysSince === null || daysSince > OFFBOARDING_TERM_LOOKBACK_DAYS) return;

    const drawerId = drawerEmployeeId(employee);
    if (!drawerId) return;

    const bucket = pendingByEmployee.get(drawerId) || [];
    bucket.push({ id: task.id, task_name: task.task_name });
    pendingByEmployee.set(drawerId, bucket);
  });

  pendingByEmployee.forEach((pendingTasks, employeeId) => {
    const employee = getEmployeeById(employeeId) || resolveEmployee(employeeId);
    if (!employee) return;

    const name = employeeDisplayName(employee);
    const termLabel = formatDueDateLabel(
      parseDueDate(employee.termination_date || employee.terminationDate),
      String(employee.termination_date || employee.terminationDate || '')
    );

    if (pendingTasks.length > 1) {
      items.push({
        id: `offboarding:${employeeId}`,
        kind: 'offboarding',
        severity: 'due_soon',
        employeeName: name,
        dueDate: isoDateFromValue(employee.termination_date || employee.terminationDate),
        title: `Offboarding incomplete — ${name}`,
        detail: `${pendingTasks.length} tasks open (terminated ${termLabel})`,
        route: { type: 'employee', employeeId, drawerTab: 'offboarding' },
      });
      return;
    }

    pendingTasks.forEach((task) => {
      items.push({
        id: `offboarding:${task.id}`,
        kind: 'offboarding',
        severity: 'due_soon',
        employeeName: name,
        dueDate: isoDateFromValue(employee.termination_date || employee.terminationDate),
        title: `Offboarding — ${name}`,
        detail: String(task.task_name || 'Task').trim() || 'Pending task',
        route: { type: 'employee', employeeId, drawerTab: 'offboarding' },
      });
    });
  });

  return items;
}

function collectLeaveRequestItems(requests: LeaveRequestRecord[]): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  requests.forEach((request) => {
    if (request.status !== 'requested') return;

    const employee = resolveEmployee(request.employee_id);
    const employeeId = employee ? drawerEmployeeId(employee) : request.employee_id;
    const name = employee ? employeeDisplayName(employee) : request.employee_id;

    const startDays = daysUntilDate(request.start_date);
    const severity: HrInboxSeverity =
      startDays !== null && startDays < 0
        ? 'overdue'
        : startDays !== null && startDays <= DUE_SOON_DAYS
          ? 'due_soon'
          : 'info';

    items.push({
      id: `leave:${request.id}`,
      kind: 'leave_request',
      severity,
      employeeName: name,
      dueDate: request.start_date,
      title: `Time off approval — ${name}`,
      detail: `${leaveTypeLabel(request.leave_type)} · ${formatLeaveDateRange(request)}`,
      route: { type: 'employee', employeeId, drawerTab: 'time-off' },
    });
  });

  return items;
}

function daysSinceDate(isoDate: string): number | null {
  const daysUntil = daysUntilDate(isoDate);
  if (daysUntil === null) return null;
  return -daysUntil;
}

function collectPayrollHandoffItems(handoffs: PayrollHandoffRecord[]): HrInboxItem[] {
  const items: HrInboxItem[] = [];

  handoffs.forEach((handoff) => {
    if (handoff.status !== 'pending') return;

    const employee = resolveEmployee(handoff.employee_id);
    const employeeId = employee ? drawerEmployeeId(employee) : handoff.employee_id;
    const name = employee ? employeeDisplayName(employee) : handoff.employee_id;

    const effectiveDays = daysUntilDate(handoff.effective_date);
    const ageDays = daysSinceDate(handoff.created_at.slice(0, 10));
    const isStale = ageDays !== null && ageDays > 3;
    const isEffectiveOverdue = effectiveDays !== null && effectiveDays < 0;

    const severity: HrInboxSeverity =
      isEffectiveOverdue || isStale ? 'overdue' : 'due_soon';

    items.push({
      id: `payroll:${handoff.id}`,
      kind: 'payroll_handoff',
      severity,
      employeeName: name,
      dueDate: handoff.effective_date,
      title: `Payroll handoff — ${name}`,
      detail: `${payrollChangeTypeLabel(handoff.change_type)} · ${handoff.summary}`,
      route: { type: 'employee', employeeId, drawerTab: 'employee' },
    });
  });

  return items;
}

export function sortHrInboxItems(items: HrInboxItem[]): HrInboxItem[] {
  return [...items].sort(compareInboxItems);
}

export function filterHrInboxItems(
  items: HrInboxItem[],
  filter: 'all' | 'overdue' | 'due_soon'
): HrInboxItem[] {
  if (filter === 'all') return items;
  if (filter === 'overdue') return items.filter((item) => item.severity === 'overdue');
  return items.filter(
    (item) => item.severity === 'overdue' || item.severity === 'due_soon'
  );
}

export function kindLabel(kind: HrInboxKind): string {
  return KIND_LABELS[kind] || kind;
}

export async function buildHrInboxItems(): Promise<HrInboxItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) {
    return [];
  }

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[HrInbox] Could not load employees:', err);
    }
  }

  const allEmployees = getEmployees() as EmployeeLike[];
  const activeEmployees = getActiveEmployees() as EmployeeLike[];

  const payrollHandoffsPromise = loadPendingPayrollHandoffs();
  const pendingLeavePromise = loadPendingLeaveRequests();

  if (isSupervisorUser() && !isAdminUser()) {
    const [pendingLeave, policyAssignments] = await Promise.all([
      pendingLeavePromise,
      loadPolicyCampaignInboxAssignments().catch((err) => {
        console.warn('[HrInbox] Could not load policy campaigns:', err);
        return [];
      }),
    ]);

    return sortHrInboxItems([
      ...collectLeaveRequestItems(pendingLeave),
      ...collectPolicyCampaignItems(policyAssignments, true),
    ]);
  }

  const [
    onboardingRes,
    offboardingRes,
    disciplineRes,
    investigationsRes,
    careItemsRes,
    careFollowUpsRes,
    operationsRes,
    payrollHandoffs,
    pendingLeave,
    policyAssignments,
  ] = await Promise.all([
    supabaseClient
      .from('onboarding_tasks')
      .select('id, employee_id, task_name, status, due_date, assigned_to'),
    supabaseClient.from('offboarding_tasks').select('id, employee_id, task_name, status'),
    supabaseClient
      .from('discipline_reports')
      .select('id, employee_id, issue_type, report_status'),
    supabaseClient
      .from('investigations')
      .select('id, case_number, title, status, target_completion_date, primary_employee_id, targeted_employee_id'),
    supabaseClient
      .from('care_items')
      .select('id, employee_id, need_or_concern, status, follow_up_date'),
    supabaseClient.from('care_follow_ups').select('id, employee_id, title, status, due_date'),
    supabaseClient
      .from('operations_issues')
      .select('id, title, status, due_date, department'),
    payrollHandoffsPromise,
    pendingLeavePromise,
    loadPolicyCampaignInboxAssignments().catch((err) => {
      console.warn('[HrInbox] Could not load policy campaigns:', err);
      return [];
    }),
  ]);

  const queryErrors = [
    onboardingRes.error,
    offboardingRes.error,
    disciplineRes.error,
    investigationsRes.error,
    careItemsRes.error,
    careFollowUpsRes.error,
    operationsRes.error,
  ].filter(Boolean);

  if (queryErrors.length) {
    console.warn('[HrInbox] Some queries failed:', queryErrors);
  }

  const merged: HrInboxItem[] = [
    ...collectStayInterviewItems(activeEmployees),
    ...collectOnboardingItems(onboardingRes.data || [], activeEmployees),
    ...collectOffboardingItems(offboardingRes.data || [], allEmployees),
    ...collectDisciplineItems(disciplineRes.data || []),
    ...collectInvestigationItems((investigationsRes.data || []) as Investigation[]),
    ...collectCareFollowUpItems(careItemsRes.data || [], careFollowUpsRes.data || []),
    ...collectOperationsItems(operationsRes.data || []),
    ...collectPayrollHandoffItems(payrollHandoffs),
    ...collectLeaveRequestItems(pendingLeave),
    ...collectPolicyCampaignItems(policyAssignments),
  ];

  return sortHrInboxItems(merged);
}

export type HrInboxAlertSummary = {
  id: string;
  label: string;
  detail: string;
  count: number;
  viewId?: string;
};

export function summarizeHrInboxForAlerts(items: HrInboxItem[]): HrInboxAlertSummary[] {
  const alerts: HrInboxAlertSummary[] = [];

  const stayOverdue = items.filter(
    (item) => item.kind === 'stay_interview' && item.severity === 'overdue'
  ).length;
  if (stayOverdue > 0) {
    alerts.push({
      id: 'stay-interviews-due',
      label: 'Stay interviews due',
      detail: `${stayOverdue} overdue stay interview${stayOverdue === 1 ? '' : 's'}`,
      count: stayOverdue,
      viewId: 'dashboardView',
    });
  }

  const staySoon = items.filter(
    (item) => item.kind === 'stay_interview' && item.severity === 'due_soon'
  ).length;
  if (staySoon > 0) {
    alerts.push({
      id: 'stay-interviews-due-soon',
      label: 'Stay interviews due soon',
      detail: `${staySoon} due within ${DUE_SOON_DAYS} days`,
      count: staySoon,
      viewId: 'dashboardView',
    });
  }

  const discipline = items.filter((item) => item.kind === 'discipline').length;
  if (discipline > 0) {
    alerts.push({
      id: 'open-discipline',
      label: 'Open discipline cases',
      detail: `${discipline} case${discipline === 1 ? '' : 's'} need follow-up`,
      count: discipline,
      viewId: 'dashboardView',
    });
  }

  const invOverdue = items.filter((item) => item.kind === 'investigation').length;
  if (invOverdue > 0) {
    alerts.push({
      id: 'investigations-overdue',
      label: 'Overdue investigations',
      detail: `${invOverdue} case${invOverdue === 1 ? '' : 's'} past target date`,
      count: invOverdue,
      viewId: 'investigationsView',
    });
  }

  const policyOverdue = items.filter(
    (item) => item.kind === 'policy_campaign' && item.severity === 'overdue'
  ).length;
  if (policyOverdue > 0) {
    alerts.push({
      id: 'policy-campaign-overdue',
      label: 'Policy acknowledgments overdue',
      detail: `${policyOverdue} employee${policyOverdue === 1 ? '' : 's'} past due on policy campaigns`,
      count: policyOverdue,
      viewId: 'documentsView',
    });
  }

  const onboardingOverdue = items.filter(
    (item) =>
      (item.kind === 'onboarding' || item.kind === 'new_hire') && item.severity === 'overdue'
  ).length;
  if (onboardingOverdue > 0) {
    alerts.push({
      id: 'onboarding-overdue',
      label: 'Onboarding overdue',
      detail: `${onboardingOverdue} task${onboardingOverdue === 1 ? '' : 's'} past due (check I-9 deadlines)`,
      count: onboardingOverdue,
      viewId: 'dashboardView',
    });
  }

  const onboarding = items.filter(
    (item) =>
      (item.kind === 'onboarding' || item.kind === 'new_hire') && item.severity !== 'overdue'
  ).length;
  if (onboarding > 0) {
    alerts.push({
      id: 'onboarding-open',
      label: 'Onboarding tasks',
      detail: `${onboarding} open item${onboarding === 1 ? '' : 's'}`,
      count: onboarding,
      viewId: 'dashboardView',
    });
  }

  const care = items.filter((item) => item.kind === 'care_follow_up').length;
  if (care > 0) {
    alerts.push({
      id: 'care-follow-ups',
      label: 'Care follow-ups',
      detail: `${care} due or overdue`,
      count: care,
      viewId: 'careEngagementView',
    });
  }

  const operations = items.filter((item) => item.kind === 'operations').length;
  if (operations > 0) {
    alerts.push({
      id: 'operations-due',
      label: 'Operations due',
      detail: `${operations} issue${operations === 1 ? '' : 's'} need attention`,
      count: operations,
      viewId: 'operationsView',
    });
  }

  const offboarding = items.filter((item) => item.kind === 'offboarding').length;
  if (offboarding > 0) {
    alerts.push({
      id: 'offboarding-open',
      label: 'Offboarding checklists',
      detail: `${offboarding} open item${offboarding === 1 ? '' : 's'} for recent terminations`,
      count: offboarding,
      viewId: 'dashboardView',
    });
  }

  const leave = items.filter((item) => item.kind === 'leave_request').length;
  if (leave > 0) {
    alerts.push({
      id: 'leave-requests-pending',
      label: 'Time off approvals',
      detail: `${leave} request${leave === 1 ? '' : 's'} awaiting approval`,
      count: leave,
      viewId: 'dashboardView',
    });
  }

  const payroll = items.filter((item) => item.kind === 'payroll_handoff').length;
  if (payroll > 0) {
    alerts.push({
      id: 'payroll-handoffs-pending',
      label: 'Payroll handoffs',
      detail: `${payroll} pending change${payroll === 1 ? '' : 's'} for external payroll`,
      count: payroll,
      viewId: 'dashboardView',
    });
  }

  return alerts;
}
