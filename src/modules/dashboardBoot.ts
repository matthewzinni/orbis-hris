// ============================================
// Dashboard data boot + legacy fallbacks
// ============================================

import { loadEmployees } from './employees';
import { loadCandidates } from './candidates';
import {
  daysUntilDate,
  employeeDisplayName,
  isActiveDashboardEmployee,
} from '../services/employeeUtils';

type EmployeeRow = Record<string, unknown>;

let isLoadingDashboard = false;

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function setText(id: string, value: unknown): void {
  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }
  const el = safeGet(id);
  if (el) el.textContent = String(value ?? '');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function fillEmptyKpiValue(id: string, fallbackValue = '0'): void {
  const el = safeGet(id);
  if (!el) return;

  const currentValue = String(el.textContent || '').trim();

  if (!currentValue || currentValue === '—' || currentValue === '-') {
    el.textContent = fallbackValue;
  }
}

export function cleanReviewDashboardLooseCount(): void {
  const reviewCard =
    findDashboardCardByTitle('Review Dashboard') ||
    document.querySelector('#reviewDashboardCard, .review-dashboard-card');

  if (!reviewCard) return;

  Array.from(reviewCard.childNodes || []).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = String(node.textContent || '').trim();
    if (/^\d+$/.test(text)) {
      node.textContent = '';
    }
  });

  Array.from(reviewCard.querySelectorAll('div, span, p')).forEach((el) => {
    if (el.children.length) return;
    const text = String(el.textContent || '').trim();
    if (/^\d+$/.test(text) && !el.id.startsWith('k')) {
      el.classList.add('hidden');
      el.textContent = '';
    }
  });
}

function getDashboardEmployees(): EmployeeRow[] {
  if (Array.isArray(window.EMPLOYEES) && window.EMPLOYEES.length) {
    return window.EMPLOYEES;
  }
  if (Array.isArray(window.ALL_EMPLOYEES) && window.ALL_EMPLOYEES.length) {
    return window.ALL_EMPLOYEES;
  }
  return [];
}

