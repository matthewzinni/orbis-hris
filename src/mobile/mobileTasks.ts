import { isAdminUser, isSupervisorUser } from '../services/access';
import {
  filterHrInboxItems,
  kindLabel,
  type HrInboxItem,
} from '../services/hrInbox';
import { applyPayrollHandoffAction } from '../modules/payrollHandoff';
import { isMobileLayout } from './mobileLayout';
import { refreshMobileTasksBadge } from './mobileBadges';

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function severityLabel(severity: HrInboxItem['severity']): string {
  if (severity === 'overdue') return 'Overdue';
  if (severity === 'due_soon') return 'Due soon';
  return 'Open';
}

function renderHrTaskCard(item: HrInboxItem): string {
  const payrollActions =
    item.kind === 'payroll_handoff' && item.route.type === 'payroll_handoff'
      ? `<div class="orbis-mobile-hr-task-actions">
          <button type="button" class="button soft sm" data-mobile-payroll-action="sent" data-mobile-payroll-id="${esc(item.route.handoffId)}">Mark sent</button>
          <button type="button" class="button soft sm" data-mobile-payroll-action="confirmed" data-mobile-payroll-id="${esc(item.route.handoffId)}">Confirmed</button>
        </div>`
      : '';

  return `
    <article class="orbis-mobile-hr-task-card severity-${esc(item.severity)}">
      <button
        type="button"
        class="orbis-mobile-hr-task-card-main"
        data-mobile-inbox-id="${esc(item.id)}"
      >
        <span class="orbis-mobile-hr-task-meta">
          <span class="hr-inbox-severity">${esc(severityLabel(item.severity))}</span>
          <span class="hr-inbox-kind">${esc(kindLabel(item.kind))}</span>
        </span>
        <span class="orbis-mobile-hr-task-title">${esc(item.title)}</span>
        <span class="orbis-mobile-hr-task-detail muted">${esc(item.detail)}</span>
      </button>
      ${payrollActions}
    </article>`;
}

async function openMobileInboxItem(item: HrInboxItem): Promise<void> {
  const route = item.route;

  if (route.type === 'view') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView(route.viewId);
    }
    return;
  }

  if (route.type === 'investigation') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('investigationsView');
    }
    if (typeof window.openInvestigationDrawer === 'function') {
      await window.openInvestigationDrawer(route.investigationId);
    }
    return;
  }

  if (route.type === 'operations') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('operationsView');
    }
    if (typeof window.openOperationsIssueDrawer === 'function') {
      await window.openOperationsIssueDrawer(route.issueId);
    }
    return;
  }

  if (route.type === 'payroll_handoff') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('employeesView');
    }
    if (typeof window.openEmployeeDrawer === 'function') {
      await window.openEmployeeDrawer(route.employeeId);
    }
    return;
  }

  if (typeof window.switchMainView === 'function') {
    window.switchMainView('employeesView');
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

export function renderMobileHrTasksPanel(): void {
  const card = document.getElementById('mobileHrTasksCard');
  const list = document.getElementById('mobileHrTasksList');
  const summary = document.getElementById('mobileHrTasksSummary');

  if (!card || !list) return;

  const showPanel = isMobileLayout() && (isAdminUser() || isSupervisorUser());
  card.classList.toggle('hidden', !showPanel);

  if (!showPanel) return;

  const items = window.__hrInboxCache || [];
  const visible = filterHrInboxItems(items, 'all');
  const overdue = items.filter((item) => item.severity === 'overdue').length;
  const dueSoon = items.filter((item) => item.severity === 'due_soon').length;

  if (summary) {
    if (!items.length) {
      summary.textContent = 'No open HR action items.';
    } else {
      summary.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${overdue} overdue · ${dueSoon} due soon`;
    }
  }

  if (!visible.length) {
    list.innerHTML = '<div class="orbis-mobile-empty muted">You are caught up on HR action items.</div>';
    return;
  }

  list.innerHTML = visible.map(renderHrTaskCard).join('');
}

function bindMobileTasksEvents(): void {
  if ((window as { __mobileTasksBound?: boolean }).__mobileTasksBound) return;
  (window as { __mobileTasksBound?: boolean }).__mobileTasksBound = true;

  document.getElementById('mobileHrTasksList')?.addEventListener('click', (event) => {
    const payrollButton = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-mobile-payroll-action]'
    );
    if (payrollButton) {
      event.preventDefault();
      event.stopPropagation();
      const handoffId = payrollButton.dataset.mobilePayrollId || '';
      const action = payrollButton.dataset.mobilePayrollAction;
      if (!handoffId || (action !== 'sent' && action !== 'confirmed')) return;

      void (async () => {
        try {
          await applyPayrollHandoffAction(handoffId, action);
          if (typeof window.showToast === 'function') {
            window.showToast(
              action === 'confirmed'
                ? 'Marked confirmed with payroll.'
                : 'Marked sent to payroll.'
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not update handoff.';
          if (typeof window.showToast === 'function') {
            window.showToast(message, 'error');
          }
        }
      })();
      return;
    }

    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-mobile-inbox-id]'
    );
    if (!button) return;

    event.preventDefault();
    const id = button.dataset.mobileInboxId || '';
    const item = window.__hrInboxCache?.find((row) => row.id === id);
    if (!item) return;
    if (item.kind === 'payroll_handoff') return;
    void openMobileInboxItem(item);
  });

  document.getElementById('mobileHrTasksRefreshBtn')?.addEventListener('click', () => {
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true).then(() => {
        renderMobileHrTasksPanel();
        void refreshMobileTasksBadge();
      });
    }
  });

  window.addEventListener('orbis:layout-change', () => {
    renderMobileHrTasksPanel();
  });

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (sectionId !== 'myTasksView') return;

    if (isMobileLayout() && (isAdminUser() || isSupervisorUser())) {
      if (typeof window.loadHrInbox === 'function') {
        void window.loadHrInbox().then(() => {
          renderMobileHrTasksPanel();
          void refreshMobileTasksBadge();
        });
      }
    }
  });
}

export async function refreshMobileTasksUi(): Promise<void> {
  renderMobileHrTasksPanel();
  await refreshMobileTasksBadge();
}

export function initMobileTasks(): void {
  bindMobileTasksEvents();
  void refreshMobileTasksUi();
}

window.refreshMobileTasksUi = refreshMobileTasksUi;
