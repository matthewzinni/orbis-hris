import { isAdminUser, isSupervisorUser } from '../services/access';
import { defaultAttentionSnoozeUntil } from '../services/attention/attentionItemStates';
import { summarizeAttentionItems } from '../services/attention/attentionSummary';
import {
  buildAttentionWorkspace,
  filterAttentionItems,
  isAttentionItemHighPriority,
} from '../services/attention/buildAttentionWorkspace';
import {
  attentionCategoryLabel,
  attentionSeverityLabel,
  attentionStatusLabel,
} from '../services/attention/attentionWorkspaceLabels';
import {
  buildPortalAttentionInboxItems,
  openPortalAttentionRoute,
} from '../services/attention/portalAttention';
import type { AttentionFilter, AttentionItem, AttentionSummary } from '../services/attention/types';
import { kindLabel, type HrInboxItem } from '../services/hrInbox';

type QuickFilter = 'all' | 'overdue' | 'high_priority' | 'in_progress';

let workspaceUiBound = false;
let workspaceLoading = false;
let quickFilter: QuickFilter = 'all';
let workspaceFilter: AttentionFilter = {
  category: 'all',
  severity: 'all',
  status: 'all',
  search: '',
  sort: 'urgency',
};

let cachedWorkspaceItems: AttentionItem[] = [];
let cachedAdditionalInboxItems: HrInboxItem[] = [];

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

function applyQuickFilter(items: AttentionItem[]): AttentionItem[] {
  if (quickFilter === 'overdue') {
    return items.filter((item) => item.status === 'overdue');
  }
  if (quickFilter === 'high_priority') {
    return items.filter((item) => isAttentionItemHighPriority(item));
  }
  if (quickFilter === 'in_progress') {
    return items.filter((item) => item.status === 'in_progress');
  }
  return items;
}

function getFilteredWorkspaceItems(): AttentionItem[] {
  const filtered = filterAttentionItems(cachedWorkspaceItems, workspaceFilter);
  return applyQuickFilter(filtered);
}

function renderSummary(summary: AttentionSummary): void {
  const el = safeGet('attentionWorkspaceSummary');
  if (!el) return;

  if (!summary.totalOpen) {
    el.innerHTML = '<span class="attention-workspace-chip">You are caught up on tracked attention items.</span>';
    return;
  }

  el.innerHTML = [
    `<span class="attention-workspace-chip"><strong>${summary.totalOpen}</strong> open</span>`,
    summary.overdue
      ? `<span class="attention-workspace-chip"><strong>${summary.overdue}</strong> overdue</span>`
      : '',
    summary.dueToday
      ? `<span class="attention-workspace-chip"><strong>${summary.dueToday}</strong> due today</span>`
      : '',
    summary.dueSoon
      ? `<span class="attention-workspace-chip"><strong>${summary.dueSoon}</strong> due soon</span>`
      : '',
    summary.highPriority
      ? `<span class="attention-workspace-chip"><strong>${summary.highPriority}</strong> high priority</span>`
      : '',
  ]
    .filter(Boolean)
    .join('');
}

function renderAttentionCard(item: AttentionItem): string {
  const inProgress = item.status === 'in_progress';
  const snoozeUntil = defaultAttentionSnoozeUntil(7);

  return `
    <article
      class="attention-workspace-card severity-${esc(item.severity)} status-${esc(item.status)}"
      data-attention-dedupe-key="${esc(item.dedupeKey)}"
    >
      <div class="attention-workspace-card-top">
        <span class="badge badge-soft">${esc(attentionCategoryLabel(item.category))}</span>
        <span class="badge badge-soft">${esc(attentionSeverityLabel(item.severity))}</span>
        <span class="badge badge-soft">${esc(attentionStatusLabel(item.status))}</span>
      </div>
      <h4 class="attention-workspace-card-title">${esc(item.title)}</h4>
      <p class="attention-workspace-card-detail">${esc(item.explanation)}</p>
      <p class="attention-workspace-card-action">${esc(item.recommendedAction)}</p>
      <div class="attention-workspace-card-meta">
        ${item.employeeName ? `<span>${esc(item.employeeName)}</span>` : ''}
        ${item.dueDate ? `<span>Due ${esc(item.dueDate)}</span>` : ''}
      </div>
      <div class="attention-workspace-card-actions">
        <button type="button" class="button primary sm" data-attention-open="${esc(item.dedupeKey)}">Open</button>
        ${
          inProgress
            ? `<button type="button" class="button soft sm" data-attention-restore="${esc(item.dedupeKey)}">Restore</button>`
            : `<button type="button" class="button soft sm" data-attention-progress="${esc(item.dedupeKey)}">In progress</button>`
        }
        <button type="button" class="button soft sm" data-attention-snooze="${esc(item.dedupeKey)}" data-snooze-until="${esc(snoozeUntil)}">Snooze 7d</button>
        <button type="button" class="button soft sm" data-attention-dismiss="${esc(item.dedupeKey)}">Dismiss</button>
      </div>
    </article>
  `;
}

