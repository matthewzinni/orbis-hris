// ============================================
// Dashboard data boot + legacy fallbacks
// ============================================

import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';
import { loadEmployees } from './employees';
import { loadCandidates } from './candidates';
import {
  daysUntilDate,
  employeeDisplayName,
  isActiveDashboardEmployee,
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
  if (!isActiveDashboardEmployee(employee)) return false;

  const payType = String(employee.payType || employee.pay_type || '').toLowerCase();

  return !payType.includes('contract');
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
  if (typeof window.loadSummaryMetrics === 'function') {
    await window.loadSummaryMetrics();
    return;
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
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
  }
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
        <div class="insight-line">Stay interview, risk, and impact lists are being calculated from current employee records.</div>
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

  const container = resolveDashboardListContainer('riskEmployees');

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

  const container =
    resolveDashboardListContainer('impactPlayers', 'impactPlayersDashboardList') ||
    getOrCreateDashboardSectionBody('Impact Players', 'impactPlayers');

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

export type ActivitySource = 'note' | 'discipline' | 'meeting' | 'review';

type RecentActivityItem = {
  id: string;
  source: ActivitySource;
  category: string;
  title: string;
  date: string;
  sortTimestamp: string;
  employeeId: string;
  body: string;
};

const HR_ACTIVITY_CLEARED_KEY = 'orbis_hr_activity_cleared_at';

let recentActivityUiBound = false;

function getHrActivityClearedBefore(): string | null {
  try {
    return localStorage.getItem(HR_ACTIVITY_CLEARED_KEY);
  } catch {
    return null;
  }
}

function setHrActivityClearedBefore(timestamp = new Date().toISOString()): void {
  try {
    localStorage.setItem(HR_ACTIVITY_CLEARED_KEY, timestamp);
  } catch {
    // ignore storage failures
  }
}

function getActivitySortTimestamp(row: Record<string, unknown>): string {
  return String(
    row.created_at || row.note_date || row.incident_date || row.meeting_date || row.review_date || ''
  );
}

function isActivityVisibleAfterClear(item: RecentActivityItem): boolean {
  const clearedBefore = getHrActivityClearedBefore();

  if (!clearedBefore) return true;

  const itemTime = new Date(item.sortTimestamp).getTime();
  const clearTime = new Date(clearedBefore).getTime();

  if (Number.isNaN(itemTime) || Number.isNaN(clearTime)) {
    return true;
  }

  return itemTime > clearTime;
}

function mapActivityRow(
  row: Record<string, unknown>,
  source: ActivitySource,
  category: string,
  title: string,
  date: string,
  body: string
): RecentActivityItem | null {
  const id = String(row.id || '').trim();

  if (!id) return null;

  return {
    id,
    source,
    category,
    title,
    date,
    sortTimestamp: getActivitySortTimestamp(row),
    employeeId: String(row.employee_id || ''),
    body,
  };
}

function ensureRecentActivityUiBindings(): void {
  if (recentActivityUiBound) return;

  const list = resolveDashboardListContainer('recentActivity', 'recentHrActivityList');

  if (!list) return;

  recentActivityUiBound = true;

  list.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const deleteButton = target.closest<HTMLButtonElement>('[data-delete-activity-id]');

    if (!deleteButton) return;

    event.preventDefault();

    const recordId = deleteButton.dataset.deleteActivityId || '';
    const source = deleteButton.dataset.deleteActivitySource as ActivitySource | undefined;
    const employeeId = deleteButton.dataset.deleteActivityEmployeeId || '';

    if (!recordId || !source) return;

    void deleteRecentHrActivityEntry(source, recordId, employeeId);
  });

  safeGet('clearRecentActivityBtn')?.addEventListener('click', () => {
    void clearAllRecentHrActivity();
  });
}

async function deleteRecentHrActivityRecord(
  source: ActivitySource,
  recordId: string
): Promise<boolean> {
  const tableBySource: Record<ActivitySource, string> = {
    note: 'employee_notes',
    discipline: 'discipline_reports',
    meeting: 'employee_meetings',
    review: 'employee_reviews',
  };

  const { error } = await supabaseClient.from(tableBySource[source]).delete().eq('id', recordId);

  if (error) {
    showToast(error.message || 'Could not delete record.', 'error');
    return false;
  }

  return true;
}

