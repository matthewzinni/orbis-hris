import { supabaseClient } from '../services/supabaseClient';
import {
  type Investigation,
  formatInvestigationLabel,
  normalizeInvestigationStatus,
} from '../types/investigationsTypes';

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

function isOpenInvestigation(investigation: Investigation): boolean {
  return normalizeInvestigationStatus(investigation.status) !== 'closed';
}

function isHighSeverity(investigation: Investigation): boolean {
  const severity = String(investigation.severity || '').toLowerCase();
  return severity === 'high' || severity === 'critical';
}

function parseDate(value: unknown): Date | null {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function isOverdue(investigation: Investigation): boolean {
  if (!isOpenInvestigation(investigation)) return false;
  const target = parseDate(investigation.target_completion_date);
  if (!target) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return target < today;
}

function closedThisMonth(investigation: Investigation): boolean {
  if (normalizeInvestigationStatus(investigation.status) !== 'closed') return false;
  const closed = parseDate(investigation.closed_at);
  if (!closed) return false;
  const now = new Date();
  return (
    closed.getFullYear() === now.getFullYear() && closed.getMonth() === now.getMonth()
  );
}

export function loadInvestigationsDashboardMetrics(investigations: Investigation[]): void {
  const openCases = investigations.filter(isOpenInvestigation);
  const highSeverity = openCases.filter(isHighSeverity);
  const overdue = openCases.filter(isOverdue);
  const closedMonth = investigations.filter(closedThisMonth);

  const openDays = openCases
    .map((row) => {
      const opened = parseDate(row.opened_at || row.created_at);
      if (!opened) return null;
      return daysBetween(opened, new Date());
    })
    .filter((value): value is number => value !== null);

  const avgDaysOpen = openDays.length
    ? Math.round(openDays.reduce((sum, days) => sum + days, 0) / openDays.length)
    : '—';

  setMetric('kInvOpenCases', openCases.length);
  setMetric('kInvHighSeverity', highSeverity.length);
  setMetric('kInvOverdue', overdue.length);
  setMetric('kInvClosedMonth', closedMonth.length);
  setMetric('kInvAvgDaysOpen', avgDaysOpen);

  renderStatusBreakdown(openCases);
  renderCategoryBreakdown(openCases);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderStatusBreakdown(investigations: Investigation[]): void {
  const container = safeGet('investigationsStatusBreakdown');
  if (!container) return;

  const counts = new Map<string, number>();
  investigations.forEach((row) => {
    const status = normalizeInvestigationStatus(row.status);
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (!rows.length) {
    container.innerHTML = '<div class="empty">No open investigations.</div>';
    return;
  }

  container.innerHTML = rows
    .map(
      ([status, count]) => `
        <div class="history-item">
          <div class="history-top">
            <strong>${escapeHtml(formatInvestigationLabel(status))}</strong>
            <span>${count} open</span>
          </div>
        </div>
      `
    )
    .join('');
}

function renderCategoryBreakdown(investigations: Investigation[]): void {
  const container = safeGet('investigationsCategoryBreakdown');
  if (!container) return;

  const counts = new Map<string, number>();
  investigations.forEach((row) => {
    const category = String(row.category || 'other').trim() || 'other';
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!rows.length) {
    container.innerHTML = '<div class="empty">No open investigations by category.</div>';
    return;
  }

  container.innerHTML = rows
    .map(
      ([category, count]) => `
        <div class="history-item">
          <div class="history-top">
            <strong>${escapeHtml(formatInvestigationLabel(category))}</strong>
            <span>${count} case${count === 1 ? '' : 's'}</span>
          </div>
        </div>
      `
    )
    .join('');
}

export async function fetchAllInvestigations(): Promise<Investigation[]> {
  const { data, error } = await supabaseClient
    .from('investigations')
    .select('*, investigation_subjects(*)')
    .order('opened_at', { ascending: false });

  if (error) {
    console.error('[Investigations] Could not load cases:', error);
    throw error;
  }

  return (data || []) as Investigation[];
}
