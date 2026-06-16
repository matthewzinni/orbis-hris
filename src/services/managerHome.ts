import {
  employeeMatchesSupervisorAccess,
  isSupervisorUser,
} from './access';
import {
  compareEmployeesByLastName,
  employeeDisplayName,
  formatDueDateLabel,
  formatEmployeeDueDateLine,
  getEmployeeNextStayInterviewDueDate,
  isActiveDashboardEmployee,
  isStayInterviewDueSoon,
  isStayInterviewEligibleEmployee,
  isStayInterviewOverdue,
  readEmployeeNextStayInterviewDateRaw,
} from './employeeUtils';
import {
  employeeNameForLeave,
  formatLeaveDateRange,
  leaveTypeLabel,
  loadApprovedLeaveOutToday,
  loadPendingLeaveRequests,
  type LeaveRequestRecord,
} from './leaveRequests';
import { getEmployees } from '../modules/employees';

export type ManagerAttentionKind = 'leave_request' | 'stay_interview' | 'at_risk';

export type ManagerAttentionItem = {
  id: string;
  kind: ManagerAttentionKind;
  severity: 'overdue' | 'due_soon' | 'info';
  employeeId: string;
  employeeName: string;
  title: string;
  detail: string;
  drawerTab: string;
  leaveRequestId?: string;
};

export type ManagerTeamMember = {
  id: string;
  name: string;
  department: string;
  position: string;
  status: string;
  stayInterviewDue?: string;
};

export type ManagerHomeSnapshot = {
  teamCount: number;
  activeCount: number;
  onLeaveStatusCount: number;
  outTodayCount: number;
  pendingLeaveCount: number;
  overdueStayInterviewCount: number;
  atRiskCount: number;
  outToday: LeaveRequestRecord[];
  pendingLeave: LeaveRequestRecord[];
  attentionItems: ManagerAttentionItem[];
  teamRoster: ManagerTeamMember[];
};

function getTeamEmployees(): Array<Record<string, unknown>> {
  const roster = getEmployees();
  if (!isSupervisorUser()) return [];
  return roster.filter((employee) => employeeMatchesSupervisorAccess(employee));
}

function isOnLeaveStatus(employee: Record<string, unknown>): boolean {
  const status = String(employee.status || employee.displayStatus || '')
    .trim()
    .toUpperCase();
  return status === 'LEAVE' || status === 'ON LEAVE';
}

function isScopedLeave(row: LeaveRequestRecord, teamIds: Set<string>): boolean {
  return teamIds.has(String(row.employee_id || '').trim());
}

function buildAtRiskAttention(
  employee: Record<string, unknown>,
  riskMap: Record<string, { manualReason?: string; disciplineRisk?: boolean; lowReview?: boolean }>
): ManagerAttentionItem | null {
  const employeeId = String(employee.id || employee.employee_id || '').trim();
  const risk = riskMap[employeeId] || riskMap[String(employee.dbId || '')];
  if (!risk) return null;

  const reasons: string[] = [];
  if (risk.manualReason) reasons.push(String(risk.manualReason).trim());
  if (risk.disciplineRisk) reasons.push('Severe discipline');
  if (risk.lowReview) reasons.push('Low review score');

  if (!reasons.length) return null;

  return {
    id: `at-risk-${employeeId}`,
    kind: 'at_risk',
    severity: 'info',
    employeeId,
    employeeName: employeeDisplayName(employee),
    title: 'May need attention',
    detail: reasons.join(' · '),
    drawerTab: 'profile',
  };
}

