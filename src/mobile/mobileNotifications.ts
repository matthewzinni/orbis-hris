import { isMobileLayout } from './mobileLayout';
import { getWorkspaceAlerts } from '../ui/workspaceAlerts';
import { switchMainView } from '../ui/navigation';
import { refreshMobileTasksBadge } from './mobileBadges';

type WorkspaceAlert = {
  id: string;
  label: string;
  detail: string;
  count: number;
  viewId?: string;
};

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

function renderNotificationSheet(alerts: WorkspaceAlert[]): void {
  const list = document.getElementById('orbisMobileNotificationsList');
  const summary = document.getElementById('orbisMobileNotificationsSummary');
  if (!list) return;

  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  if (summary) {
    summary.textContent = total
      ? `${total} priority alert${total === 1 ? '' : 's'}`
      : 'No priority alerts right now';
  }

  if (!alerts.length) {
    list.innerHTML = '<div class="orbis-mobile-empty muted">You are caught up.</div>';
    return;
  }

  list.innerHTML = alerts
    .map(
      (alert) => `
    <button
      type="button"
      class="orbis-mobile-notification-item"
      data-nav-view="${esc(alert.viewId || 'dashboardView')}"
    >
      <span class="orbis-mobile-notification-count">${esc(alert.count)}</span>
      <span class="orbis-mobile-notification-copy">
        <span class="orbis-mobile-notification-label">${esc(alert.label)}</span>
        <span class="orbis-mobile-notification-detail muted">${esc(alert.detail)}</span>
      </span>
    </button>`
    )
    .join('');
}

function openNotificationsSheet(): void {
  const sheet = document.getElementById('orbisMobileNotificationsSheet');
  if (!sheet) return;

  renderNotificationSheet(getWorkspaceAlerts());
  void refreshMobileTasksBadge();

  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('orbis-mobile-sheet-open');
}

function closeNotificationsSheet(): void {
  const sheet = document.getElementById('orbisMobileNotificationsSheet');
  if (!sheet) return;

  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');

  if (
    !document.getElementById('orbisMobileMoreSheet')?.classList.contains('open') &&
    !document.getElementById('orbisMobileRosterFilterSheet')?.classList.contains('open')
  ) {
    document.body.classList.remove('orbis-mobile-sheet-open');
  }
}

function bindMobileNotifications(): void {
  if ((window as { __mobileNotificationsBound?: boolean }).__mobileNotificationsBound) return;
  (window as { __mobileNotificationsBound?: boolean }).__mobileNotificationsBound = true;

  const alertsBtn = document.getElementById('orbisAlertsBtn');

  alertsBtn?.addEventListener(
    'click',
    (event) => {
      if (!isMobileLayout()) return;

      event.preventDefault();
      event.stopPropagation();

      const panel = document.getElementById('orbisAlertsPanel');
      panel?.classList.remove('open');
      panel?.classList.add('hidden');
      alertsBtn.setAttribute('aria-expanded', 'false');

      openNotificationsSheet();
    },
    true
  );

  document.getElementById('orbisMobileNotificationsClose')?.addEventListener('click', () => {
    closeNotificationsSheet();
  });

  document.getElementById('orbisMobileNotificationsBackdrop')?.addEventListener('click', () => {
    closeNotificationsSheet();
  });

  document.getElementById('orbisMobileNotificationsList')?.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '.orbis-mobile-notification-item'
    );
    if (!item) return;

    event.preventDefault();
    const viewId = item.dataset.navView || 'dashboardView';
    closeNotificationsSheet();
    switchMainView(viewId);
  });

  window.addEventListener('orbis:section-change', () => {
    closeNotificationsSheet();
  });
}

export function initMobileNotifications(): void {
  bindMobileNotifications();
}
