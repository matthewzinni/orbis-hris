/**
 * Cross-module HR intelligence: retention signals, executive summaries, and shared context.
 */

import type { Employee } from '../types/employeeTypes';
import { hasActiveRiskMeta } from '../ui/badges';

export type AtRiskIntelligenceMeta = {
  lowReview?: boolean;
  disciplineRisk?: boolean;
  openIncidentCount?: number;
  manualReason?: string;
  reviewScore?: number | null;
  flaggedDate?: string;
  flaggedBy?: string;
  openInvestigation?: boolean;
  stayInterviewOverdue?: boolean;
  operationsPressure?: boolean;
};

export type HrIntelligenceContext = {
  disciplineOpenByEmployee: Map<string, number>;
  openInvestigationEmployeeIds: Set<string>;
  operationsPressureByEmployee: Map<string, number>;
  operationsPressureByDepartment: Map<string, number>;
  recurringOperationsByDepartment: Map<string, number>;
  stayInterviewOverdueIds: Set<string>;
  stayInterviewDueSoonIds: Set<string>;
};

type DisciplineRow = {
  employee_id?: string;
  report_status?: string;
  discipline_level?: string;
};

type InvestigationRow = {
  status?: string;
  primary_employee_id?: string;
  targeted_employee_id?: string;
  investigation_subjects?: Array<{ employee_id?: string; subject_role?: string }>;
};

type OperationsRow = {
  status?: string;
  is_recurring?: boolean;
  department?: string;
  related_employee_id?: string;
  priority?: string;
};

const OPEN_DISCIPLINE_STATUSES = new Set(['open', 'pending follow-up', 'pending']);
const CLOSED_OPERATIONS_STATUSES = new Set(['resolved', 'closed']);
const CLOSED_INVESTIGATION_STATUS = 'closed';

