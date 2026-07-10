import {
  canAccessAppSection,
  getLinkedEmployeeId,
  isAdminUser,
  isSupervisorUser,
} from '../services/access';
import { loadEmployeeTasksSnapshot } from '../services/employeeTasks';
import { isMobileLayout } from './mobileLayout';

let cachedTasksBadgeCount = 0;

export function getMobileTasksBadgeCount(): number {
  return cachedTasksBadgeCount;
}

export function applyMobileTabBadges(): void {
  if (!isMobileLayout()) return;

  document.querySelectorAll('#orbisMobileTabBar .orbis-mobile-tab-badge').forEach((el) => el.remove());

  if (cachedTasksBadgeCount <= 0) return;

  const attentionTab = document.querySelector(
    '#orbisMobileTabBar .orbis-mobile-tab[data-mobile-tab="attention"]'
  );
  if (!attentionTab) return;

  const badge = document.createElement('span');
  badge.className = 'orbis-mobile-tab-badge';
  badge.textContent = cachedTasksBadgeCount > 99 ? '99+' : String(cachedTasksBadgeCount);
  badge.setAttribute('aria-label', `${cachedTasksBadgeCount} items need attention`);
  attentionTab.appendChild(badge);
}

export async function refreshMobileTasksBadge(): Promise<void> {
  let count = 0;

  if (isAdminUser() || isSupervisorUser()) {
    if (!window.__hrInboxCache && typeof window.loadHrInbox === 'function') {
      try {
        await window.loadHrInbox();
      } catch {
        // Badge can stay at last known count.
      }
    }

    const inboxItems = typeof window.getHrInboxItems === 'function' ? window.getHrInboxItems() : [];
    count += inboxItems.filter(
      (item) => item.severity === 'overdue' || item.severity === 'due_soon'
    ).length;
  }

  const employeeId = getLinkedEmployeeId();
  if (employeeId && canAccessAppSection('myTasksView')) {
    try {
      const snapshot = await loadEmployeeTasksSnapshot(employeeId);
      count += snapshot.pending.length;
    } catch {
      // Ignore — inbox-only badge still applies.
    }
  }

  cachedTasksBadgeCount = count;
  applyMobileTabBadges();
}

window.refreshMobileTasksBadge = refreshMobileTasksBadge;
