import { supabaseClient } from '../services/supabaseClient';
import { canViewOperationsIssue } from '../services/operationsAccess';
import { type OperationsIssue, formatOperationsLabel } from '../types/operationsTypes';

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function setMetric(id: string, value: string | number): void {
  const el = safeGet(id);
  if (el) el.textContent = String(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isOpenStatus(status: unknown): boolean {
  const value = String(status || '').toLowerCase();
  return value !== 'resolved' && value !== 'closed';
}

function isCritical(issue: OperationsIssue): boolean {
  const impact = String(issue.impact_level || '').toLowerCase();
  const priority = String(issue.priority || '').toLowerCase();
  return impact === 'critical' || priority === 'urgent';
}

function daysSince(value: unknown): number {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export async function loadOperationsDashboardMetrics(
  issues: OperationsIssue[]
): Promise<void> {
  const visible = issues.filter((issue) => canViewOperationsIssue(issue));
  const openIssues = visible.filter((issue) => isOpenStatus(issue.status));
  const critical = openIssues.filter(isCritical);
  const aging = openIssues.filter((issue) => daysSince(issue.created_at) >= 7);
  const recurring = openIssues.filter((issue) => Boolean(issue.is_recurring));

  const resolved = visible.filter((issue) => {
    const status = String(issue.status || '').toLowerCase();
    return (status === 'resolved' || status === 'closed') && issue.resolved_at && issue.created_at;
  });

  let avgResolutionHours = '—';
  if (resolved.length) {
    const totalMs = resolved.reduce((sum, issue) => {
      const start = new Date(String(issue.created_at)).getTime();
      const end = new Date(String(issue.resolved_at)).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || end < start) return sum;
      return sum + (end - start);
    }, 0);
    const hours = Math.round(totalMs / resolved.length / (1000 * 60 * 60));
    avgResolutionHours = `${hours}h`;
  }

  const systemCounts = new Map<string, number>();
  visible.forEach((issue) => {
    const key = String(issue.system_affected || '').trim() || 'Unspecified';
    systemCounts.set(key, (systemCounts.get(key) || 0) + 1);
  });

  const topSystem = [...systemCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  setMetric('kOpsOpenIssues', openIssues.length);
  setMetric('kOpsCritical', critical.length);
  setMetric('kOpsAging', aging.length);
  setMetric('kOpsRecurring', recurring.length);
  setMetric('kOpsAvgResolution', avgResolutionHours);
  setMetric('kOpsTopSystem', topSystem ? `${topSystem[0]} (${topSystem[1]})` : '—');

  renderDepartmentBreakdown(visible);
  renderSoftwareComplaints(visible);
}

function renderDepartmentBreakdown(issues: OperationsIssue[]): void {
  const container = safeGet('operationsDeptBreakdown');
  if (!container) return;

  const counts = new Map<string, number>();
  issues.filter((issue) => isOpenStatus(issue.status)).forEach((issue) => {
    const dept = String(issue.department || 'Unassigned').trim() || 'Unassigned';
    counts.set(dept, (counts.get(dept) || 0) + 1);
  });

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (!rows.length) {
    container.innerHTML = '<div class="empty">No open issues by department.</div>';
    return;
  }

  container.innerHTML = rows
    .map(
      ([department, count]) => `
        <div class="history-item">
          <div class="history-top">
            <strong>${escapeHtml(department)}</strong>
            <span>${count} open</span>
          </div>
        </div>
      `
    )
    .join('');
}

function renderSoftwareComplaints(issues: OperationsIssue[]): void {
  const container = safeGet('operationsSoftwareBreakdown');
  if (!container) return;

  const counts = new Map<string, number>();
  issues
    .filter((issue) => String(issue.category || '').toLowerCase() === 'software')
    .forEach((issue) => {
      const system = String(issue.system_affected || 'Unspecified').trim() || 'Unspecified';
      counts.set(system, (counts.get(system) || 0) + 1);
    });

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!rows.length) {
    container.innerHTML = '<div class="empty">No software issues logged yet.</div>';
    return;
  }

  container.innerHTML = rows
    .map(
      ([system, count]) => `
        <div class="history-item">
          <div class="history-top">
            <strong>${escapeHtml(system)}</strong>
            <span>${count} issue${count === 1 ? '' : 's'}</span>
          </div>
          <div class="history-body muted">${escapeHtml(formatOperationsLabel('software'))}</div>
        </div>
      `
    )
    .join('');
}

export async function fetchAllOperationsIssues(): Promise<OperationsIssue[]> {
  const { data, error } = await supabaseClient
    .from('operations_issues')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Operations] Could not load issues:', error);
    throw error;
  }

  return (data || []) as OperationsIssue[];
}
