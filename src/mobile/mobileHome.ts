import { isMobileLayout } from './mobileLayout';
import { isEmployeeUser } from '../services/access';

function refreshMobileHomeLayout(): void {
  const dashboard = document.getElementById('dashboardTop');
  if (!dashboard) return;

  dashboard.classList.toggle('orbis-mobile-home', isMobileLayout());

  const kpiGrid = dashboard.querySelector('.dashboard-kpi-grid, .kpi-grid');
  kpiGrid?.classList.toggle('orbis-mobile-kpi-carousel', isMobileLayout() && !isEmployeeUser());
}

function bindMobileHomeEvents(): void {
  if ((window as { __mobileHomeBound?: boolean }).__mobileHomeBound) return;
  (window as { __mobileHomeBound?: boolean }).__mobileHomeBound = true;

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (sectionId === 'dashboardView' || sectionId === 'myProfileView') {
      refreshMobileHomeLayout();
    }
  });

  window.addEventListener('orbis:layout-change', () => {
    refreshMobileHomeLayout();
  });
}

export function initMobileHome(): void {
  bindMobileHomeEvents();
  refreshMobileHomeLayout();
}
