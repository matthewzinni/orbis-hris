import { isAdminUser, isSupervisorUser } from '../services/access';
import {
  getCachedAttentionSummary,
  getCachedAttentionWorkspace,
} from '../services/attention/attentionSummary';
import { summarizeAttentionCategoryAlerts } from '../services/attention/attentionWorkspaceAlerts';
import { summarizeHrInboxForAlerts } from '../services/hrInbox';
import { switchMainView } from './navigation';

type WorkspaceAlert = {
  id: string;
  label: string;
  detail: string;
  count: number;
  viewId?: string;
};

function parseCountFromElement(id: string): number {
  const text = String(document.getElementById(id)?.textContent || '').trim();

  if (!text || text === '—' || text === '-') {
    return 0;
  }

  const match = text.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function collectWorkspaceAlertsFromDom(): WorkspaceAlert[] {
  const alerts: WorkspaceAlert[] = [];

  const reviewsDue = parseCountFromElement('kReviewsDue');
  const overdueTable = parseCountFromElement('reviewDashboardOverdue');
  const stayOverdue = Math.max(reviewsDue, overdueTable);

  if (stayOverdue > 0) {
    alerts.push({
      id: 'stay-interviews-due',
      label: 'Stay interviews due',
      detail: `${stayOverdue} overdue stay interview${stayOverdue === 1 ? '' : 's'}`,
      count: stayOverdue,
      viewId: 'dashboardView',
    });
  }

  const performanceReviewsDue = parseCountFromElement('kPerformanceReviewsDue');
  if (performanceReviewsDue > 0) {
    alerts.push({
      id: 'performance-reviews-due',
      label: 'Performance reviews due',
      detail: `${performanceReviewsDue} 90-day or annual review${performanceReviewsDue === 1 ? '' : 's'} need attention`,
      count: performanceReviewsDue,
      viewId: 'myTasksView',
    });
  }

  const atRisk = parseCountFromElement('kAtRiskEmployees');
  if (atRisk > 0) {
    alerts.push({
      id: 'at-risk',
      label: 'At-risk employees',
      detail: `${atRisk} employee${atRisk === 1 ? '' : 's'} flagged`,
      count: atRisk,
      viewId: 'dashboardView',
    });
  }

  const discipline = parseCountFromElement('kOpenDiscipline');
  if (discipline > 0) {
    alerts.push({
      id: 'open-discipline',
      label: 'Open discipline cases',
      detail: `${discipline} case${discipline === 1 ? '' : 's'} need follow-up`,
      count: discipline,
      viewId: 'dashboardView',
    });
  }

  const dueSoon = parseCountFromElement('reviewDashboardDueSoon');
  if (dueSoon > 0) {
    alerts.push({
      id: 'stay-interviews-due-soon',
      label: 'Stay interviews due in 30 days',
      detail: `${dueSoon} upcoming`,
      count: dueSoon,
      viewId: 'dashboardView',
    });
  }

  if (isAdminUser() || isSupervisorUser()) {
    const careOpen = parseCountFromElement('kCareOpenItems');
    if (careOpen > 0) {
      alerts.push({
        id: 'care-open-items',
        label: 'Open care items',
        detail: `${careOpen} active support case${careOpen === 1 ? '' : 's'}`,
        count: careOpen,
        viewId: 'careEngagementView',
      });
    }

    const careFollowUp = parseCountFromElement('kCareFollowUp');
    if (careFollowUp > 0) {
      alerts.push({
        id: 'care-follow-ups',
        label: 'Care follow-ups',
        detail: `${careFollowUp} employee${careFollowUp === 1 ? '' : 's'} need touchpoints`,
        count: careFollowUp,
        viewId: 'careEngagementView',
      });
    }

    const careCheckIns = parseCountFromElement('kCareCheckIns');
    if (careCheckIns > 0) {
      alerts.push({
        id: 'care-check-ins',
        label: 'Upcoming care check-ins',
        detail: `${careCheckIns} in the next 14 days`,
        count: careCheckIns,
        viewId: 'careEngagementView',
      });
    }
  }

  if (isAdminUser()) {
    const invOverdue = parseCountFromElement('kInvOverdue');
    if (invOverdue > 0) {
      alerts.push({
        id: 'investigations-overdue',
        label: 'Overdue investigations',
        detail: `${invOverdue} case${invOverdue === 1 ? '' : 's'} past target date`,
        count: invOverdue,
        viewId: 'investigationsView',
      });
    }

    const invHigh = parseCountFromElement('kInvHighSeverity');
    if (invHigh > 0) {
      alerts.push({
        id: 'investigations-high-severity',
        label: 'High-severity investigations',
        detail: `${invHigh} open case${invHigh === 1 ? '' : 's'}`,
        count: invHigh,
        viewId: 'investigationsView',
      });
    }
  }

  return alerts;
}

const ATTENTION_MANAGED_ALERT_IDS = new Set([
  'performance-reviews-due',
  'open-discipline',
  'meetings-attention',
  'candidate-interviews-attention',
  'employee-records-incomplete',
]);

function collectAttentionFallbackAlerts(): WorkspaceAlert[] {
  const workspace = getCachedAttentionWorkspace();
  if (!workspace?.items.length) {
    return [];
  }

  return summarizeAttentionCategoryAlerts(workspace.items);
}

function mergeAlerts(primary: WorkspaceAlert[], secondary: WorkspaceAlert[]): WorkspaceAlert[] {
  const seen = new Set(primary.map((alert) => alert.id));
  const merged = [...primary];

  secondary.forEach((alert) => {
    if (seen.has(alert.id)) return;
    seen.add(alert.id);
    merged.push(alert);
  });

  return merged;
}

function collectWorkspaceAlerts(): WorkspaceAlert[] {
  const inboxItems =
    typeof window.getHrInboxItems === 'function' ? window.getHrInboxItems() : window.__hrInboxCache;

  if ((isAdminUser() || isSupervisorUser()) && inboxItems !== undefined) {
    return summarizeHrInboxForAlerts(inboxItems).map((alert) => ({
      id: alert.id,
      label: alert.label,
      detail: alert.detail,
      count: alert.count,
      viewId: alert.viewId,
    }));
  }

  const attentionAlerts = collectAttentionFallbackAlerts();
  if (attentionAlerts.length || getCachedAttentionSummary()) {
    const legacyDomAlerts = collectWorkspaceAlertsFromDom().filter(
      (alert) => !ATTENTION_MANAGED_ALERT_IDS.has(alert.id)
    );
    return mergeAlerts(attentionAlerts, legacyDomAlerts);
  }

  return collectWorkspaceAlertsFromDom();
}

function renderAlertsPanel(alerts: WorkspaceAlert[]): void {
  const list = document.getElementById('orbisAlertsList');
  const badge = document.getElementById('orbisAlertsBadge');

  if (!list) return;

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  if (badge) {
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.classList.remove('hidden');
    } else {
      badge.textContent = '';
      badge.classList.add('hidden');
    }
  }

  const btn = document.getElementById('orbisAlertsBtn');
  if (btn) {
    btn.setAttribute('aria-label', total > 0 ? `${total} HR alerts` : 'No HR alerts');
  }

  if (!alerts.length) {
    list.innerHTML =
      '<div class="orbis-alerts-empty muted">No priority alerts right now.</div>';
    return;
  }

  list.innerHTML = alerts
    .map(
      (alert) => `
        <button
          type="button"
          class="orbis-alerts-item"
          data-alert-id="${alert.id}"
          data-nav-view="${alert.viewId || 'dashboardView'}"
        >
          <span class="orbis-alerts-item-count">${alert.count}</span>
          <span class="orbis-alerts-item-copy">
            <span class="orbis-alerts-item-label">${alert.label}</span>
            <span class="orbis-alerts-item-detail">${alert.detail}</span>
          </span>
        </button>
      `
    )
    .join('');
}

