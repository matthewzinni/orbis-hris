/**
 * Cross-module HR intelligence: retention signals, executive summaries, and shared context.
 */

import type { Employee } from '../types/employeeTypes';
import {
  isStayInterviewEligibleEmployee,
  isStayInterviewOverdue,
  isStayInterviewDueSoon,
  readEmployeeNextStayInterviewDateRaw,
} from './employeeUtils';
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
  /** Open severe discipline cases (Final Warning+). */
  disciplineOpenByEmployee: Map<string, number>;
  /** Severe discipline cases regardless of open/closed status — drives at-risk and turnover risk. */
  severeDisciplineByEmployee: Map<string, number>;
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
  action_taken?: string;
  description?: string;
  issue_type?: string;
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

/** Match severe discipline from stored level only — not action/description boilerplate. */
export function disciplineRowCountsTowardAtRisk(row: DisciplineRow): boolean {
  const level = String(row.discipline_level || '').trim();
  if (level) {
    return isSevereDisciplineLevel(level);
  }

  // Legacy rows without discipline_level: issue_type was occasionally used as the level label.
  return isSevereDisciplineLevel(row.issue_type);
}

export function resolveEmployeeDisciplineKeys(
  employeeId: string,
  employees?: Array<Record<string, unknown>>
): string[] {
  const keys = new Set<string>();
  const normalized = String(employeeId || '').trim();
  if (!normalized) return [];

  keys.add(normalized);
  const normalizedLower = normalized.toLowerCase();

  for (const employee of employees || []) {
    const aliases = [employee.id, employee.employee_id, employee.dbId, employee.displayId]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!aliases.some((alias) => alias.toLowerCase() === normalizedLower)) {
      continue;
    }

    aliases.forEach((alias) => keys.add(alias));
    break;
  }

  return [...keys];
}

