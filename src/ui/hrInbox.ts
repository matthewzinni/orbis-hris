import { isAdminUser, isSupervisorUser } from '../services/access';
import {
  buildHrInboxItems,
  filterHrInboxItems,
  kindLabel,
  type HrInboxItem,
  type HrInboxRoute,
} from '../services/hrInbox';
import { switchMainView } from './navigation';
import { renderOutTodayCard } from '../modules/leaveRequests';

let inboxLoading = false;
let inboxFilter: 'all' | 'overdue' | 'due_soon' = 'all';
let inboxBound = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function severityLabel(severity: HrInboxItem['severity']): string {
  if (severity === 'overdue') return 'Overdue';
  if (severity === 'due_soon') return 'Due soon';
  return 'Open';
}

async function openInboxRoute(route: HrInboxRoute): Promise<void> {
  if (route.type === 'view') {
    switchMainView(route.viewId);
    return;
  }

  if (route.type === 'investigation') {
    switchMainView('investigationsView');
    if (typeof window.openInvestigationDrawer === 'function') {
      await window.openInvestigationDrawer(route.investigationId);
    }
    return;
  }

  if (route.type === 'operations') {
    switchMainView('operationsView');
    if (typeof window.openOperationsIssueDrawer === 'function') {
      await window.openOperationsIssueDrawer(route.issueId);
    }
    return;
  }

  if (route.type === 'payroll_handoff') {
    if (typeof window.openEmployeeDrawer === 'function') {
      await window.openEmployeeDrawer(route.employeeId);
    }
    return;
  }

  if (typeof window.openEmployeeDrawer === 'function') {
    await window.openEmployeeDrawer(route.employeeId);
  }

  const tab = route.drawerTab;
  if (!tab) return;

  if (typeof window.switchDrawerTab === 'function') {
    window.switchDrawerTab(tab);
  } else if (typeof window.switchTab === 'function') {
    window.switchTab(tab);
  }
}

function updateInboxSummary(items: HrInboxItem[]): void {
  const summary = safeGet('hrInboxSummary');
  const overdue = items.filter((item) => item.severity === 'overdue').length;
  const dueSoon = items.filter((item) => item.severity === 'due_soon').length;

  if (summary) {
    if (!items.length) {
      summary.textContent = "No open items — you're caught up.";
    } else {
      summary.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${overdue} overdue · ${dueSoon} due soon`;
    }
  }

  const badge = safeGet('hrInboxOverdueBadge');
  if (badge) {
    if (overdue > 0) {
      badge.textContent = String(overdue);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }
}

function renderInboxList(items: HrInboxItem[]): void {
  const list = safeGet('hrInboxList');
  if (!list) return;

  const visible = filterHrInboxItems(items, inboxFilter);
  updateInboxSummary(items);

  if (!visible.length) {
    list.innerHTML =
      inboxFilter === 'all'
        ? '<div class="hr-inbox-empty muted">No priority items right now.</div>'
        : '<div class="hr-inbox-empty muted">Nothing in this filter.</div>';
    return;
  }

  list.innerHTML = visible
    .map(
      (item) => `
        <button
          type="button"
          class="hr-inbox-item severity-${escapeHtml(item.severity)}"
          data-inbox-id="${escapeHtml(item.id)}"
        >
          <span class="hr-inbox-item-meta">
            <span class="hr-inbox-severity">${escapeHtml(severityLabel(item.severity))}</span>
            <span class="hr-inbox-kind">${escapeHtml(kindLabel(item.kind))}</span>
          </span>
          <span class="hr-inbox-item-title">${escapeHtml(item.title)}</span>
          <span class="hr-inbox-item-detail">${escapeHtml(item.detail)}</span>
        </button>
      `
    )
    .join('');
}

function setInboxFilter(filter: 'all' | 'overdue' | 'due_soon'): void {
  inboxFilter = filter;

  document.querySelectorAll<HTMLButtonElement>('[data-hr-inbox-filter]').forEach((button) => {
    const active = button.dataset.hrInboxFilter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (window.__hrInboxCache) {
    renderInboxList(window.__hrInboxCache);
  }
}

function bindHrInboxUi(): void {
  if (inboxBound) return;
  inboxBound = true;

  document.querySelectorAll<HTMLButtonElement>('[data-hr-inbox-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.hrInboxFilter as 'all' | 'overdue' | 'due_soon';
      if (!filter) return;
      setInboxFilter(filter);
    });
  });

  const list = safeGet('hrInboxList');
  list?.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-inbox-id]');
    if (!target) return;

    const id = target.dataset.inboxId || '';
    const item = window.__hrInboxCache?.find((row) => row.id === id);
    if (!item) return;

    event.preventDefault();
    void openInboxRoute(item.route);
  });

  const refreshBtn = safeGet<HTMLButtonElement>('hrInboxRefreshBtn');
  refreshBtn?.addEventListener('click', () => {
    void loadHrInbox(true);
  });
}

export function applyHrInboxAccess(): void {
  const visible = isAdminUser() || isSupervisorUser();

  document.querySelectorAll<HTMLElement>('[data-hr-inbox-access]').forEach((element) => {
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
}

export function getHrInboxItems(): HrInboxItem[] {
  return window.__hrInboxCache || [];
}

export async function loadHrInbox(force = false): Promise<void> {
  if (!isAdminUser() && !isSupervisorUser()) {
    window.__hrInboxCache = [];
    renderInboxList([]);
    return;
  }

  if (inboxLoading) return;

  const list = safeGet('hrInboxList');
  if (!list) return;

  if (!force && window.__hrInboxCache) {
    renderInboxList(window.__hrInboxCache);
    return;
  }

  inboxLoading = true;
  list.innerHTML = '<div class="hr-inbox-empty muted">Loading inbox…</div>';

  try {
    const items = await buildHrInboxItems();
    window.__hrInboxCache = items;
    renderInboxList(items);

    if (typeof window.updateWorkspaceAlerts === 'function') {
      window.updateWorkspaceAlerts();
    }

    if (typeof window.refreshMobileTasksUi === 'function') {
      void window.refreshMobileTasksUi();
    }

    void renderOutTodayCard();
  } catch (err) {
    console.error('[HrInbox] Load failed:', err);
    list.innerHTML =
      '<div class="hr-inbox-empty muted">Could not load HR inbox. Try refresh.</div>';
  } finally {
    inboxLoading = false;
  }
}

bindHrInboxUi();
applyHrInboxAccess();

window.loadHrInbox = loadHrInbox;
window.applyHrInboxAccess = applyHrInboxAccess;
window.getHrInboxItems = getHrInboxItems;
