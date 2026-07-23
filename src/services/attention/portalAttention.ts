import { isAdminUser, isSupervisorUser } from '../access';
import { employeeMatchesSupervisorAccess } from '../accessScopes';
import { buildHrInboxItems, type HrInboxItem, type HrInboxRoute } from '../hrInbox';
import type { ManagerAttentionItem } from '../managerHome';
import { employeeDisplayName, isActiveDashboardEmployee } from '../employeeUtils';
import { getEmployees } from '../../modules/employees';

/** Unified HR/admin attention queue for portal surfaces (My Tasks, Manager Home). */
export async function buildPortalAttentionInboxItems(force = false): Promise<HrInboxItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) {
    return [];
  }

  if (!force && window.__hrInboxCache !== undefined) {
    return window.__hrInboxCache;
  }

  return buildHrInboxItems();
}

export function inboxItemToManagerAttentionItem(item: HrInboxItem): ManagerAttentionItem {
  let employeeId = '';
  let drawerTab = 'profile';
  let leaveRequestId: string | undefined;

  if (item.route.type === 'employee') {
    employeeId = item.route.employeeId;
    drawerTab = item.route.drawerTab || 'profile';
  } else if (item.route.type === 'payroll_handoff') {
    employeeId = item.route.employeeId;
    drawerTab = 'employee';
  }

  if (item.kind === 'leave_request' && item.id.startsWith('leave:')) {
    leaveRequestId = item.id.slice('leave:'.length);
  }

  return {
    id: item.id,
    kind: item.kind,
    severity: item.severity,
    employeeId,
    employeeName: item.employeeName,
    title: item.title,
    detail: item.detail,
    drawerTab,
    leaveRequestId,
    route: item.route,
  };
}

function buildAtRiskManagerAttentionItems(): ManagerAttentionItem[] {
  if (!isSupervisorUser()) return [];

  const riskMap =
    (window.currentAtRiskRosterMap as Record<
      string,
      { manualReason?: string; disciplineRisk?: boolean; lowReview?: boolean }
    >) || {};

  const items: ManagerAttentionItem[] = [];

  getEmployees()
    .filter((employee) => employeeMatchesSupervisorAccess(employee))
    .forEach((employee) => {
      const employeeId = String(employee.id || employee.employee_id || '').trim();
      if (!employeeId) return;

      const risk =
        riskMap[employeeId] || riskMap[String(employee.dbId || '')] || riskMap[String(employee.employee_id || '')];
      if (!risk) return;

      const reasons: string[] = [];
      if (risk.manualReason) reasons.push(String(risk.manualReason).trim());
      if (risk.disciplineRisk) reasons.push('Severe discipline');
      if (risk.lowReview) reasons.push('Low review score');
      if (!reasons.length) return;

      items.push({
        id: `at-risk-${employeeId}`,
        kind: 'at_risk',
        severity: 'info',
        employeeId,
        employeeName: employeeDisplayName(employee),
        title: 'May need attention',
        detail: reasons.join(' · '),
        drawerTab: 'profile',
        route: { type: 'employee', employeeId, drawerTab: 'profile' },
      });
    });

  return items;
}

const MANAGER_ATTENTION_SEVERITY_RANK = { overdue: 0, due_soon: 1, info: 2 };

export function sortManagerAttentionItems(items: ManagerAttentionItem[]): ManagerAttentionItem[] {
  return [...items].sort((left, right) => {
    const rank =
      MANAGER_ATTENTION_SEVERITY_RANK[left.severity] -
      MANAGER_ATTENTION_SEVERITY_RANK[right.severity];
    if (rank !== 0) return rank;
    return left.employeeName.localeCompare(right.employeeName, undefined, { sensitivity: 'base' });
  });
}

export async function buildManagerHomeAttentionItems(force = false): Promise<ManagerAttentionItem[]> {
  if (!isSupervisorUser()) return [];

  const inboxItems = await buildPortalAttentionInboxItems(force);
  const inboxAttention = inboxItems.map(inboxItemToManagerAttentionItem);
  const atRisk = buildAtRiskManagerAttentionItems();

  const seen = new Set<string>();
  const merged: ManagerAttentionItem[] = [];

  [...inboxAttention, ...atRisk].forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });

  return sortManagerAttentionItems(merged);
}

export async function openPortalAttentionRoute(route: HrInboxRoute): Promise<void> {
  if (route.type === 'view') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView(route.viewId);
    }
    return;
  }

  if (route.type === 'investigation') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('investigationsView');
    }
    if (typeof window.ensureInvestigationsReady === 'function') {
      await window.ensureInvestigationsReady();
    } else if (typeof window.loadInvestigations === 'function') {
      await window.loadInvestigations();
    }
    if (typeof window.openInvestigationDrawer === 'function') {
      await window.openInvestigationDrawer(route.investigationId);
    }
    return;
  }

  if (route.type === 'operations') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('operationsView');
    }
    if (typeof window.openOperationsIssueDrawer === 'function') {
      await window.openOperationsIssueDrawer(route.issueId);
    }
    return;
  }

  if (route.type === 'internal_job') {
    if (typeof window.openInternalJobBoardView === 'function') {
      window.openInternalJobBoardView(route.postingId, 'pipeline');
    } else if (typeof window.switchMainView === 'function') {
      window.switchMainView('internalJobBoardView');
    }
    return;
  }

  if (route.type === 'payroll_handoff') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('employeesView');
    }
    if (typeof window.openEmployeeDrawer === 'function') {
      await window.openEmployeeDrawer(route.employeeId);
    }
    return;
  }

  if (route.type !== 'employee') return;

  if (typeof window.switchMainView === 'function') {
    window.switchMainView('employeesView');
  }
  if (typeof window.openEmployeeDrawer === 'function') {
    await window.openEmployeeDrawer(route.employeeId);
  }

  const tab = route.drawerTab;
  if (!tab) return;

  if (typeof window.switchDrawerTab === 'function') {
    window.switchDrawerTab(tab);
  } else if (typeof window.switchTab === 'function') {
    window.switchTab(tab);
  }
}

/** Supervisor team metrics still computed locally; attention rows come from unified inbox. */
export function countActiveSupervisorTeamMembers(): number {
  return getEmployees().filter(
    (employee) =>
      employeeMatchesSupervisorAccess(employee) && isActiveDashboardEmployee(employee)
  ).length;
}