function getSevereDisciplineCount(
  employeeOrId: Record<string, unknown> | string,
  context: HrIntelligenceContext,
  employees?: Array<Record<string, unknown>>
): number {
  const employeeId =
    typeof employeeOrId === 'string'
      ? employeeOrId
      : getEmployeeRecordId(employeeOrId);

  for (const key of resolveEmployeeDisciplineKeys(employeeId, employees)) {
    const count = context.severeDisciplineByEmployee.get(key) || 0;
    if (count > 0) return count;
  }

  return 0;
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
  const severeDisciplineByEmployee = new Map<string, number>();
  const openInvestigationEmployeeIds = new Set<string>();
  const operationsPressureByEmployee = new Map<string, number>();
  const operationsPressureByDepartment = new Map<string, number>();
  const recurringOperationsByDepartment = new Map<string, number>();
  const stayInterviewOverdueIds = new Set<string>();
  const stayInterviewDueSoonIds = new Set<string>();

  (input.disciplineRows || []).forEach((row) => {
    if (!disciplineRowCountsTowardAtRisk(row)) return;
    const employeeId = String(row.employee_id || '').trim();
    if (!employeeId) return;

    const aliasKeys = resolveEmployeeDisciplineKeys(employeeId, input.employees);
    aliasKeys.forEach((key) => {
      severeDisciplineByEmployee.set(
        key,
        (severeDisciplineByEmployee.get(key) || 0) + 1
      );
    });

    if (isOpenDisciplineStatus(row.report_status)) {
      aliasKeys.forEach((key) => {
        disciplineOpenByEmployee.set(
          key,
          (disciplineOpenByEmployee.get(key) || 0) + 1
        );
      });
    }
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


  (input.employees || []).forEach((employee) => {
    const employeeId = getEmployeeRecordId(employee);
    if (!employeeId || !isStayInterviewEligibleEmployee(employee)) return;

    if (!readEmployeeNextStayInterviewDateRaw(employee)) return;

    if (isStayInterviewOverdue(employee)) {
      stayInterviewOverdueIds.add(employeeId);
      return;
    }

    if (isStayInterviewDueSoon(employee)) {
      stayInterviewDueSoonIds.add(employeeId);
    }
  });

  return {
    disciplineOpenByEmployee,
    severeDisciplineByEmployee,
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
  context: HrIntelligenceContext,
  employees?: Array<Record<string, unknown>>
): AtRiskIntelligenceMeta {
  const severeDiscipline = getSevereDisciplineCount(employeeId, context, employees);

  return {
    ...meta,
    disciplineRisk: severeDiscipline > 0 || meta.disciplineRisk === true,
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
  if (meta?.disciplineRisk || getSevereDisciplineCount(employee, context) > 0) {
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

function departmentForEmployeeId(
  employeeId: string,
  employees: Array<Record<string, unknown>>
): string {
  const match = employees.find((employee) => getEmployeeRecordId(employee) === employeeId);
  return match ? getEmployeeDepartment(match) || 'Unassigned' : 'Unassigned';
}

function aggregateSignalByDepartment(
  employeeIds: Iterable<string>,
  employees: Array<Record<string, unknown>>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of employeeIds) {
    const dept = departmentForEmployeeId(id, employees);
    counts.set(dept, (counts.get(dept) || 0) + 1);
  }
  return counts;
}

function topDepartmentShare(
  byDept: Map<string, number>,
  total: number
): { department: string; count: number; share: number } | null {
  if (!total) return null;
  const sorted = [...byDept.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] === 0) return null;
  const [department, count] = sorted[0];
  return { department, count, share: count / total };
}

function formatDepartmentPattern(
  label: string,
  byDept: Map<string, number>,
  total: number,
  interpretiveSuffix: string
): string | null {
  if (!total) return null;
  const top = topDepartmentShare(byDept, total);
  if (!top || top.count < 2) return null;

  const sharePct = Math.round(top.share * 100);
  if (sharePct >= 50) {
    return `${top.department} accounts for ${sharePct}% of ${label}, suggesting ${interpretiveSuffix} rather than isolated individual issues.`;
  }

  const deptList = [...byDept.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name, count]) => `${name} (${count})`)
    .join(' and ');

  return `${label} cluster in ${deptList} — review whether supervision, workload, or team dynamics are contributing factors.`;
}

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
  employees?: Array<Record<string, unknown>>;
}): ExecutiveInsightLine[] {
  const lines: ExecutiveInsightLine[] = [];
  const { context } = input;
  const employees = input.employees || [];

  const disciplineByDept = aggregateSignalByDepartment(
    context.disciplineOpenByEmployee.keys(),
    employees
  );
  const investigationByDept = aggregateSignalByDepartment(
    context.openInvestigationEmployeeIds,
    employees
  );
  const overdueStayByDept = aggregateSignalByDepartment(context.stayInterviewOverdueIds, employees);

  const retentionPressure =
    input.overdueStayCount + input.openDisciplineCount + input.openInvestigationCount;

  if (retentionPressure === 0 && input.dueSoonStayCount === 0) {
    lines.push({
      tone: 'positive',
      text: 'No overdue stay interviews, open severe discipline, or open investigations are flagged — engagement risk appears contained. Prioritize proactive stay conversations and recognition to keep momentum.',
    });
  } else {
    const themes: string[] = [];

    const disciplinePattern = formatDepartmentPattern(
      'current severe discipline cases',
      disciplineByDept,
      input.openDisciplineCount,
      'a potential supervisory consistency, accountability, or workload management pattern'
    );
    if (disciplinePattern) themes.push(disciplinePattern);

    const investigationPattern = formatDepartmentPattern(
      'open investigations',
      investigationByDept,
      input.openInvestigationCount,
      'team dynamics or policy adherence concerns worth leadership attention'
    );
    if (investigationPattern) themes.push(investigationPattern);

    if (input.overdueStayCount > 0) {
      const stayPattern = formatDepartmentPattern(
        'overdue stay interviews',
        overdueStayByDept,
        input.overdueStayCount,
        'engagement check-ins may be slipping in that area before dissatisfaction surfaces'
      );
      themes.push(
        stayPattern ||
          `${input.overdueStayCount} overdue stay interview${input.overdueStayCount === 1 ? '' : 's'} — delayed conversations increase blind spots on retention risk.`
      );
    }

    if (themes.length) {
      lines.push({ tone: 'attention', text: themes[0] });
      themes.slice(1, 2).forEach((text) => lines.push({ tone: 'attention', text }));
    } else {
      lines.push({
        tone: 'attention',
        text: 'Retention signals are spread across the workforce rather than concentrated in one department — review whether root causes are systemic (communication, scheduling, feedback cadence) vs individual performance.',
      });
    }
  }

  const opsDepartments = [...context.operationsPressureByDepartment.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (opsDepartments.length) {
    const [topDept, topCount] = opsDepartments[0];
    const recurring = context.recurringOperationsByDepartment.get(topDept) || 0;
    lines.push({
      tone: 'attention',
      text:
        recurring >= 2
          ? `${topDept} shows ${topCount} open operations issues including recurring items — a potential burnout or process breakdown signal that may feed attendance and turnover risk if unaddressed.`
          : `Elevated open operations load in ${topDept} (${topCount} issues) may be creating friction for floor teams; connect with supervisors on root cause before issues shift to discipline or attrition.`,
    });
  }

  const atRiskIds = Object.entries(input.atRiskMap).filter(([, meta]) => {
    return meta.lowReview || String(meta.manualReason || '').trim() || meta.disciplineRisk;
  });
  const atRiskCount = atRiskIds.length;

  if (atRiskCount) {
    const reviewDriven = atRiskIds.filter(([, meta]) => meta.lowReview).length;
    const disciplineDriven = atRiskIds.filter(
      ([id, meta]) =>
        meta.disciplineRisk || getSevereDisciplineCount(id, context, input.employees) > 0
    ).length;

    let focus = 'Review the At-Risk roster and assign manager follow-ups within 30 days.';
    if (reviewDriven >= atRiskCount / 2 && reviewDriven > 0) {
      focus =
        'Several at-risk flags tie to performance reviews — consider succession planning, coaching plans, and whether expectations are clear.';
    } else if (disciplineDriven >= atRiskCount / 2 && disciplineDriven > 0) {
      focus =
        'At-risk flags align with discipline history — prioritize consistent corrective action and document whether prior coaching is taking hold (Discipline → Turnover Risk).';
    }

    lines.push({
      tone: 'attention',
      text: `${atRiskCount} employee${atRiskCount === 1 ? '' : 's'} show compounded retention signals (reviews, manual flags, or severe discipline). ${focus}`,
    });
  } else if (input.dueSoonStayCount > 0) {
    lines.push({
      tone: 'neutral',
      text: `${input.dueSoonStayCount} stay interview${input.dueSoonStayCount === 1 ? '' : 's'} due within 14 days — scheduling now prevents engagement blind spots and reinforces Care & Engagement → Retention.`,
    });
  } else if (lines.every((line) => line.tone === 'positive')) {
    lines.push({
      tone: 'positive',
      text: 'Workforce risk indicators are stable. Use the window to deepen supervisor feedback rhythms and document what is working well in high-performing teams.',
    });
  }

  if (input.onLeaveCount > 0 && input.activeCount > 0) {
    const leaveShare = Math.round((input.onLeaveCount / input.activeCount) * 100);
    if (leaveShare >= 8) {
      lines.push({
        tone: 'neutral',
        text: `${input.onLeaveCount} employees on leave (${leaveShare}% of active roster) — confirm coverage plans and re-integration conversations so return-to-work friction does not accumulate.`,
      });
    }
  }

  if (!lines.length) {
    lines.push({
      tone: 'neutral',
      text: 'Workforce metrics loaded — generate stay interviews and review department KPIs for emerging patterns.',
    });
  }

  return lines.slice(0, 4);
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