function renderAdditionalInboxCard(item: HrInboxItem): string {
  return `
    <article class="attention-workspace-card severity-${esc(item.severity)}">
      <div class="attention-workspace-card-top">
        <span class="badge badge-soft">${esc(kindLabel(item.kind))}</span>
        <span class="badge badge-soft">${esc(item.severity.replace('_', ' '))}</span>
      </div>
      <h4 class="attention-workspace-card-title">${esc(item.title)}</h4>
      <p class="attention-workspace-card-detail">${esc(item.detail)}</p>
      <div class="attention-workspace-card-actions">
        <button type="button" class="button primary sm" data-inbox-open-id="${esc(item.id)}">Open</button>
      </div>
    </article>
  `;
}

function syncQuickFilterButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-attention-quick-filter]').forEach((button) => {
    const active = button.dataset.attentionQuickFilter === quickFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function syncFilterControls(): void {
  const category = safeGet<HTMLSelectElement>('attentionWorkspaceCategoryFilter');
  const severity = safeGet<HTMLSelectElement>('attentionWorkspaceSeverityFilter');
  const status = safeGet<HTMLSelectElement>('attentionWorkspaceStatusFilter');
  const sort = safeGet<HTMLSelectElement>('attentionWorkspaceSortFilter');
  const search = safeGet<HTMLInputElement>('attentionWorkspaceSearch');

  if (category) category.value = String(workspaceFilter.category || 'all');
  if (severity) severity.value = String(workspaceFilter.severity || 'all');
  if (status) status.value = String(workspaceFilter.status || 'all');
  if (sort) sort.value = String(workspaceFilter.sort || 'urgency');
  if (search) search.value = String(workspaceFilter.search || '');
  syncQuickFilterButtons();
}

function renderAttentionWorkspaceList(): void {
  const list = safeGet('attentionWorkspaceList');
  if (!list) return;

  const visible = getFilteredWorkspaceItems();
  const additional = cachedAdditionalInboxItems;

  if (!visible.length && !additional.length) {
    list.innerHTML =
      '<div class="attention-workspace-empty muted">No items match your filters.</div>';
    return;
  }

  const workspaceHtml = visible.map(renderAttentionCard).join('');
  const additionalHtml = additional.length
    ? `<h3 class="attention-workspace-section-title">Other queue items</h3>${additional.map(renderAdditionalInboxCard).join('')}`
    : '';

  list.innerHTML = `${workspaceHtml}${additionalHtml}`;
}

function findAttentionItem(dedupeKey: string): AttentionItem | undefined {
  return cachedWorkspaceItems.find((item) => item.dedupeKey === dedupeKey);
}

function renderAttentionWorkspacePanel(summary: AttentionSummary): void {
  renderSummary(summary);
  syncFilterControls();
  renderAttentionWorkspaceList();
}