function findDashboardCardByTitle(titleText: string): Element | null {
  const normalizedTitle = String(titleText || '')
    .trim()
    .toLowerCase();

  return (
    Array.from(document.querySelectorAll('.card, .panel, section, article, div')).find((el) => {
      const heading = el.querySelector(
        'h1, h2, h3, h4, h5, h6, .card-title, .section-title, .panel-title, .dashboard-card-title'
      );
      const headingText = String(heading?.textContent || '')
        .trim()
        .toLowerCase();
      if (headingText === normalizedTitle) return true;

      const ownText = Array.from(el.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return ownText === normalizedTitle;
    }) || null
  );
}

function getOrCreateDashboardSectionBody(titleText: string, preferredId: string): HTMLElement | null {
  const existing = safeGet(preferredId);
  if (existing && !existing.closest('.kpi-card, .metric-card, .stat-card, .review-stat')) {
    return existing;
  }

  const normalizedTitle = String(titleText || '')
    .trim()
    .toLowerCase();
  const cards = Array.from(document.querySelectorAll('.dashboard-card, .dashboard-section'));
  const card = cards.find((el) => {
    if (el.closest('.kpi-card, .metric-card, .stat-card, .review-stat')) return false;

    const heading = el.querySelector(
      'h1, h2, h3, h4, h5, h6, .card-title, .section-title, .panel-title, .dashboard-card-title'
    );
    const headingText = String(heading?.textContent || '')
      .trim()
      .toLowerCase();
    return headingText === normalizedTitle;
  });

  if (!card) return null;

  const body = card.querySelector(
    '.card-body, .panel-body, .dashboard-card-body, .section-body, [data-dashboard-body="true"]'
  ) as HTMLElement | null;

  if (body) {
    body.id = preferredId;
    return body;
  }

  return null;
}

function findDashboardValueCardByLabel(labelText: string): Element | null {
  const normalizedLabel = String(labelText || '')
    .trim()
    .toLowerCase();

  return (
    Array.from(document.querySelectorAll('.review-stat, .metric-card, .dashboard-stat')).find(
      (el) => {
        const text = String(el.textContent || '')
          .trim()
          .toLowerCase();
        return text.includes(normalizedLabel);
      }
    ) || null
  );
}

function setDashboardMetricByLabel(labelText: string, value: unknown): void {
  const card = findDashboardValueCardByLabel(labelText);
  if (!card) return;

  const valueEl =
    card.querySelector('.kpi-value, .metric-value, .stat-value, strong, b') ||
    Array.from(card.children || []).find((child) =>
      /^[-—\d]+$/.test(String(child.textContent || '').trim())
    );

  if (valueEl) {
    valueEl.textContent = String(value);
    return;
  }

  const labelNode = Array.from(card.childNodes || []).find((node) =>
    String(node.textContent || '')
      .trim()
      .toLowerCase()
      .includes(
        String(labelText || '')
          .trim()
          .toLowerCase()
      )
  );

  if (labelNode?.nextSibling) {
    labelNode.nextSibling.textContent = String(value);
  }
}

async function loadSummaryMetricsFallback(): Promise<void> {
  if (typeof window.loadSummaryMetrics === 'function') {
    await window.loadSummaryMetrics();
    return;
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export async function loadReviewDashboardFallback(): Promise<void> {
  const employees = getDashboardEmployees().filter((e) => isActiveDashboardEmployee(e));
  const reviewRows = employees
    .map((employee) => {
      const nextReview =
        employee.next_review_date || employee.nextReviewDate || employee.nextReview || '';
      const days = daysUntilDate(nextReview);
      return { employee, nextReview, days };
    })
    .filter((row) => row.nextReview)
    .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999));

  const overdue = reviewRows.filter((row) => row.days !== null && row.days < 0).length;
  const dueSoon = reviewRows.filter(
    (row) => row.days !== null && row.days >= 0 && row.days <= 30
  ).length;

  fillEmptyKpiValue('kReviewsDue', String(dueSoon));
  cleanReviewDashboardLooseCount();
  setDashboardMetricByLabel('Overdue Reviews', overdue);
  setDashboardMetricByLabel('Due in 30 Days', dueSoon);
  setDashboardMetricByLabel('Completed in 30 Days', '0');

  const tableBody =
    safeGet('reviewDashboardBody') ||
    safeGet('reviewsDashboardBody') ||
    document.querySelector(
      '#reviewDashboard tbody, #reviewsDashboard tbody, #tab-reviews-dashboard tbody'
    );

  if (!tableBody) return;

  const rowsToShow = reviewRows.slice(0, 8);

  if (!rowsToShow.length) {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="empty">No review dates found.</td></tr>';
    return;
  }

  tableBody.innerHTML = rowsToShow
    .map((row) => {
      const employee = row.employee;
      const days = row.days ?? 99999;
      const status = days < 0 ? 'Overdue' : days <= 30 ? 'Due Soon' : 'Scheduled';
      return `
            <tr>
                <td><button class="link-button" type="button" data-employee-id="${esc(employee.id || employee.dbId || employee.employee_id || '')}">${esc(employeeDisplayName(employee))}</button></td>
                <td>${esc(employee.department || employee.dept || '')}</td>
                <td>${esc(row.nextReview || '—')}</td>
                <td>—</td>
                <td>—</td>
                <td>${esc(status)}</td>
            </tr>
        `;
    })
    .join('');
}

export async function loadExecutiveInsightFallback(): Promise<void> {
  const employees = getDashboardEmployees();
  const activeEmployees = employees.filter((e) => isActiveDashboardEmployee(e));
  const onLeave = employees.filter(
    (employee) => String(employee.status || '').toUpperCase() === 'LEAVE'
  ).length;
  const departments = new Set(
    activeEmployees
      .map((employee) => String(employee.department || employee.dept || '').trim())
      .filter(Boolean)
  );

  const insightEl = getOrCreateDashboardSectionBody('Executive Insight', 'executiveInsight');
  if (!insightEl) return;

  insightEl.innerHTML = `
        <div class="insight-line"><strong>${activeEmployees.length}</strong> active employees across <strong>${departments.size}</strong> department${departments.size === 1 ? '' : 's'}.</div>
        <div class="insight-line">${onLeave} employee${onLeave === 1 ? '' : 's'} currently marked on leave.</div>
        <div class="insight-line">Review, risk, and impact lists are being calculated from current employee records.</div>
    `;
}

export async function loadRiskEmployeesFallback(): Promise<void> {
  const employees = getDashboardEmployees().filter((e) => isActiveDashboardEmployee(e));
  const riskMap = window.currentAtRiskRosterMap || {};

  const riskEmployees = employees.filter((employee) => {
    if (typeof window.getEmployeeRiskMeta === 'function') {
      return Boolean(window.getEmployeeRiskMeta(employee));
    }

    const key = String(employee.dbId || employee.id || employee.employee_id || '');
    const meta = riskMap[key] as { manualReason?: string; lowReview?: boolean; openIncidentCount?: number } | undefined;
    return Boolean(
      meta &&
        (meta.lowReview === true ||
          (meta.openIncidentCount ?? 0) > 0 ||
          String(meta.manualReason || '').trim() !== '')
    );
  });

  setText('kAtRiskEmployees', String(riskEmployees.length));

  const container =
    safeGet('riskEmployees') ||
    getOrCreateDashboardSectionBody('At-Risk Employees', 'riskEmployees');

  if (!container) return;

  if (!riskEmployees.length) {
    container.innerHTML =
      '<div class="empty">No at-risk employees currently flagged.</div>';
    return;
  }

  container.innerHTML = riskEmployees
    .slice(0, 8)
    .map(
      (employee) => `
        <div class="dashboard-list-item">
            <strong>${esc(employeeDisplayName(employee))}</strong>
            <span>${esc(employee.department || employee.dept || '')}</span>
        </div>
    `
    )
    .join('');
}

export async function loadImpactPlayersFallback(): Promise<void> {
  const employees = getDashboardEmployees().filter((e) => isActiveDashboardEmployee(e));
  const impactMap = window.currentImpactPlayerRosterMap || {};

  const impactPlayers = employees.filter((employee) => {
    const keys = [employee.dbId, employee.id, employee.employee_id, employee.displayId]
      .filter(Boolean)
      .map(String);

    const mapMeta = keys.map((key) => impactMap[key]).find(Boolean) as
      | { manualReason?: string; highReview?: boolean; reviewScore?: number }
      | undefined;
    const manualImpact = mapMeta?.manualReason || employee.impact_reason;
    const highReview = mapMeta?.highReview === true;
    const flag = employee.impact_player || employee.is_impact_player || employee.impactPlayer;

    return (
      Boolean(manualImpact) ||
      highReview ||
      flag === true ||
      String(flag || '').toLowerCase() === 'true'
    );
  });

  setText('kImpactPlayers', String(impactPlayers.length));

  const container = getOrCreateDashboardSectionBody(
    'Impact Players',
    'impactPlayersDashboardList'
  );

  if (!container) return;

  if (!impactPlayers.length) {
    container.innerHTML =
      '<div class="empty">No impact players currently flagged.</div>';
    return;
  }

  container.innerHTML = impactPlayers
    .slice(0, 8)
    .map((employee) => {
      const keys = [employee.dbId, employee.id, employee.employee_id, employee.displayId]
        .filter(Boolean)
        .map(String);
      const mapMeta =
        keys.map((key) => impactMap[key]).find(Boolean) ||
        ({} as { reviewScore?: number });
      const scoreText = mapMeta.reviewScore
        ? `Review score: ${Number(mapMeta.reviewScore).toFixed(1)}`
        : '';

      return `
        <div class="dashboard-list-item">
            <strong>${esc(employeeDisplayName(employee))}</strong>
            <span>${esc(employee.department || employee.dept || '')}</span>
            ${scoreText ? `<small>${esc(scoreText)}</small>` : ''}
        </div>
      `;
    })
    .join('');
}

export async function loadAllDashboardData(): Promise<void> {
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;

  try {
    await loadEmployees();

    if (typeof window.renderRoster === 'function') {
      window.renderRoster();
    }

    await Promise.allSettled([
      loadCandidates(),
      loadSummaryMetricsFallback(),
      typeof window.loadRecentActivityFallback === 'function'
        ? window.loadRecentActivityFallback()
        : Promise.resolve(),
    ]);

    try {
      await loadReviewDashboardFallback();
    } catch (err) {
      console.warn('Review dashboard fallback failed.', err);
    }

    try {
      await loadExecutiveInsightFallback();
    } catch (err) {
      console.warn('Executive insight fallback failed.', err);
    }

    try {
      await loadRiskEmployeesFallback();
    } catch (err) {
      console.warn('Risk employees fallback failed.', err);
    }

    try {
      await loadImpactPlayersFallback();
    } catch (err) {
      console.warn('Impact players fallback failed.', err);
    }

    cleanReviewDashboardLooseCount();

    if (typeof window.renderBasicDashboardKpis === 'function') {
      window.renderBasicDashboardKpis();
    }

    setText(
      'lastRefresh',
      new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    );
  } catch (err) {
    console.error(err);
    showToast('Could not refresh dashboard data.', 'error');
  } finally {
    if (typeof window.renderBasicDashboardKpis === 'function') {
      window.renderBasicDashboardKpis();
    }
    cleanReviewDashboardLooseCount();
    isLoadingDashboard = false;
  }

  if (typeof window.initKpiHoverUi === 'function') {
    window.initKpiHoverUi();
  }

  if (typeof window.buildKpiHoverDetails === 'function') {
    window.buildKpiHoverDetails();
  }
}

declare global {
  interface Window {
    loadAllDashboardData?: () => Promise<void>;
    loadReviewDashboardFallback?: () => Promise<void>;
    loadExecutiveInsightFallback?: () => Promise<void>;
    loadRiskEmployeesFallback?: () => Promise<void>;
    loadImpactPlayersFallback?: () => Promise<void>;
    loadRecentActivityFallback?: () => Promise<unknown>;
    cleanReviewDashboardLooseCount?: () => void;
    currentAtRiskRosterMap?: Record<string, unknown>;
    currentImpactPlayerRosterMap?: Record<string, unknown>;
    initKpiHoverUi?: () => void;
    buildKpiHoverDetails?: () => void;
    buildRiskPreview?: () => void;
  }
}

window.loadAllDashboardData = loadAllDashboardData;
window.loadReviewDashboardFallback = loadReviewDashboardFallback;
window.loadExecutiveInsightFallback = loadExecutiveInsightFallback;
window.loadRiskEmployeesFallback = loadRiskEmployeesFallback;
window.loadImpactPlayersFallback = loadImpactPlayersFallback;
window.cleanReviewDashboardLooseCount = cleanReviewDashboardLooseCount;

window.loadRecentActivityFallback =
  window.loadRecentActivityFallback ||
  function loadRecentActivityFallback() {
    console.warn('loadRecentActivityFallback bridge fallback loaded');
    return Promise.resolve();
  };

window.renderBasicDashboardKpis =
  window.renderBasicDashboardKpis ||
  function renderBasicDashboardKpisFallback() {
    console.warn('renderBasicDashboardKpis bridge fallback loaded');
  };
