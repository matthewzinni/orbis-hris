// ============================================
// Dashboard data boot + legacy fallbacks
// ============================================

import { supabaseClient } from '../services/supabaseClient';
import { loadEmployees } from './employees';
import { loadCandidates } from './candidates';
import {
  compareEmployeesByLastName,
  daysUntilDate,
  employeeDisplayName,
  isActiveDashboardEmployee,
  isStayInterviewEligibleEmployee,
} from '../services/employeeUtils';
import {
  renderDashboardRetryState,
  renderDashboardRetryTableRow,
  updateDashboardSyncStatus,
  type DashboardSyncStatus,
} from '../ui/dashboardRetry';

type EmployeeRow = Record<string, unknown>;

let isLoadingDashboard = false;

let lastStayInterviewSummaryCounts: {
  overdue: number;
  dueSoon: number;
  completed: number;
} | null = null;

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

let stayInterviewDashboardBound = false;
let dashboardEmployeeLinksBound = false;

function getEmployeeDrawerId(employee: EmployeeRow): string {
  return String(
    employee.dbId || employee.id || employee.employee_id || employee.displayId || ''
  ).trim();
}

function renderDashboardEmployeeNameLink(
  employee: EmployeeRow,
  title = 'Open employee profile'
): string {
  const employeeId = getEmployeeDrawerId(employee);
  const name = employeeDisplayName(employee);

  if (!employeeId) {
    return esc(name);
  }

  return `<button class="link-button" type="button" data-employee-id="${esc(employeeId)}" title="${esc(title)}">${esc(name)}</button>`;
}

async function openDashboardEmployeeDrawer(employeeId: string): Promise<void> {
  if (!employeeId) {
    return;
  }

  if (typeof window.openEmployeeDrawer === 'function') {
    await window.openEmployeeDrawer(employeeId);
  }
}

function ensureDashboardEmployeeLinkBindings(): void {
  if (dashboardEmployeeLinksBound) {
    return;
  }

  const riskEl = safeGet('riskEmployees');
  const impactEl = safeGet('impactPlayers');

  if (!riskEl && !impactEl) {
    return;
  }

  dashboardEmployeeLinksBound = true;

  const handleEmployeeLinkClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-employee-id]');

    if (!button) {
      return;
    }

    const employeeId = button.dataset.employeeId || '';

    if (!employeeId) {
      return;
    }

    event.preventDefault();
    void openDashboardEmployeeDrawer(employeeId);
  };

  riskEl?.addEventListener('click', handleEmployeeLinkClick);
  impactEl?.addEventListener('click', handleEmployeeLinkClick);
}

async function openEmployeeStayInterviewTab(employeeId: string): Promise<void> {
  if (!employeeId) {
    return;
  }

  if (typeof window.openEmployeeDrawer === 'function') {
    await window.openEmployeeDrawer(employeeId);
  }

  if (typeof window.switchTab === 'function') {
    window.switchTab('stay-interviews');
  } else if (typeof window.switchDrawerTab === 'function') {
    window.switchDrawerTab('stay-interviews');
  }
}

function ensureStayInterviewDashboardBindings(): void {
  if (stayInterviewDashboardBound) {
    return;
  }

  const bodyTarget = safeGet('reviewDashboardBody');

  if (!bodyTarget) {
    return;
  }

  stayInterviewDashboardBound = true;

  bodyTarget.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-employee-id]');

    if (!button) {
      return;
    }

    const employeeId = button.dataset.employeeId || '';

    if (!employeeId) {
      return;
    }

    void openEmployeeStayInterviewTab(employeeId);
  });
}

