import { canAccessAppSection, isEmployeeUser } from '../services/access';
import { isMobileLayout } from './mobileLayout';
import { switchMainView } from '../ui/navigation';

const PORTAL_QUICK_LINKS: Array<{ sectionId: string; label: string; icon: string }> = [
  { sectionId: 'myTasksView', label: 'Tasks', icon: '✓' },
  { sectionId: 'myTimeOffView', label: 'Time off', icon: '◎' },
  { sectionId: 'myDirectoryView', label: 'Directory', icon: '👥' },
];

function esc(value: string): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPortalQuickLinks(): void {
  const container = document.getElementById('mobilePortalQuickLinks');
  if (!container) return;

  const show = isMobileLayout() && isEmployeeUser();
  container.classList.toggle('hidden', !show);
  if (!show) return;

  const links = PORTAL_QUICK_LINKS.filter((link) => canAccessAppSection(link.sectionId));
  if (!links.length) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = links
    .map(
      (link) => `
    <button
      type="button"
      class="orbis-mobile-portal-quicklink"
      data-nav-view="${esc(link.sectionId)}"
    >
      <span class="orbis-mobile-portal-quicklink-icon" aria-hidden="true">${link.icon}</span>
      <span>${esc(link.label)}</span>
    </button>`
    )
    .join('');
}

function markPortalPages(): void {
  document.querySelectorAll('.employee-portal-page').forEach((page) => {
    page.classList.toggle('orbis-mobile-portal-page', isMobileLayout());
  });
}

function bindPortalQuickLinks(): void {
  document.getElementById('mobilePortalQuickLinks')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-nav-view]'
    );
    if (!button) return;
    event.preventDefault();
    const sectionId = button.dataset.navView || '';
    if (sectionId) switchMainView(sectionId);
  });
}

function bindPortalEvents(): void {
  if ((window as { __mobilePortalBound?: boolean }).__mobilePortalBound) return;
  (window as { __mobilePortalBound?: boolean }).__mobilePortalBound = true;

  bindPortalQuickLinks();

  window.addEventListener('orbis:layout-change', () => {
    renderPortalQuickLinks();
    markPortalPages();
  });

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (
      sectionId === 'myProfileView' ||
      sectionId === 'myTasksView' ||
      sectionId === 'myTimeOffView' ||
      sectionId === 'myDirectoryView'
    ) {
      markPortalPages();
    }
    if (sectionId === 'myProfileView') {
      renderPortalQuickLinks();
    }
  });
}

export function initMobilePortal(): void {
  bindPortalEvents();
  renderPortalQuickLinks();
  markPortalPages();
}

export function refreshMobilePortalUi(): void {
  renderPortalQuickLinks();
  markPortalPages();
}

window.refreshMobilePortalUi = refreshMobilePortalUi;

