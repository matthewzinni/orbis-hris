import { isMobileLayout } from './mobileLayout';

function closeEmployeeDrawerOnMobile(): void {
  if (typeof window.closeActiveDrawer === 'function') {
    window.closeActiveDrawer();
    return;
  }
  if (typeof window.closeDrawer === 'function') {
    window.closeDrawer();
  }
}

function promoteMobileDrawerTabs(): void {
  const drawer = document.getElementById('employeeDrawer');
  if (!drawer) return;

  const tablist = drawer.querySelector('.drawer-tablist, .tabs.drawer-tablist');
  if (!tablist || tablist.classList.contains('orbis-mobile-segmented')) return;

  tablist.classList.add('orbis-mobile-segmented');
}

function bindMobileDrawerEvents(): void {
  if ((window as { __mobileDrawerBound?: boolean }).__mobileDrawerBound) return;
  (window as { __mobileDrawerBound?: boolean }).__mobileDrawerBound = true;

  window.addEventListener('orbis:section-change', (event) => {
    if (!isMobileLayout()) return;
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    const drawer = document.getElementById('employeeDrawer');
    if (!drawer?.classList.contains('open')) return;
    if (sectionId === 'employeesView') return;
    closeEmployeeDrawerOnMobile();
  });

  window.addEventListener('orbis:layout-change', () => {
    promoteMobileDrawerTabs();
  });

  const observer = new MutationObserver(() => {
    if (!isMobileLayout()) return;
    const drawer = document.getElementById('employeeDrawer');
    if (drawer?.classList.contains('open')) {
      promoteMobileDrawerTabs();
      document.body.classList.add('orbis-mobile-employee-profile-open');
    } else {
      document.body.classList.remove('orbis-mobile-employee-profile-open');
    }
  });

  const drawer = document.getElementById('employeeDrawer');
  if (drawer) {
    observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
  }
}

export function initMobileDrawer(): void {
  bindMobileDrawerEvents();
  promoteMobileDrawerTabs();
}