export function getWorkspaceAlerts(): WorkspaceAlert[] {
  return collectWorkspaceAlerts();
}

export function updateWorkspaceAlerts(): void {
  renderAlertsPanel(collectWorkspaceAlerts());
}

function mountAlertsPanelPortal(): void {
  const panel = document.getElementById('orbisAlertsPanel');
  if (!panel || panel.dataset.portaled === 'true') return;

  document.body.appendChild(panel);
  panel.dataset.portaled = 'true';
}

function positionAlertsPanel(): void {
  const panel = document.getElementById('orbisAlertsPanel');
  const btn = document.getElementById('orbisAlertsBtn');

  if (!panel || !btn || panel.classList.contains('hidden')) return;

  const rect = btn.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 32);
  const right = Math.max(16, window.innerWidth - rect.right);
  const top = rect.bottom + 8;

  panel.style.position = 'fixed';
  panel.style.top = `${top}px`;
  panel.style.right = `${right}px`;
  panel.style.left = 'auto';
  panel.style.width = `${width}px`;
}

function setAlertsPanelOpen(open: boolean): void {
  const panel = document.getElementById('orbisAlertsPanel');
  const btn = document.getElementById('orbisAlertsBtn');

  if (!panel || !btn) return;

  panel.classList.toggle('open', open);
  panel.classList.toggle('hidden', !open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open) {
    positionAlertsPanel();
  } else {
    panel.style.position = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.left = '';
    panel.style.width = '';
  }
}

function bindWorkspaceAlerts(): void {
  if ((window as { __workspaceAlertsBound?: boolean }).__workspaceAlertsBound) {
    return;
  }

  (window as { __workspaceAlertsBound?: boolean }).__workspaceAlertsBound = true;

  mountAlertsPanelPortal();

  const btn = document.getElementById('orbisAlertsBtn');
  const panel = document.getElementById('orbisAlertsPanel');
  const list = document.getElementById('orbisAlertsList');

  btn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = panel?.classList.contains('open') === true;
    setAlertsPanelOpen(!isOpen);
    if (!isOpen) {
      updateWorkspaceAlerts();
    }
  });

  list?.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement | null)?.closest(
      '.orbis-alerts-item'
    ) as HTMLElement | null;

    if (!item) return;

    const viewId = item.dataset.navView || 'dashboardView';
    setAlertsPanelOpen(false);
    switchMainView(viewId);
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    if (!panel || !btn) return;
    if (panel.contains(target as Node) || btn.contains(target as Node)) return;
    setAlertsPanelOpen(false);
  });

  window.addEventListener('orbis:section-change', () => {
    setAlertsPanelOpen(false);
  });

  window.addEventListener('resize', () => {
    if (panel?.classList.contains('open')) {
      positionAlertsPanel();
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (panel?.classList.contains('open')) {
        positionAlertsPanel();
      }
    },
    true
  );

  updateWorkspaceAlerts();
}

bindWorkspaceAlerts();

window.updateWorkspaceAlerts = updateWorkspaceAlerts;
