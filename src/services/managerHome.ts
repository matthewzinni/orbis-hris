import {
  employeeMatchesSupervisorAccess,
  isSupervisorUser,
} from './access';
import {
  compareEmployeesByLastName,
  employeeDisplayName,
  formatDueDateLabel,
  getEmployeeNextStayInterviewDueDate,
  isActiveDashboardEmployee,
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
import {
  buildManagerHomeAttentionItems,
  countActiveSupervisorTeamMembers,
} from './attention/portalAttention';

import type { HrInboxKind, HrInboxRoute, HrInboxSeverity } from './hrInbox';

export type ManagerAttentionKind = HrInboxKind | 'at_risk';

export type ManagerAttentionItem = {
  id: string;
  kind: ManagerAttentionKind;
  severity: HrInboxSeverity;
  employeeId: string;
  employeeName: string;
  title: string;
  detail: string;
  drawerTab: string;
  leaveRequestId?: string;
  route?: HrInboxRoute;
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

  const [outTodayAll, pendingAll, attentionItems] = await Promise.all([
    loadApprovedLeaveOutToday(),
    loadPendingLeaveRequests(),
    buildManagerHomeAttentionItems(),
  ]);

  const outToday = outTodayAll.filter((row) => isScopedLeave(row, teamIds));
  const pendingLeave = pendingAll.filter(
    (row) => isScopedLeave(row, teamIds) && row.status === 'requested'
  );

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
  const activeCount = countActiveSupervisorTeamMembers();

  return {
    teamCount: team.length,
    activeCount,
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
