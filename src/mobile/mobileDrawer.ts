import { isMobileLayout } from './mobileLayout';

type DrawerId =
  | 'employeeDrawer'
  | 'candidateDrawer'
  | 'investigationDrawer'
  | 'operationsIssueDrawer'
  | 'careEngagementDrawer'
  | 'janusAccountDrawer';

const MOBILE_DRAWER_IDS: DrawerId[] = [
  'employeeDrawer',
  'candidateDrawer',
  'investigationDrawer',
  'operationsIssueDrawer',
  'careEngagementDrawer',
  'janusAccountDrawer',
];

function closeMobileDrawerOnSectionChange(): void {
  if (typeof window.closeActiveDrawer === 'function') {
    window.closeActiveDrawer();
    return;
  }
  if (typeof window.closeDrawer === 'function') {
    window.closeDrawer();
  }
}

function promoteMobileDrawerTabs(drawerId: DrawerId): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  const tablist = drawer.querySelector('.drawer-tablist, .tabs.drawer-tablist, .tabs');
  if (!tablist || tablist.classList.contains('orbis-mobile-segmented')) return;

  tablist.classList.add('orbis-mobile-segmented');
}

function promoteAllMobileDrawerTabs(): void {
  MOBILE_DRAWER_IDS.forEach(promoteMobileDrawerTabs);
}

function syncMobileDrawerBodyClass(): void {
  const anyOpen = MOBILE_DRAWER_IDS.some((id) =>
    document.getElementById(id)?.classList.contains('open')
  );
  document.body.classList.toggle('orbis-mobile-employee-profile-open', anyOpen);
}

function bindMobileDrawerEvents(): void {
  if ((window as { __mobileDrawerBound?: boolean }).__mobileDrawerBound) return;
  (window as { __mobileDrawerBound?: boolean }).__mobileDrawerBound = true;

  window.addEventListener('orbis:section-change', () => {
    if (!isMobileLayout()) return;
    const anyOpen = MOBILE_DRAWER_IDS.some((id) =>
      document.getElementById(id)?.classList.contains('open')
    );
    if (!anyOpen) return;
    closeMobileDrawerOnSectionChange();
  });

  window.addEventListener('orbis:layout-change', () => {
    promoteAllMobileDrawerTabs();
  });

  MOBILE_DRAWER_IDS.forEach((drawerId) => {
    const drawer = document.getElementById(drawerId);
    if (!drawer) return;

    const observer = new MutationObserver(() => {
      if (!isMobileLayout()) return;
      if (drawer.classList.contains('open')) {
        promoteMobileDrawerTabs(drawerId);
      }
      syncMobileDrawerBodyClass();
    });

    observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
  });
}

export function initMobileDrawer(): void {
  bindMobileDrawerEvents();
  promoteAllMobileDrawerTabs();
}
