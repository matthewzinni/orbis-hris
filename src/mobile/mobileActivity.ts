import { fetchMobileActivityFeed, type MobileActivityItem } from '../services/mobileActivityFeed';
import { isMobileLayout } from './mobileLayout';
import { switchMainView } from '../ui/navigation';

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

function formatWhen(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10) || '—';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderActivityCard(item: MobileActivityItem): string {
  return `
    <button
      type="button"
      class="orbis-mobile-activity-card"
      data-activity-employee="${esc(item.employeeId)}"
      data-activity-tab="${esc(item.drawerTab || 'profile')}"
    >
      <div class="orbis-mobile-activity-card-top">
        <span class="badge badge-soft">${esc(item.category)}</span>
        <span class="orbis-mobile-activity-when muted">${esc(formatWhen(item.sortTimestamp))}</span>
      </div>
      <div class="orbis-mobile-activity-title">${esc(item.title)}</div>
      <div class="orbis-mobile-activity-employee">${esc(item.employeeName)}</div>
      ${item.detail ? `<div class="orbis-mobile-activity-detail muted">${esc(item.detail)}</div>` : ''}
    </button>`;
}

function resolveDrawerEmployeeId(employeeId: string): string {
  const id = String(employeeId || '').trim();
  const employees = Array.isArray((window as { EMPLOYEES?: Array<Record<string, unknown>> }).EMPLOYEES)
    ? (window as { EMPLOYEES?: Array<Record<string, unknown>> }).EMPLOYEES!
    : [];

  const match = employees.find((employee) => {
    const keys = [
      employee.id,
      employee.dbId,
      employee.employee_id,
      employee.employeeId,
    ].map((value) => String(value || '').trim());
    return keys.includes(id);
  });

  return String(match?.dbId || match?.id || id).trim();
}

async function openActivityItem(item: MobileActivityItem): Promise<void> {
  const recordId = resolveDrawerEmployeeId(item.employeeId);
  if (!recordId) return;

  switchMainView('employeesView');

  const openDrawer = async () => {
    if (typeof window.openEmployeeDrawer === 'function') {
      await window.openEmployeeDrawer(recordId);
    } else if (typeof window.openDrawerByEmployeeId === 'function') {
      await window.openDrawerByEmployeeId(recordId);
    }

    const tab = item.drawerTab || 'profile';
    if (typeof window.switchDrawerTab === 'function') {
      window.switchDrawerTab(tab);
    } else if (typeof window.switchTab === 'function') {
      window.switchTab(tab);
    }
  };

  await openDrawer();
}

export async function loadMobileActivityFeed(force = false): Promise<void> {
  const feed = document.getElementById('mobileActivityFeed');
  if (!feed) return;

  if (!isMobileLayout() && !force) return;

  feed.innerHTML = '<div class="orbis-mobile-activity-loading muted">Loading activity…</div>';

  try {
    const items = await fetchMobileActivityFeed(30);

    if (!items.length) {
      feed.innerHTML =
        '<div class="orbis-mobile-empty muted">No recent team activity yet.</div>';
      return;
    }

    feed.innerHTML = items.map(renderActivityCard).join('');
  } catch (err) {
    console.error('[MobileActivity]', err);
    feed.innerHTML =
      '<div class="orbis-mobile-empty muted">Could not load activity. Try refresh.</div>';
  }
}

function bindMobileActivityEvents(): void {
  if ((window as { __mobileActivityBound?: boolean }).__mobileActivityBound) return;
  (window as { __mobileActivityBound?: boolean }).__mobileActivityBound = true;

  document.getElementById('mobileActivityRefreshBtn')?.addEventListener('click', () => {
    void loadMobileActivityFeed(true);
  });

  document.getElementById('mobileActivityFeed')?.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '.orbis-mobile-activity-card'
    );
    if (!card) return;

    event.preventDefault();
    const employeeId = card.dataset.activityEmployee || '';
    const drawerTab = card.dataset.activityTab || 'profile';
    if (!employeeId) return;

    void openActivityItem({
      id: '',
      source: 'note',
      category: '',
      title: '',
      detail: '',
      sortTimestamp: '',
      employeeId,
      employeeName: '',
      drawerTab,
    });
  });

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (sectionId === 'activityView') {
      void loadMobileActivityFeed();
    }
  });

  window.addEventListener('orbis:layout-change', () => {
    if (window.currentMainView === 'activityView') {
      void loadMobileActivityFeed();
    }
  });
}

export function initMobileActivity(): void {
  bindMobileActivityEvents();
}

declare global {
  interface Window {
    loadMobileActivityFeed?: (force?: boolean) => Promise<void>;
    openEmployeeDrawer?: (employeeId: string) => Promise<void>;
    openDrawerByEmployeeId?: (id: string) => Promise<void>;
    switchDrawerTab?: (tabName: string) => void;
    switchTab?: (tabName: string) => void;
  }
}

window.loadMobileActivityFeed = loadMobileActivityFeed;
