import { getEmployeeRiskMeta, hasActiveRiskMeta } from './badges';
import {
  buildHrIntelligenceContext,
  employeeHasOperationsPressure,
  isTurnoverRiskContributor,
} from '../services/hrIntelligence';
import { getEmployeeTenureMonths } from '../services/employeeTenure';

type RiskSignalItem = {
  tone: 'risk' | 'warn' | 'neutral';
  text: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function buildEmployeeRiskSignalItems(
  employee: Record<string, unknown> | null | undefined
): RiskSignalItem[] {
  if (!employee) return [];

  const riskMeta = getEmployeeRiskMeta(employee);
  const items: RiskSignalItem[] = [];

  if (riskMeta?.lowReview) {
    const score =
      riskMeta.reviewScore !== null && riskMeta.reviewScore !== undefined
        ? ` (${Number(riskMeta.reviewScore).toFixed(1)} avg)`
        : '';
    items.push({
      tone: 'risk',
      text: `Low stay interview / review scores${score}`,
    });
  }

  const manualReason = String(riskMeta?.manualReason || '').trim();
  if (manualReason) {
    items.push({
      tone: 'risk',
      text: `HR at-risk flag — ${manualReason}`,
    });
  }

  if (riskMeta?.disciplineRisk) {
    items.push({
      tone: 'risk',
      text: 'Severe discipline on file (Final Warning or higher)',
    });
  }

  const context =
    window.hrIntelligenceContext ||
    buildHrIntelligenceContext({
      employees: (window.EMPLOYEES || window.ALL_EMPLOYEES || []) as Array<Record<string, unknown>>,
    });
  const tenureMonths = getEmployeeTenureMonths(employee);
  const turnoverContributor = isTurnoverRiskContributor(
    employee,
    riskMeta,
    context,
    tenureMonths
  );

  if (employeeHasOperationsPressure(employee, context)) {
    items.push({
      tone: 'warn',
      text: 'Elevated open or recurring operations issues for this employee or department',
    });
  }

  if (tenureMonths > 0 && tenureMonths <= 6 && turnoverContributor && !hasActiveRiskMeta(riskMeta)) {
    items.push({
      tone: 'warn',
      text: `Early tenure (${tenureMonths} mo) with retention risk indicators`,
    });
  }

  if (turnoverContributor && !items.length) {
    items.push({
      tone: 'warn',
      text: 'Included in dashboard turnover risk based on workforce signals',
    });
  }

  return items;
}

export function renderEmployeeDrawerRiskSignals(
  employee: Record<string, unknown> | null | undefined
): void {
  const container = document.getElementById('employeeDrawerRiskSignals');
  if (!container) return;

  const items = buildEmployeeRiskSignalItems(employee);

  if (!items.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="employee-drawer-risk-signals-inner">
      <div class="employee-drawer-risk-signals-title">Risk signals</div>
      <ul class="employee-drawer-risk-signals-list">
        ${items
          .map(
            (item) =>
              `<li class="employee-drawer-risk-signal employee-drawer-risk-signal--${escapeHtml(item.tone)}">${escapeHtml(item.text)}</li>`
          )
          .join('')}
      </ul>
    </div>
  `;
}

export function clearEmployeeDrawerRiskSignals(): void {
  const container = document.getElementById('employeeDrawerRiskSignals');
  if (!container) return;
  container.classList.add('hidden');
  container.innerHTML = '';
}

export function refreshEmployeeDrawerRiskSignalsIfOpen(): void {
  const drawer = document.getElementById('employeeDrawer');
  if (!drawer?.classList.contains('open')) return;
  const employee = window.currentEmployee as Record<string, unknown> | undefined;
  if (!employee || window.isCreatingEmployee) {
    clearEmployeeDrawerRiskSignals();
    return;
  }
  renderEmployeeDrawerRiskSignals(employee);
}

window.renderEmployeeDrawerRiskSignals = renderEmployeeDrawerRiskSignals;
window.refreshEmployeeDrawerRiskSignalsIfOpen = refreshEmployeeDrawerRiskSignalsIfOpen;
window.clearEmployeeDrawerRiskSignals = clearEmployeeDrawerRiskSignals;