export async function buildManagerHomeSnapshot(): Promise<ManagerHomeSnapshot | null> {
  if (!isSupervisorUser()) return null;

  const team = getTeamEmployees();
  const teamIds = new Set(
    team.map((employee) => String(employee.id || employee.employee_id || '').trim()).filter(Boolean)
  );

  const activeTeam = team.filter((employee) => isActiveDashboardEmployee(employee));
  const onLeaveStatusCount = team.filter(isOnLeaveStatus).length;

  const eligible = activeTeam.filter((employee) => isStayInterviewEligibleEmployee(employee));
  const overdueStay = eligible
    .filter((employee) => isStayInterviewOverdue(employee))
    .sort((left, right) =>
      compareEmployeesByLastName(left as Record<string, unknown>, right as Record<string, unknown>)
    );

  const dueSoonStay = eligible
    .filter((employee) => isStayInterviewDueSoon(employee))
    .sort((left, right) =>
      compareEmployeesByLastName(left as Record<string, unknown>, right as Record<string, unknown>)
    );

  const [outTodayAll, pendingAll] = await Promise.all([
    loadApprovedLeaveOutToday(),
    loadPendingLeaveRequests(),
  ]);

  const outToday = outTodayAll.filter((row) => isScopedLeave(row, teamIds));
  const pendingLeave = pendingAll.filter(
    (row) => isScopedLeave(row, teamIds) && row.status === 'requested'
  );

  const riskMap =
    (window.currentAtRiskRosterMap as Record<
      string,
      { manualReason?: string; disciplineRisk?: boolean; lowReview?: boolean }
    >) || {};

  const attentionItems: ManagerAttentionItem[] = [];

  pendingLeave.forEach((row) => {
    const employeeId = String(row.employee_id || '').trim();
    attentionItems.push({
      id: `leave-${row.id}`,
      kind: 'leave_request',
      severity: 'due_soon',
      employeeId,
      employeeName: employeeNameForLeave(employeeId),
      title: 'Pending time off',
      detail: `${leaveTypeLabel(row.leave_type)} · ${formatLeaveDateRange(row)}`,
      drawerTab: 'time-off',
      leaveRequestId: row.id,
    });
  });

  overdueStay.forEach((employee) => {
    const employeeId = String(employee.id || employee.employee_id || '').trim();
    attentionItems.push({
      id: `stay-overdue-${employeeId}`,
      kind: 'stay_interview',
      severity: 'overdue',
      employeeId,
      employeeName: employeeDisplayName(employee),
      title: 'Stay interview overdue',
      detail: formatEmployeeDueDateLine(employee),
      drawerTab: 'stay-interviews',
    });
  });

  dueSoonStay.forEach((employee) => {
    const employeeId = String(employee.id || employee.employee_id || '').trim();
    if (overdueStay.some((row) => String(row.id || row.employee_id) === employeeId)) return;

    attentionItems.push({
      id: `stay-soon-${employeeId}`,
      kind: 'stay_interview',
      severity: 'due_soon',
      employeeId,
      employeeName: employeeDisplayName(employee),
      title: 'Stay interview due soon',
      detail: formatEmployeeDueDateLine(employee),
      drawerTab: 'stay-interviews',
    });
  });

  team.forEach((employee) => {
    const item = buildAtRiskAttention(employee, riskMap);
    if (item) attentionItems.push(item);
  });

  const severityRank = { overdue: 0, due_soon: 1, info: 2 };
  attentionItems.sort((left, right) => {
    const rank = severityRank[left.severity] - severityRank[right.severity];
    if (rank !== 0) return rank;
    return left.employeeName.localeCompare(right.employeeName);
  });

  const teamRoster: ManagerTeamMember[] = team
    .map((employee) => {
      const id = String(employee.id || employee.employee_id || '').trim();
      const dueDate = getEmployeeNextStayInterviewDueDate(employee);
      return {
        id,
        name: employeeDisplayName(employee),
        department: String(employee.department || employee.dept || '—').trim() || '—',
        position: String(employee.position || '—').trim() || '—',
        status: String(employee.status || employee.displayStatus || 'ACTIVE').trim(),
        stayInterviewDue: dueDate
          ? formatDueDateLabel(dueDate, readEmployeeNextStayInterviewDateRaw(employee))
          : undefined,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const atRiskCount = attentionItems.filter((item) => item.kind === 'at_risk').length;

  return {
    teamCount: team.length,
    activeCount: activeTeam.length,
    onLeaveStatusCount,
    outTodayCount: outToday.length,
    pendingLeaveCount: pendingLeave.length,
    overdueStayInterviewCount: overdueStay.length,
    atRiskCount,
    outToday,
    pendingLeave,
    attentionItems,
    teamRoster,
  };
}