export function cleanReviewDashboardLooseCount(): void {
  const reviewCard =
    document.querySelector('#reviewDashboardCard') ||
    findDashboardCardByTitle('Stay Interview Dashboard') ||
    findDashboardCardByTitle('Review Dashboard') ||
    document.querySelector('.review-dashboard-card');

  if (!reviewCard) return;

  // Only remove stray numeric text nodes directly under the card shell — never
  // summary metric values (they live in #reviewDashboardSummary).
  Array.from(reviewCard.childNodes || []).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = String(node.textContent || '').trim();
    if (/^\d+$/.test(text)) {
      node.textContent = '';
    }
  });
}

function refreshStayInterviewDashboardSummaryFromCache(): void {
  if (!lastStayInterviewSummaryCounts) return;

  const { overdue, dueSoon, completed } = lastStayInterviewSummaryCounts;
  renderStayInterviewDashboardSummary(overdue, dueSoon, completed);
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

function resolveDashboardListContainer(...candidateIds: string[]): HTMLElement | null {
  for (const id of candidateIds) {
    const existing = safeGet(id);

    if (existing && !existing.closest('.kpi-card, .metric-card, .stat-card, .review-stat')) {
      return existing;
    }
  }

  return null;
}

function getOrCreateDashboardSectionBody(titleText: string, preferredId: string): HTMLElement | null {
  const direct = resolveDashboardListContainer(preferredId);

  if (direct) return direct;

  const normalizedTitle = String(titleText || '')
    .trim()
    .toLowerCase();
  const cards = Array.from(
    document.querySelectorAll('.card, .dashboard-card, .dashboard-section, section')
  );
  const card = cards.find((el) => {
    if (el.closest('.kpi-card, .metric-card, .stat-card, .review-stat')) return false;

    const heading = el.querySelector(
      '.card-header, h1, h2, h3, h4, h5, h6, .card-title, .section-title, .panel-title, .dashboard-card-title'
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

function isReviewEligibleEmployee(employee: EmployeeRow): boolean {
  return isStayInterviewEligibleEmployee(employee);
}

function getEmployeeRecordKeys(employee: EmployeeRow): string[] {
  return [employee.dbId, employee.id, employee.employee_id, employee.displayId]
    .filter(Boolean)
    .map(String);
}

function setStayInterviewSummaryMetric(el: HTMLElement | null, value: number): void {
  if (!el) return;

  const text = String(value);
  el.classList.remove('hidden');
  el.textContent = text;
  el.setAttribute('data-stay-interview-count', text);
}

function renderStayInterviewDashboardSummary(
  overdue: number,
  dueSoon: number,
  completed: number
): void {
  lastStayInterviewSummaryCounts = { overdue, dueSoon, completed };

  const overdueEl = safeGet('reviewDashboardOverdue');
  const dueSoonEl = safeGet('reviewDashboardDueSoon');
  const completedEl = safeGet('reviewDashboardCompleted');

  if (overdueEl && dueSoonEl && completedEl) {
    setStayInterviewSummaryMetric(overdueEl, overdue);
    setStayInterviewSummaryMetric(dueSoonEl, dueSoon);
    setStayInterviewSummaryMetric(completedEl, completed);
    return;
  }

  const summary = safeGet('reviewDashboardSummary');

  if (summary) {
    summary.innerHTML = `
      <div class="detail-card">
        <div class="detail-label">Overdue Interviews</div>
        <div class="detail-value" id="reviewDashboardOverdue" data-stay-interview-metric="overdue">${esc(overdue)}</div>
      </div>
      <div class="detail-card">
        <div class="detail-label">Due in 30 Days</div>
        <div class="detail-value" id="reviewDashboardDueSoon" data-stay-interview-metric="due-soon">${esc(dueSoon)}</div>
      </div>
      <div class="detail-card">
        <div class="detail-label">Completed in 30 Days</div>
        <div class="detail-value" id="reviewDashboardCompleted" data-stay-interview-metric="completed">${esc(completed)}</div>
      </div>
    `;
    return;
  }

  setDashboardMetricByLabel('Overdue Interviews', overdue);
  setDashboardMetricByLabel('Overdue Reviews', overdue);
  setDashboardMetricByLabel('Due in 30 Days', dueSoon);
  setDashboardMetricByLabel('Completed in 30 Days', completed);
}

function findDashboardValueCardByLabel(labelText: string): Element | null {
  const normalizedLabel = String(labelText || '')
    .trim()
    .toLowerCase();

  return (
    Array.from(
      document.querySelectorAll('.review-stat, .metric-card, .dashboard-stat, .detail-card')
    ).find((el) => {
      const label = el.querySelector('.detail-label, .kpi-label, .metric-label');
      const labelText = String(label?.textContent || el.textContent || '')
        .trim()
        .toLowerCase();

      return labelText.includes(normalizedLabel);
    }) || null
  );
}

function setDashboardMetricByLabel(labelText: string, value: unknown): void {
  const summary = safeGet('reviewDashboardSummary');

  if (summary) {
    const cards = Array.from(summary.querySelectorAll('.detail-card'));
    const normalizedLabel = String(labelText || '')
      .trim()
      .toLowerCase();
    const card = cards.find((el) => {
      const label = el.querySelector('.detail-label');
      return (
        String(label?.textContent || '')
          .trim()
          .toLowerCase() === normalizedLabel
      );
    });

    if (card) {
      const valueEl = card.querySelector('.detail-value');

      if (valueEl) {
        valueEl.textContent = String(value);
        return;
      }
    }
  }

  const card = findDashboardValueCardByLabel(labelText);
  if (!card) return;

  const valueEl =
    card.querySelector('.detail-value, .kpi-value, .metric-value, .stat-value, strong, b') ||
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
  try {
    if (typeof window.loadSummaryMetrics === 'function') {
      await window.loadSummaryMetrics();
      return;
    }

    if (typeof window.renderBasicDashboardKpis === 'function') {
      window.renderBasicDashboardKpis();
    }
  } catch (err) {
    console.error('[Dashboard] KPI summary load failed:', err);

    if (typeof window.renderBasicDashboardKpis === 'function') {
      window.renderBasicDashboardKpis();
    }
  }
}

function getEmployeeNextStayInterviewDate(employee: EmployeeRow): string {
  return String(
    employee.next_review_date || employee.nextReviewDate || employee.nextReview || ''
  ).trim();
}

function upsertLatestStayInterviewByEmployee(
  target: Record<string, { interviewDate: string; interviewType: string; sortDate: string }>,
  employeeId: string,
  interviewDate: string,
  interviewType: string,
  sortDate: string
): void {
  if (!employeeId) {
    return;
  }

  const existing = target[employeeId];

  if (!existing || String(sortDate) > String(existing.sortDate)) {
    target[employeeId] = {
      interviewDate,
      interviewType: interviewType || 'Stay Interview',
      sortDate: String(sortDate),
    };
  }
}

export async function loadReviewDashboardFallback(): Promise<void> {
  const summaryTarget = safeGet('reviewDashboardSummary');
  const bodyTarget = safeGet('reviewDashboardBody');

  if (!summaryTarget && !bodyTarget) return;

  ensureStayInterviewDashboardBindings();

  const activeEmployees = getDashboardEmployees().filter((employee) =>
    isReviewEligibleEmployee(employee)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last30 = new Date(today);
  last30.setDate(last30.getDate() - 30);

  try {
    const stayInterviewsRes = await supabaseClient
      .from('stay_interviews')
      .select('employee_id, interview_date, interview_type, created_at')
      .order('interview_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (stayInterviewsRes.error) {
      throw stayInterviewsRes.error;
    }

    const lastStayInterviewByEmployee: Record<
      string,
      { interviewDate: string; interviewType: string; sortDate: string }
    > = {};

    (stayInterviewsRes.data || []).forEach((row) => {
      const record = row as {
        employee_id?: string;
        interview_date?: string;
        interview_type?: string;
        created_at?: string;
      };
      const employeeId = String(record.employee_id || '').trim();
      const interviewDate = String(record.interview_date || '').trim();
      const sortDate = interviewDate || String(record.created_at || '').trim();

      if (!employeeId || !sortDate) {
        return;
      }

      upsertLatestStayInterviewByEmployee(
        lastStayInterviewByEmployee,
        employeeId,
        interviewDate,
        String(record.interview_type || '').trim(),
        sortDate
      );
    });

    const overdueInterviews = activeEmployees.filter((employee) => {
      const days = daysUntilDate(getEmployeeNextStayInterviewDate(employee));

      return days !== null && days < 0;
    }).length;

    const dueSoonInterviews = activeEmployees.filter((employee) => {
      const days = daysUntilDate(getEmployeeNextStayInterviewDate(employee));

      return days !== null && days >= 0 && days <= 30;
    }).length;

    const completedLast30Days = (stayInterviewsRes.data || []).filter((row) => {
      const interviewDate = String((row as { interview_date?: string }).interview_date || '').trim();

      if (!interviewDate) {
        return false;
      }

      const parsed = new Date(`${interviewDate}T00:00:00`);

      return parsed >= last30 && parsed <= today;
    }).length;

    fillEmptyKpiValue('kReviewsDue', String(overdueInterviews));
    renderStayInterviewDashboardSummary(
      overdueInterviews,
      dueSoonInterviews,
      completedLast30Days
    );

    if (!bodyTarget) return;

    const interviewRows = activeEmployees
      .map((employee) => {
        const nextInterviewRaw = getEmployeeNextStayInterviewDate(employee);
        const days = daysUntilDate(nextInterviewRaw);

        let statusLabel = 'No Date';
        let statusClass = 'badge badge-soft';

        if (days !== null) {
          if (days < 0) {
            statusLabel = 'Overdue';
            statusClass = 'badge badge-inactive';
          } else if (days <= 30) {
            statusLabel = 'Due Soon';
            statusClass = 'badge badge-leave';
          } else {
            statusLabel = 'Scheduled';
            statusClass = 'badge badge-active';
          }
        }

        const employeeKeys = getEmployeeRecordKeys(employee);
        const lastInterviewKey = employeeKeys.find((key) => lastStayInterviewByEmployee[key]);
        const lastInterview = lastInterviewKey
          ? lastStayInterviewByEmployee[lastInterviewKey]
          : null;

        const interviewType = lastInterview
          ? {
              label: lastInterview.interviewType || 'Stay Interview',
              badgeClass: 'badge badge-soft',
            }
          : { label: 'Not recorded', badgeClass: 'badge badge-soft' };

        return {
          employee,
          nextInterview: nextInterviewRaw,
          days,
          lastInterview: lastInterview?.interviewDate || '',
          interviewType,
          statusLabel,
          statusClass,
        };
      })
      .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999))
      .slice(0, 12);

    if (!interviewRows.length) {
      bodyTarget.innerHTML =
        '<tr><td colspan="6" class="empty">No stay interview schedule data available.</td></tr>';
      window.renderMobileStayInterviewCards?.([]);
      return;
    }

    bodyTarget.innerHTML = interviewRows
      .map(
        ({ employee, nextInterview, lastInterview, interviewType, statusLabel, statusClass }) => `
          <tr>
            <td>
              <button class="link-button" type="button" data-employee-id="${esc(employee.dbId || employee.id || employee.employee_id || '')}" title="Open stay interview tab">
                ${esc(employeeDisplayName(employee))}
              </button>
            </td>
            <td>${esc(employee.department || employee.dept || '')}</td>
            <td>${esc(nextInterview || '—')}</td>
            <td>${esc(lastInterview || '—')}</td>
            <td><span class="${esc(interviewType.badgeClass)}">${esc(interviewType.label)}</span></td>
            <td><span class="${esc(statusClass)}">${esc(statusLabel)}</span></td>
          </tr>
        `
      )
      .join('');

    window.renderMobileStayInterviewCards?.(
      interviewRows.map(
        ({ employee, nextInterview, statusLabel, statusClass }) => ({
          employeeId: String(employee.dbId || employee.id || employee.employee_id || ''),
          name: employeeDisplayName(employee),
          department: String(employee.department || employee.dept || ''),
          nextInterview: nextInterview || '—',
          statusLabel,
          statusClass,
        })
      )
    );
  } catch (err) {
    console.error('[Dashboard] Stay interview dashboard load failed:', err);

    renderStayInterviewDashboardSummary(0, 0, 0);

    if (bodyTarget) {
      renderDashboardRetryTableRow(
        bodyTarget,
        6,
        'Could not load stay interview dashboard.',
        () => loadReviewDashboardFallback()
      );
    }

    window.renderMobileStayInterviewCards?.([]);
  }
}

export async function loadExecutiveInsightFallback(): Promise<void> {
  if (typeof window.loadExecutiveInsight === 'function') {
    window.loadExecutiveInsight();
    return;
  }

  const insightEl = getOrCreateDashboardSectionBody('Executive Insight', 'executiveInsight');
  if (!insightEl) return;

  insightEl.innerHTML =
    '<div class="insight-line insight-line--neutral">Executive insight will appear after workforce metrics load.</div>';
}

export async function loadRiskEmployeesFallback(): Promise<void> {
  const employees = getDashboardEmployees().filter((e) => isActiveDashboardEmployee(e));

  const riskEmployees = employees
    .filter((employee) => {
      if (typeof window.isEmployeeAtRisk === 'function') {
        return window.isEmployeeAtRisk(employee);
      }

      if (typeof window.getEmployeeRiskMeta === 'function') {
        return Boolean(window.getEmployeeRiskMeta(employee));
      }

      return false;
    })
    .sort(compareEmployeesByLastName);

  setText('kAtRiskEmployees', String(riskEmployees.length));
  setText(
    'kAtRiskEmployeesSub',
    riskEmployees.length === 0
      ? 'No employees flagged from low review scores, manual HR flags, or severe open discipline (final warning+)'
      : `${riskEmployees.length} employee${riskEmployees.length === 1 ? '' : 's'} flagged by review score, HR note, or severe open discipline`
  );

  const container = resolveDashboardListContainer('riskEmployees');

  if (!container) return;

  if (!riskEmployees.length) {
    container.innerHTML =
      '<div class="empty">No at-risk employees currently flagged.</div>';
    return;
  }

  ensureDashboardEmployeeLinkBindings();

  container.innerHTML = riskEmployees
    .slice(0, 8)
    .map(
      (employee) => `
        <div class="dashboard-list-item">
            ${renderDashboardEmployeeNameLink(employee, 'Open at-risk employee')}
            <span>${esc(employee.department || employee.dept || '')}</span>
        </div>
    `
    )
    .join('');
}

export async function loadImpactPlayersFallback(): Promise<void> {
  const employees = getDashboardEmployees().filter((e) => isActiveDashboardEmployee(e));

  const impactPlayers = employees
    .filter((employee) => {
      if (typeof window.isEmployeeImpactPlayer === 'function') {
        return window.isEmployeeImpactPlayer(employee);
      }

      if (typeof window.getEmployeeImpactMeta === 'function') {
        return Boolean(window.getEmployeeImpactMeta(employee));
      }

      return false;
    })
    .sort(compareEmployeesByLastName);

  setText('kImpactPlayers', String(impactPlayers.length));

  const container =
    resolveDashboardListContainer('impactPlayers', 'impactPlayersDashboardList') ||
    getOrCreateDashboardSectionBody('Impact Players', 'impactPlayers');

  if (!container) return;

  if (!impactPlayers.length) {
    container.innerHTML =
      '<div class="empty">No impact players currently flagged.</div>';
    return;
  }

  ensureDashboardEmployeeLinkBindings();

  container.innerHTML = impactPlayers
    .slice(0, 8)
    .map((employee) => {
      const impactMeta =
        typeof window.getEmployeeImpactMeta === 'function'
          ? window.getEmployeeImpactMeta(employee)
          : null;
      const scoreText =
        impactMeta?.reviewScore !== null && impactMeta?.reviewScore !== undefined
          ? `Review score: ${Number(impactMeta.reviewScore).toFixed(1)}`
          : '';

      return `
        <div class="dashboard-list-item">
            ${renderDashboardEmployeeNameLink(employee, 'Open impact player')}
            <span>${esc(employee.department || employee.dept || '')}</span>
            ${scoreText ? `<small>${esc(scoreText)}</small>` : ''}
        </div>
      `;
    })
    .join('');
}

async function runDashboardOverviewLoads(): Promise<DashboardSyncStatus> {
  let syncStatus: DashboardSyncStatus = 'success';

  ensureDashboardEmployeeLinkBindings();

  try {
    await loadEmployees();
  } catch (err) {
    console.error('[Dashboard] Employee load failed:', err);
    syncStatus = 'error';
    showToast('Could not load employee roster.', 'error');
  }

  await loadSummaryMetricsFallback();

  const sectionResults = await Promise.allSettled([
    loadReviewDashboardFallback(),
    loadExecutiveInsightFallback(),
    loadRiskEmployeesFallback(),
    loadImpactPlayersFallback(),
  ]);

  if (sectionResults.some((result) => result.status === 'rejected')) {
    syncStatus = syncStatus === 'error' ? 'error' : 'partial';
  }

  return syncStatus;
}

function finalizeDashboardLoad(syncStatus: DashboardSyncStatus, syncedAt: Date): void {
  refreshStayInterviewDashboardSummaryFromCache();

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
    window.flushRenderBasicDashboardKpis?.();
  }

  if (typeof window.hideDashboardLoadingSkeletons === 'function') {
    window.hideDashboardLoadingSkeletons();
  }

  updateDashboardSyncStatus(syncStatus, syncedAt);

  if (syncStatus === 'partial') {
    showToast('Some dashboard sections could not be refreshed.', 'error');
  }

  if (typeof window.initOrbisDisclosure === 'function') {
    window.initOrbisDisclosure();
  } else if (typeof window.initDashboardDisclosure === 'function') {
    window.initDashboardDisclosure();
  }

  if (typeof window.initKpiHoverUi === 'function') {
    window.initKpiHoverUi();
  }

  if (typeof window.loadHrInbox === 'function') {
    void window.loadHrInbox(true);
  }

  if (typeof window.loadManagerHome === 'function') {
    void window.loadManagerHome(true);
  }

  if (typeof window.updateWorkspaceAlerts === 'function') {
    window.updateWorkspaceAlerts();
  }
}

/** Dashboard KPIs + overview panels only (no candidate pipeline). Used on initial boot. */
export async function loadDashboardOverview(): Promise<void> {
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;

  const syncedAt = new Date();

  if (typeof window.showDashboardLoadingSkeletons === 'function') {
    window.showDashboardLoadingSkeletons();
  }

  try {
    const syncStatus = await runDashboardOverviewLoads();
    finalizeDashboardLoad(syncStatus, syncedAt);
  } catch (err) {
    console.error(err);
    updateDashboardSyncStatus('error', syncedAt);
    showToast('Could not refresh dashboard data.', 'error');
  } finally {
    if (typeof window.renderBasicDashboardKpis === 'function') {
      window.renderBasicDashboardKpis();
      window.flushRenderBasicDashboardKpis?.();
    }
    refreshStayInterviewDashboardSummaryFromCache();
    isLoadingDashboard = false;
  }

  if (typeof window.hideDashboardLoadingSkeletons === 'function') {
    window.hideDashboardLoadingSkeletons();
  }
}

/** Full workspace refresh: dashboard overview + candidate pipeline. */
export async function loadAllDashboardData(): Promise<void> {
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;

  const syncedAt = new Date();

  if (typeof window.showDashboardLoadingSkeletons === 'function') {
    window.showDashboardLoadingSkeletons();
  }

  try {
    let syncStatus = await runDashboardOverviewLoads();

    try {
      await loadCandidates();
    } catch (err) {
      console.error('[Dashboard] Candidate load failed:', err);
      syncStatus = syncStatus === 'error' ? 'error' : 'partial';
    }

    finalizeDashboardLoad(syncStatus, syncedAt);
  } catch (err) {
    console.error(err);
    updateDashboardSyncStatus('error', syncedAt);
    showToast('Could not refresh dashboard data.', 'error');
  } finally {
    if (typeof window.renderBasicDashboardKpis === 'function') {
      window.renderBasicDashboardKpis();
      window.flushRenderBasicDashboardKpis?.();
    }
    refreshStayInterviewDashboardSummaryFromCache();
    isLoadingDashboard = false;
  }

  if (typeof window.hideDashboardLoadingSkeletons === 'function') {
    window.hideDashboardLoadingSkeletons();
  }
}

export async function refreshOrbisWorkspace(): Promise<void> {
  const view = String(window.currentMainView || 'dashboardView');

  if (view === 'candidatesView') {
    if (typeof window.loadAllDashboardData === 'function') {
      await window.loadAllDashboardData();
    }
    return;
  }

  if (view === 'operationsView') {
    if (typeof window.loadEmployees === 'function') {
      await loadEmployees();
    }
    if (typeof window.ensureOperationsIssuesLoaded === 'function') {
      window.ensureOperationsIssuesLoaded(true);
    } else if (typeof window.loadOperationsIssues === 'function') {
      await window.loadOperationsIssues();
    }
    if (typeof window.updateWorkspaceAlerts === 'function') {
      window.updateWorkspaceAlerts();
    }
    return;
  }

  if (view === 'documentsView') {
    if (typeof window.loadDocuments === 'function') {
      await window.loadDocuments();
    }
    return;
  }

  if (view === 'reportsView') {
    if (typeof window.loadReportsSection === 'function') {
      await window.loadReportsSection(true);
    }
    return;
  }

  if (view === 'settingsView') {
    if (typeof window.loadSettingsAdmin === 'function') {
      await window.loadSettingsAdmin(true);
    }
    return;
  }

  if (view === 'employeesView') {
    if (typeof window.loadEmployees === 'function') {
      await loadEmployees();
    }
    if (typeof window.renderEmployeeRoster === 'function') {
      window.renderEmployeeRoster();
    }
    if (typeof window.buildKpiHoverDetails === 'function') {
      window.buildKpiHoverDetails();
    }
    if (typeof window.updateWorkspaceAlerts === 'function') {
      window.updateWorkspaceAlerts();
    }
    return;
  }

  if (typeof window.loadDashboardOverview === 'function') {
    await window.loadDashboardOverview();
    return;
  }

  if (typeof window.loadAllDashboardData === 'function') {
    await window.loadAllDashboardData();
  }
}

window.loadDashboardOverview = loadDashboardOverview;
window.loadAllDashboardData = loadAllDashboardData;
window.refreshOrbisWorkspace = refreshOrbisWorkspace;
window.loadReviewDashboardFallback = loadReviewDashboardFallback;
window.loadReviewDashboard = loadReviewDashboardFallback;
window.loadExecutiveInsightFallback = loadExecutiveInsightFallback;
window.loadRiskEmployeesFallback = loadRiskEmployeesFallback;
window.loadImpactPlayersFallback = loadImpactPlayersFallback;
window.cleanReviewDashboardLooseCount = cleanReviewDashboardLooseCount;
window.getOrCreateDashboardSectionBody = getOrCreateDashboardSectionBody;