function parseIsoDate(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(`${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEmployeeRecordId(employee: Record<string, unknown>): string {
  return String(employee.id || employee.employee_id || employee.dbId || '').trim();
}

function getEmployeeDepartment(employee: Record<string, unknown>): string {
  return String(employee.department || employee.dept || '').trim();
}

export function isOpenDisciplineStatus(status: unknown): boolean {
  return OPEN_DISCIPLINE_STATUSES.has(String(status || 'open').trim().toLowerCase());
}

/** Coaching, verbal, and written warnings do not auto-flag at-risk. */
export function isSevereDisciplineLevel(level: unknown): boolean {
  const raw = String(level || '').trim().toLowerCase();
  if (!raw) return false;

  return (
    raw.includes('final warning') ||
    raw.includes('level 4') ||
    raw.includes('termination') ||
    raw.includes('level 5')
  );
}

export function countsTowardAtRiskDiscipline(level: unknown): boolean {
  return isSevereDisciplineLevel(level);
}

export function isOpenOperationsIssue(status: unknown): boolean {
  return !CLOSED_OPERATIONS_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function isOpenInvestigationStatus(status: unknown): boolean {
  return String(status || '').trim().toLowerCase() !== CLOSED_INVESTIGATION_STATUS;
}

export function collectInvestigationEmployeeIds(investigation: InvestigationRow): string[] {
  const ids = new Set<string>();

  const push = (value: unknown) => {
    const id = String(value || '').trim();
    if (id) ids.add(id);
  };

  push(investigation.primary_employee_id);
  push(investigation.targeted_employee_id);

  (investigation.investigation_subjects || []).forEach((subject) => {
    const role = String(subject.subject_role || '').toLowerCase();
    if (role === 'focus' || role === 'targeted' || role === 'respondent' || !role) {
      push(subject.employee_id);
    }
  });

  return [...ids];
}

export function buildHrIntelligenceContext(input: {
  disciplineRows?: DisciplineRow[];
  investigationRows?: InvestigationRow[];
  operationsRows?: OperationsRow[];
  employees?: Array<Record<string, unknown>>;
}): HrIntelligenceContext {
  const disciplineOpenByEmployee = new Map<string, number>();
  const openInvestigationEmployeeIds = new Set<string>();
  const operationsPressureByEmployee = new Map<string, number>();
  const operationsPressureByDepartment = new Map<string, number>();
  const recurringOperationsByDepartment = new Map<string, number>();
  const stayInterviewOverdueIds = new Set<string>();
  const stayInterviewDueSoonIds = new Set<string>();

  (input.disciplineRows || []).forEach((row) => {
    if (!isOpenDisciplineStatus(row.report_status)) return;
    if (!countsTowardAtRiskDiscipline(row.discipline_level)) return;
    const employeeId = String(row.employee_id || '').trim();
    if (!employeeId) return;
    disciplineOpenByEmployee.set(employeeId, (disciplineOpenByEmployee.get(employeeId) || 0) + 1);
  });

  (input.investigationRows || []).forEach((row) => {
    if (!isOpenInvestigationStatus(row.status)) return;
    collectInvestigationEmployeeIds(row).forEach((id) => openInvestigationEmployeeIds.add(id));
  });

  (input.operationsRows || []).forEach((row) => {
    if (!isOpenOperationsIssue(row.status)) return;
    const department = String(row.department || 'Unassigned').trim() || 'Unassigned';
    const weight =
      String(row.priority || '').toLowerCase() === 'urgent' ||
      String(row.priority || '').toLowerCase() === 'high'
        ? 2
        : 1;

    operationsPressureByDepartment.set(
      department,
      (operationsPressureByDepartment.get(department) || 0) + weight
    );

    if (row.is_recurring) {
      recurringOperationsByDepartment.set(
        department,
        (recurringOperationsByDepartment.get(department) || 0) + 1
      );
    }

    const relatedEmployeeId = String(row.related_employee_id || '').trim();
    if (relatedEmployeeId) {
      operationsPressureByEmployee.set(
        relatedEmployeeId,
        (operationsPressureByEmployee.get(relatedEmployeeId) || 0) + weight
      );
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonCutoff = new Date(today);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 14);

  (input.employees || []).forEach((employee) => {
    const employeeId = getEmployeeRecordId(employee);
    if (!employeeId) return;

    const nextReview = parseIsoDate(
      employee.next_review_date || employee.nextReview || employee.nextReviewDate
    );
    if (!nextReview) return;

    if (nextReview <= today) {
      stayInterviewOverdueIds.add(employeeId);
      return;
    }

    if (nextReview <= dueSoonCutoff) {
      stayInterviewDueSoonIds.add(employeeId);
    }
  });

  return {
    disciplineOpenByEmployee,
    openInvestigationEmployeeIds,
    operationsPressureByEmployee,
    operationsPressureByDepartment,
    recurringOperationsByDepartment,
    stayInterviewOverdueIds,
    stayInterviewDueSoonIds,
  };
}

export function employeeHasOperationsPressure(
  employee: Record<string, unknown>,
  context: HrIntelligenceContext
): boolean {
  const employeeId = getEmployeeRecordId(employee);
  if (employeeId && (context.operationsPressureByEmployee.get(employeeId) || 0) > 0) {
    return true;
  }

  const department = getEmployeeDepartment(employee);
  if (!department) return false;

  const openIssues = context.operationsPressureByDepartment.get(department) || 0;
  const recurring = context.recurringOperationsByDepartment.get(department) || 0;
  return openIssues >= 3 || recurring >= 2;
}

export function enrichAtRiskMetaFromContext(
  employeeId: string,
  meta: AtRiskIntelligenceMeta,
  context: HrIntelligenceContext
): AtRiskIntelligenceMeta {
  return {
    ...meta,
    disciplineRisk: (context.disciplineOpenByEmployee.get(employeeId) || 0) > 0,
    openInvestigation: context.openInvestigationEmployeeIds.has(employeeId),
    stayInterviewOverdue: context.stayInterviewOverdueIds.has(employeeId),
    operationsPressure: meta.operationsPressure || false,
  };
}

export function computeRetentionRiskPoints(
  employee: Record<string, unknown>,
  meta: AtRiskIntelligenceMeta | null | undefined,
  context: HrIntelligenceContext,
  tenureMonths: number
): number {
  const employeeId = getEmployeeRecordId(employee);
  let points = 0;

  if (meta?.lowReview) points += 2;
  if ((meta?.openIncidentCount || 0) > 0) points += 2;
  if (String(meta?.manualReason || '').trim()) points += 2;
  if (meta?.disciplineRisk || (context.disciplineOpenByEmployee.get(employeeId) || 0) > 0) {
    points += 2.5;
  }
  if (employeeHasOperationsPressure(employee, context)) {
    points += 1.5;
  }
  if (tenureMonths > 0 && tenureMonths <= 6) {
    points += 0.75;
  }

  return points;
}

export function isTurnoverRiskContributor(
  employee: Record<string, unknown>,
  meta: AtRiskIntelligenceMeta | null | undefined,
  context: HrIntelligenceContext,
  tenureMonths: number
): boolean {
  if (hasActiveRiskMeta(meta)) {
    return true;
  }

  return computeRetentionRiskPoints(employee, meta, context, tenureMonths) >= 2.5;
}

export function computeTurnoverRiskPercentage(
  employees: Array<Record<string, unknown>>,
  context: HrIntelligenceContext,
  getTenureMonths: (employee: Record<string, unknown>) => number,
  getMeta: (employeeId: string) => AtRiskIntelligenceMeta | null | undefined,
  isEligible: (employee: Record<string, unknown>) => boolean
): { percentage: number; contributorCount: number; eligibleCount: number } {
  const eligible = employees.filter(isEligible);
  const contributorCount = eligible.filter((employee) => {
    const employeeId = getEmployeeRecordId(employee);
    return isTurnoverRiskContributor(
      employee,
      getMeta(employeeId),
      context,
      getTenureMonths(employee)
    );
  }).length;

  const eligibleCount = eligible.length;
  const percentage = eligibleCount
    ? Math.min(100, (contributorCount / eligibleCount) * 100)
    : 0;

  return { percentage, contributorCount, eligibleCount };
}

export type ExecutiveInsightLine = {
  tone: 'neutral' | 'attention' | 'positive';
  text: string;
};

export function buildExecutiveInsightLines(input: {
  activeCount: number;
  departmentCount: number;
  onLeaveCount: number;
  context: HrIntelligenceContext;
  atRiskMap: Record<string, AtRiskIntelligenceMeta>;
  openDisciplineCount: number;
  openInvestigationCount: number;
  overdueStayCount: number;
  dueSoonStayCount: number;
}): ExecutiveInsightLine[] {
  const lines: ExecutiveInsightLine[] = [];
  const { context } = input;

  lines.push({
    tone: 'neutral',
    text: `${input.activeCount} active employees across ${input.departmentCount} department${input.departmentCount === 1 ? '' : 's'}; ${input.onLeaveCount} currently on leave.`,
  });

  const retentionSignals =
    input.overdueStayCount +
    input.openDisciplineCount +
    input.openInvestigationCount +
    context.openInvestigationEmployeeIds.size;

  if (retentionSignals > 0) {
    lines.push({
      tone: 'attention',
      text: `Retention attention: ${input.overdueStayCount} overdue stay interview${input.overdueStayCount === 1 ? '' : 's'}, ${input.openDisciplineCount} open discipline case${input.openDisciplineCount === 1 ? '' : 's'}, and ${input.openInvestigationCount} open investigation${input.openInvestigationCount === 1 ? '' : 's'} across the workforce.`,
    });
  } else {
    lines.push({
      tone: 'positive',
      text: 'No overdue stay interviews, open discipline cases, or open investigations are currently flagged in Orbis.',
    });
  }

  const opsDepartments = [...context.operationsPressureByDepartment.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (opsDepartments.length) {
    const deptList = opsDepartments.map(([name, count]) => `${name} (${count} open)`).join(', ');
    lines.push({
      tone: 'attention',
      text: `Operations load may be affecting retention: elevated open operations issues in ${deptList}.`,
    });
  }

  const atRiskCount = Object.values(input.atRiskMap).filter(
    (meta) =>
      meta.lowReview ||
      String(meta.manualReason || '').trim() ||
      meta.disciplineRisk
  ).length;

  if (atRiskCount) {
    lines.push({
      tone: 'attention',
      text: `${atRiskCount} employee${atRiskCount === 1 ? '' : 's'} are flagged at-risk from low review scores, manual HR flags, or severe open discipline (final warning+). Review the At-Risk list for names and departments.`,
    });
  } else if (input.dueSoonStayCount > 0) {
    lines.push({
      tone: 'neutral',
      text: `${input.dueSoonStayCount} stay interview${input.dueSoonStayCount === 1 ? '' : 's'} due within the next 14 days — schedule conversations before they become overdue.`,
    });
  } else {
    lines.push({
      tone: 'positive',
      text: 'Workforce risk indicators are stable this week. Continue stay interviews and recognition to sustain engagement.',
    });
  }

  return lines;
}

export function computeStayInterviewCareSignals(
  employees: Array<Record<string, unknown>>
): { overdue: number; dueSoon: number; affectedEmployeeIds: Set<string> } {
  const context = buildHrIntelligenceContext({ employees });
  const affectedEmployeeIds = new Set<string>([
    ...context.stayInterviewOverdueIds,
    ...context.stayInterviewDueSoonIds,
  ]);

  return {
    overdue: context.stayInterviewOverdueIds.size,
    dueSoon: context.stayInterviewDueSoonIds.size,
    affectedEmployeeIds,
  };
}

export function getActiveEmployees(employees: Employee[]): Employee[] {
  return employees.filter((employee) => {
    const status = String(employee.status || '').toUpperCase();
    if (status === 'TERMINATED') {
      return !String(employee.termination_date || '').trim();
    }
    return status !== 'INACTIVE' && status !== 'ARCHIVED';
  });
}
