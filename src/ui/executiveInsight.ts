import {
  buildExecutiveInsightLines,
  buildHrIntelligenceContext,
  type AtRiskIntelligenceMeta,
  type HrIntelligenceContext,
} from '../services/hrIntelligence';
import { employeeDisplayName, isActiveDashboardEmployee } from '../services/employeeUtils';

type DashboardEmployee = Record<string, unknown>;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getDashboardEmployees(): DashboardEmployee[] {
  const roster =
    window.currentEmployeeRoster ||
    window.EMPLOYEES ||
    window.ALL_EMPLOYEES ||
    [];
  return Array.isArray(roster) ? roster : [];
}

function renderInsightLine(line: { tone: string; text: string }): string {
  return `<div class="insight-line insight-line--${escapeHtml(line.tone)}">${escapeHtml(line.text)}</div>`;
}

export function renderExecutiveInsightHtml(lines: Array<{ tone: string; text: string }>): string {
  return lines.map(renderInsightLine).join('');
}

export function buildExecutiveInsightFromState(input?: {
  employees?: DashboardEmployee[];
  atRiskMap?: Record<string, AtRiskIntelligenceMeta>;
  intelligenceContext?: HrIntelligenceContext;
  openDisciplineCount?: number;
  openInvestigationCount?: number;
}): string {
  const employees = input?.employees || getDashboardEmployees();
  const activeEmployees = employees.filter((employee) => isActiveDashboardEmployee(employee));
  const departments = new Set(
    activeEmployees
      .map((employee) => String(employee.department || employee.dept || '').trim())
      .filter(Boolean)
  );
  const onLeave = employees.filter(
    (employee) => String(employee.status || '').toUpperCase() === 'LEAVE'
  ).length;

  const context =
    input?.intelligenceContext ||
    window.hrIntelligenceContext ||
    buildHrIntelligenceContext({ employees: activeEmployees });

  const atRiskMap = input?.atRiskMap || (window.currentAtRiskRosterMap as Record<string, AtRiskIntelligenceMeta>) || {};

  const openDisciplineCount =
    input?.openDisciplineCount ??
    [...context.disciplineOpenByEmployee.values()].reduce((sum, count) => sum + count, 0);

  const openInvestigationCount =
    input?.openInvestigationCount ?? context.openInvestigationEmployeeIds.size;

  const lines = buildExecutiveInsightLines({
    activeCount: activeEmployees.length,
    departmentCount: departments.size,
    onLeaveCount: onLeave,
    context,
    atRiskMap,
    openDisciplineCount,
    openInvestigationCount,
    overdueStayCount: context.stayInterviewOverdueIds.size,
    dueSoonStayCount: context.stayInterviewDueSoonIds.size,
  });

  return renderExecutiveInsightHtml(lines);
}

export function loadExecutiveInsight(): void {
  const insightEl = document.getElementById('executiveInsight');
  if (!insightEl) return;

  insightEl.innerHTML = buildExecutiveInsightFromState();
  insightEl.classList.add('orbis-fade-in');
}

declare global {
  interface Window {
    hrIntelligenceContext?: HrIntelligenceContext;
    loadExecutiveInsight?: () => void;
    buildExecutiveInsightFromState?: typeof buildExecutiveInsightFromState;
  }
}

window.loadExecutiveInsight = loadExecutiveInsight;
window.buildExecutiveInsightFromState = buildExecutiveInsightFromState;