export function applyAttentionWorkspaceAccess(): void {
  const panel = safeGet('attentionWorkspacePanel');
  const visible = isAdminUser() || isSupervisorUser();
  panel?.classList.toggle('hidden', !visible);
  panel?.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

export async function loadAttentionWorkspaceUi(force = false): Promise<void> {
  if (!isAdminUser() && !isSupervisorUser()) {
    applyAttentionWorkspaceAccess();
    return;
  }

  if (workspaceLoading) return;

  applyAttentionWorkspaceAccess();

  const list = safeGet('attentionWorkspaceList');
  if (!list) return;

  workspaceLoading = true;
  list.innerHTML = '<div class="attention-workspace-empty muted">Loading attention items…</div>';

  try {
    const workspace = await buildAttentionWorkspace(force);
    cachedWorkspaceItems = workspace.items;
    const summary = summarizeAttentionItems(workspace.items);

    const inboxItems = await buildPortalAttentionInboxItems(force);
    const workspaceIds = new Set(workspace.items.map((item) => item.dedupeKey));
    cachedAdditionalInboxItems = inboxItems.filter((item) => !workspaceIds.has(item.id));

    renderAttentionWorkspacePanel(summary);
  } catch (err) {
    console.error('[AttentionWorkspace]', err);
    list.innerHTML =
      '<div class="attention-workspace-empty muted">Could not load attention workspace.</div>';
  } finally {
    workspaceLoading = false;
  }
}

function bindAttentionWorkspaceUi(): void {
  if (workspaceUiBound) return;
  workspaceUiBound = true;

  const panel = safeGet('attentionWorkspacePanel');
  if (!panel) return;

  safeGet('attentionWorkspaceRefreshBtn')?.addEventListener('click', () => {
    void loadAttentionWorkspaceUi(true);
  });

  safeGet('attentionWorkspaceSearch')?.addEventListener('input', (event) => {
    workspaceFilter.search = String((event.target as HTMLInputElement).value || '');
    renderAttentionWorkspaceList();
  });

  safeGet('attentionWorkspaceCategoryFilter')?.addEventListener('change', (event) => {
    workspaceFilter.category = (event.target as HTMLSelectElement).value as AttentionFilter['category'];
    renderAttentionWorkspaceList();
  });

  safeGet('attentionWorkspaceSeverityFilter')?.addEventListener('change', (event) => {
    workspaceFilter.severity = (event.target as HTMLSelectElement).value as AttentionFilter['severity'];
    renderAttentionWorkspaceList();
  });

  safeGet('attentionWorkspaceStatusFilter')?.addEventListener('change', (event) => {
    workspaceFilter.status = (event.target as HTMLSelectElement).value as AttentionFilter['status'];
    renderAttentionWorkspaceList();
  });

  safeGet('attentionWorkspaceSortFilter')?.addEventListener('change', (event) => {
    workspaceFilter.sort = (event.target as HTMLSelectElement).value as AttentionFilter['sort'];
    renderAttentionWorkspaceList();
  });

  panel.querySelectorAll<HTMLButtonElement>('[data-attention-quick-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.attentionQuickFilter as QuickFilter | undefined;
      if (!next) return;
      quickFilter = next;
      syncQuickFilterButtons();
      renderAttentionWorkspaceList();
    });
  });

  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const dismissKey = target.closest<HTMLElement>('[data-attention-dismiss]')?.dataset
      .attentionDismiss;
    if (dismissKey) {
      event.preventDefault();
      const item = findAttentionItem(dismissKey);
      const dismiss = item
        ? window.dismissAttentionItem?.(item)
        : window.dismissAttentionItemByDedupeKey?.(dismissKey);
      if (typeof dismiss?.then === 'function') {
        void dismiss.catch((err: unknown) => {
          console.error('[AttentionWorkspace] Dismiss failed:', err);
          if (typeof window.showToast === 'function') {
            window.showToast('Could not dismiss this item. Try again.', 'error');
          }
        });
      }
      return;
    }

    const snoozeBtn = target.closest<HTMLElement>('[data-attention-snooze]');
    if (snoozeBtn) {
      event.preventDefault();
      const dedupeKey = snoozeBtn.dataset.attentionSnooze || '';
      const until = snoozeBtn.dataset.snoozeUntil || defaultAttentionSnoozeUntil(7);
      const item = findAttentionItem(dedupeKey);
      if (item && typeof window.snoozeAttentionItem === 'function') {
        void window.snoozeAttentionItem(item, until).then(() => loadAttentionWorkspaceUi(true));
      }
      return;
    }

    const progressKey = target.closest<HTMLElement>('[data-attention-progress]')?.dataset
      .attentionProgress;
    if (progressKey) {
      event.preventDefault();
      const item = findAttentionItem(progressKey);
      if (item && typeof window.markAttentionItemInProgress === 'function') {
        void window.markAttentionItemInProgress(item).then(() => loadAttentionWorkspaceUi(true));
      }
      return;
    }

    const restoreKey = target.closest<HTMLElement>('[data-attention-restore]')?.dataset
      .attentionRestore;
    if (restoreKey) {
      event.preventDefault();
      const item = findAttentionItem(restoreKey);
      if (item && typeof window.restoreAttentionItem === 'function') {
        void window.restoreAttentionItem(item).then(() => loadAttentionWorkspaceUi(true));
      }
      return;
    }

    const openKey = target.closest<HTMLElement>('[data-attention-open]')?.dataset.attentionOpen;
    if (openKey) {
      event.preventDefault();
      const item = findAttentionItem(openKey);
      if (item) void openPortalAttentionRoute(item.route);
      return;
    }

    const inboxOpenId = target.closest<HTMLElement>('[data-inbox-open-id]')?.dataset.inboxOpenId;
    if (inboxOpenId) {
      event.preventDefault();
      const item = cachedAdditionalInboxItems.find((row) => row.id === inboxOpenId);
      if (item) void openPortalAttentionRoute(item.route);
    }
  });
}

bindAttentionWorkspaceUi();
applyAttentionWorkspaceAccess();

window.loadAttentionWorkspaceUi = loadAttentionWorkspaceUi;
window.applyAttentionWorkspaceAccess = applyAttentionWorkspaceAccess;