export async function deleteRecentHrActivityEntry(
  source: ActivitySource,
  recordId: string,
  employeeId: string
): Promise<void> {
  void employeeId;

  const labelBySource: Record<ActivitySource, string> = {
    note: 'note',
    discipline: 'discipline report',
    meeting: 'meeting record',
    review: 'review',
  };

  if (
    !(await showOrbisConfirm(`Delete this ${labelBySource[source]} permanently?`, {
      title: 'Delete activity',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const deleted = await deleteRecentHrActivityRecord(source, recordId);

  if (!deleted) return;

  showToast(`${labelBySource[source]} deleted.`);

  if (typeof window.loadSummaryMetrics === 'function') {
    await window.loadSummaryMetrics();
  }

  await loadRecentHrActivity();
}

export async function clearAllRecentHrActivity(): Promise<void> {
  if (
    !(await showOrbisConfirm(
      'Clear all items from Recent HR Activity? Employee records stay saved; only this dashboard feed is cleared.',
      {
        title: 'Clear recent activity',
        confirmLabel: 'Clear all',
        danger: true,
      }
    ))
  ) {
    return;
  }

  setHrActivityClearedBefore();
  showToast('Recent HR activity cleared.');
  await loadRecentHrActivity();
}

function resolveEmployeeNameById(employeeId: string): string {
  const employees = getDashboardEmployees();
  const match = employees.find((employee) =>
    getEmployeeRecordKeys(employee).includes(String(employeeId))
  );

  return match ? employeeDisplayName(match) : employeeId;
}

export async function loadRecentHrActivity(): Promise<void> {
  ensureRecentActivityUiBindings();

  const target = resolveDashboardListContainer('recentActivity', 'recentHrActivityList');

  if (!target) return;

  try {
    target.innerHTML = '<div class="empty">Loading recent activity...</div>';

    const [notesRes, disciplineRes, meetingsRes, reviewsRes] = await Promise.all([
      supabaseClient
        .from('employee_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseClient
        .from('discipline_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseClient
        .from('employee_meetings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseClient
        .from('employee_reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const fetchErrors = [notesRes, disciplineRes, meetingsRes, reviewsRes]
      .map((result) => result.error)
      .filter(Boolean);

    if (fetchErrors.length) {
      throw fetchErrors[0];
    }

    const notes = ((notesRes.data || []) as Record<string, unknown>[])
      .map((row) =>
        mapActivityRow(
          row,
          'note',
          'Note',
          String(row.note_type || 'General Note'),
          String(row.note_date || row.created_at || ''),
          String(row.note_text || '')
        )
      )
      .filter((row): row is RecentActivityItem => Boolean(row));

    const discipline = ((disciplineRes.data || []) as Record<string, unknown>[])
      .map((row) =>
        mapActivityRow(
          row,
          'discipline',
          'Discipline',
          String(row.issue_type || 'Discipline Report'),
          String(row.incident_date || row.created_at || ''),
          String(row.description || '')
        )
      )
      .filter((row): row is RecentActivityItem => Boolean(row));

    const meetings = ((meetingsRes.data || []) as Record<string, unknown>[])
      .map((row) =>
        mapActivityRow(
          row,
          'meeting',
          'Meeting',
          String(row.meeting_type || row.subject || 'Meeting'),
          String(row.meeting_date || row.created_at || ''),
          String(row.subject || row.notes || '')
        )
      )
      .filter((row): row is RecentActivityItem => Boolean(row));

    const reviews = ((reviewsRes.data || []) as Record<string, unknown>[])
      .map((row) =>
        mapActivityRow(
          row,
          'review',
          'Review',
          String(row.review_type || row.overall_result || 'Performance Review'),
          String(row.review_date || row.created_at || ''),
          String(row.manager_comments || row.strengths || row.improvements || '')
        )
      )
      .filter((row): row is RecentActivityItem => Boolean(row));

    const combined = [...notes, ...discipline, ...meetings, ...reviews]
      .filter(isActivityVisibleAfterClear)
      .sort((a, b) => String(b.sortTimestamp).localeCompare(String(a.sortTimestamp)))
      .slice(0, 8);

    if (!combined.length) {
      target.innerHTML = '<div class="empty">No recent HR activity available.</div>';
      return;
    }

    target.innerHTML = combined
      .map(
        (item) => `
          <div class="history-item" data-activity-id="${esc(item.id)}" data-activity-source="${esc(item.source)}">
            <div class="history-top">
              <div>
                <div class="history-title">${esc(item.title)}</div>
                <div class="history-date">${esc(item.category)} • ${esc(resolveEmployeeNameById(item.employeeId))} • ${esc(item.date)}</div>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="badge badge-soft">${esc(item.category)}</span>
                <button
                  class="button danger sm"
                  type="button"
                  data-delete-activity-id="${esc(item.id)}"
                  data-delete-activity-source="${esc(item.source)}"
                  data-delete-activity-employee-id="${esc(item.employeeId)}"
                  title="Delete this record"
                >
                  Delete
                </button>
              </div>
            </div>
            <div class="history-body">${esc(item.body)}</div>
          </div>
        `
      )
      .join('');
  } catch (err) {
    console.error('[Dashboard] Recent activity load failed:', err);
    renderDashboardRetryState(target, 'Could not load recent activity.', () => loadRecentHrActivity());
  }
}

async function runDashboardOverviewLoads(): Promise<DashboardSyncStatus> {
  let syncStatus: DashboardSyncStatus = 'success';

  try {
    await loadEmployees();

    if (typeof window.renderRoster === 'function') {
      window.renderRoster();
    }
  } catch (err) {
    console.error('[Dashboard] Employee load failed:', err);
    syncStatus = 'error';
    showToast('Could not load employee roster.', 'error');
  }

  const sectionResults = await Promise.allSettled([
    loadSummaryMetricsFallback(),
    typeof window.loadRecentActivityFallback === 'function'
      ? window.loadRecentActivityFallback()
      : Promise.resolve(),
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
  }

  updateDashboardSyncStatus(syncStatus, syncedAt);

  if (syncStatus === 'partial') {
    showToast('Some dashboard sections could not be refreshed.', 'error');
  }

  if (typeof window.initKpiHoverUi === 'function') {
    window.initKpiHoverUi();
  }

  if (typeof window.buildKpiHoverDetails === 'function') {
    window.buildKpiHoverDetails();
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

declare global {
  interface Window {
    loadDashboardOverview?: () => Promise<void>;
    loadAllDashboardData?: () => Promise<void>;
    refreshOrbisWorkspace?: () => Promise<void>;
    loadReviewDashboardFallback?: () => Promise<void>;
    loadReviewDashboard?: () => Promise<void>;
    loadExecutiveInsightFallback?: () => Promise<void>;
    loadRiskEmployeesFallback?: () => Promise<void>;
    loadImpactPlayersFallback?: () => Promise<void>;
    loadRecentActivityFallback?: () => Promise<unknown>;
    loadRecentHrActivity?: () => Promise<void>;
    clearAllRecentHrActivity?: () => Promise<void>;
    deleteRecentHrActivityEntry?: (
      source: ActivitySource,
      recordId: string,
      employeeId: string
    ) => Promise<void>;
    getOrCreateDashboardSectionBody?: (
      title: string,
      id: string
    ) => HTMLElement | null;
    cleanReviewDashboardLooseCount?: () => void;
    currentAtRiskRosterMap?: Record<string, unknown>;
    currentImpactPlayerRosterMap?: Record<string, unknown>;
    initKpiHoverUi?: () => void;
    buildKpiHoverDetails?: () => void;
    buildRiskPreview?: () => void;
    updateWorkspaceAlerts?: () => void;
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
window.loadRecentHrActivity = loadRecentHrActivity;
window.loadRecentActivityFallback = loadRecentHrActivity;
window.clearAllRecentHrActivity = clearAllRecentHrActivity;
window.deleteRecentHrActivityEntry = deleteRecentHrActivityEntry;
window.cleanReviewDashboardLooseCount = cleanReviewDashboardLooseCount;
window.getOrCreateDashboardSectionBody = getOrCreateDashboardSectionBody;
