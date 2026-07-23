import type { AttentionItem, AttentionSummary } from './types';

export type AttentionWorkspaceAlert = {
  id: string;
  label: string;
  detail: string;
  count: number;
  viewId?: string;
};

export function summarizeAttentionRollupAlert(summary: AttentionSummary): AttentionWorkspaceAlert | null {
  if (summary.highPriority <= 0 && summary.overdue <= 0) {
    return null;
  }

  const count = Math.max(summary.highPriority, summary.overdue);
  const parts: string[] = [];
  if (summary.overdue > 0) {
    parts.push(`${summary.overdue} overdue`);
  }
  if (summary.dueToday > 0) {
    parts.push(`${summary.dueToday} due today`);
  }
  if (summary.dueSoon > 0) {
    parts.push(`${summary.dueSoon} due within 7 days`);
  }

  return {
    id: 'attention-priority-queue',
    label: 'Needs your attention',
    detail: parts.length ? parts.join(' · ') : `${count} high-priority item${count === 1 ? '' : 's'}`,
    count: summary.totalOpen,
    viewId: 'myTasksView',
  };
}

export function summarizeAttentionCategoryAlerts(
  items: AttentionItem[]
): AttentionWorkspaceAlert[] {
  const alerts: AttentionWorkspaceAlert[] = [];

  const performanceReviews = items.filter((item) => item.category === 'performance_review').length;
  if (performanceReviews > 0) {
    alerts.push({
      id: 'performance-reviews-due',
      label: 'Performance reviews due',
      detail: `${performanceReviews} 90-day or annual review${performanceReviews === 1 ? '' : 's'} need attention`,
      count: performanceReviews,
      viewId: 'myTasksView',
    });
  }

  const discipline = items.filter((item) => item.category === 'discipline').length;
  if (discipline > 0) {
    alerts.push({
      id: 'open-discipline',
      label: 'Open discipline cases',
      detail: `${discipline} case${discipline === 1 ? '' : 's'} need follow-up`,
      count: discipline,
      viewId: 'dashboardView',
    });
  }

  const meetings = items.filter((item) => item.category === 'meeting').length;
  if (meetings > 0) {
    alerts.push({
      id: 'meetings-attention',
      label: 'Meetings need action',
      detail: `${meetings} meeting${meetings === 1 ? '' : 's'} today or overdue follow-up`,
      count: meetings,
      viewId: 'dashboardView',
    });
  }

  const candidates = items.filter((item) => item.category === 'candidate').length;
  if (candidates > 0) {
    alerts.push({
      id: 'candidate-interviews-attention',
      label: 'Candidate interviews',
      detail: `${candidates} interview${candidates === 1 ? '' : 's'} need follow-up`,
      count: candidates,
      viewId: 'candidatesView',
    });
  }

  const records = items.filter((item) => item.category === 'employee_record').length;
  if (records > 0) {
    alerts.push({
      id: 'employee-records-incomplete',
      label: 'Incomplete employee records',
      detail: `${records} employee record${records === 1 ? '' : 's'} missing required fields`,
      count: records,
      viewId: 'employeesView',
    });
  }

  return alerts;
}

export function summarizeAttentionForWorkspaceAlerts(
  summary: AttentionSummary,
  items: AttentionItem[]
): AttentionWorkspaceAlert[] {
  const rollup = summarizeAttentionRollupAlert(summary);
  const categories = summarizeAttentionCategoryAlerts(items);
  return rollup ? [rollup, ...categories] : categories;
}

export function syncAttentionSummaryKpis(summary: AttentionSummary, items: AttentionItem[]): void {
  const performanceReviews = items.filter((item) => item.category === 'performance_review').length;
  const discipline = items.filter((item) => item.category === 'discipline').length;

  const perfEl = document.getElementById('kPerformanceReviewsDue');
  if (perfEl) {
    perfEl.textContent = String(performanceReviews);
  }

  const disciplineEl = document.getElementById('kOpenDiscipline');
  if (disciplineEl) {
    disciplineEl.textContent = String(discipline);
  }

  const perfSub = document.getElementById('kPerformanceReviewsDueSub');
  if (perfSub) {
    if (summary.overdue > 0) {
      perfSub.textContent = `${summary.overdue} overdue · ${summary.dueSoon} due within 7 days`;
    } else if (summary.dueSoon > 0) {
      perfSub.textContent = `${summary.dueSoon} due within 7 days`;
    } else if (performanceReviews === 0) {
      perfSub.textContent = 'No 90-day or annual reviews due right now';
    }
  }
}
