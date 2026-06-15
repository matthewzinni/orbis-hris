import { canEmailSupervisorsPerformanceReviews } from '../services/access';
import {
  buildSupervisorPerformanceReviewDueGroups,
  type SupervisorPerformanceReviewDueGroup,
} from '../services/performanceReviewDue';
import { openSupervisorPerformanceReviewEmail } from '../services/performanceReviewSupervisorEmail';

let notifyBound = false;
let cachedGroups: SupervisorPerformanceReviewDueGroup[] = [];

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function severityBadge(severity: 'overdue' | 'due_soon'): string {
  return severity === 'overdue' ? 'Overdue' : 'Due soon';
}

function renderSupervisorGroup(group: SupervisorPerformanceReviewDueGroup): string {
  const overdueCount = group.items.filter((item) => item.severity === 'overdue').length;
  const emailMeta = group.supervisorEmail
    ? `<span class="muted">${esc(group.supervisorEmail)}</span>`
    : `<span class="muted">No supervisor email on file</span>`;

  const rows = group.items
    .map(
      (item) => `
        <li class="performance-review-supervisor-item">
          <span class="badge badge-soft">${esc(severityBadge(item.severity))}</span>
          <strong>${esc(item.employeeName)}</strong>
          <span class="muted">${esc(item.reviewTypeLabel)} · ${esc(item.department)} · Due ${esc(item.dueDate)}</span>
        </li>
      `
    )
    .join('');

  const emailButton = group.supervisorEmail
    ? `<button type="button" class="button primary sm" data-supervisor-review-email="${esc(group.supervisorName)}">Email supervisor</button>`
    : `<button type="button" class="button soft sm" disabled title="Add a work email or user access record for this supervisor">Email supervisor</button>`;

  return `
    <article class="performance-review-supervisor-group">
      <div class="performance-review-supervisor-group-header">
        <div>
          <strong>${esc(group.supervisorName)}</strong>
          <div class="performance-review-supervisor-group-meta">
            ${emailMeta}
            <span class="muted">${group.items.length} review${group.items.length === 1 ? '' : 's'}${overdueCount ? ` · ${overdueCount} overdue` : ''}</span>
          </div>
        </div>
        ${emailButton}
      </div>
      <ul class="performance-review-supervisor-list">${rows}</ul>
    </article>
  `;
}

function bindSupervisorReviewEmailActions(): void {
  if (notifyBound) return;
  notifyBound = true;

  const root = safeGet('performanceReviewSupervisorNotifyCard');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-supervisor-review-email]'
    );
    if (!button) return;

    const supervisorName = button.dataset.supervisorReviewEmail || '';
    const group = cachedGroups.find((row) => row.supervisorName === supervisorName);
    if (!group?.supervisorEmail) {
      showToast('No email on file for this supervisor.', 'error');
      return;
    }

    try {
      openSupervisorPerformanceReviewEmail(group);
      showToast(`Opening email to ${group.supervisorName}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not open email.';
      showToast(message, 'error');
    }
  });
}

export async function loadPerformanceReviewSupervisorNotify(): Promise<void> {
  const card = safeGet('performanceReviewSupervisorNotifyCard');
  const list = safeGet('performanceReviewSupervisorNotifyList');
  if (!card || !list) return;

  bindSupervisorReviewEmailActions();

  if (!canEmailSupervisorsPerformanceReviews()) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  list.innerHTML = '<div class="muted">Loading supervisor review lists…</div>';

  try {
    cachedGroups = await buildSupervisorPerformanceReviewDueGroups();

    if (!cachedGroups.length) {
      list.innerHTML =
        '<div class="employee-portal-task-empty">No performance reviews are overdue or due soon right now.</div>';
      return;
    }

    list.innerHTML = cachedGroups.map(renderSupervisorGroup).join('');
  } catch (err) {
    console.warn('[PerformanceReviewSupervisorNotify]', err);
    list.innerHTML = '<div class="muted">Could not load supervisor review lists.</div>';
  }
}

declare global {
  interface Window {
    loadPerformanceReviewSupervisorNotify?: () => Promise<void>;
  }
}

window.loadPerformanceReviewSupervisorNotify = loadPerformanceReviewSupervisorNotify;
