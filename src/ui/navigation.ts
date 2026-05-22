import { resolveAppSection, showAppSection } from './appSections';

declare global {
  interface Window {
    openCandidatesView?: () => void;
    openEmployeesView?: () => void;
    openDashboardView?: () => void;
    switchMainView?: (sectionId: string) => void;
    currentMainView?: string;
  }
}

export function switchMainView(sectionId: string): void {
  showAppSection(sectionId);
}

export function openCandidatesView(): void {
  switchMainView('candidatesView');
}

export function openEmployeesView(): void {
  switchMainView('employeesView');
}

export function openDashboardView(): void {
  switchMainView('dashboardView');
}

function bindNavigationEvents(): void {
  if ((window as { __navigationEventsBound?: boolean }).__navigationEventsBound) {
    return;
  }

  (window as { __navigationEventsBound?: boolean }).__navigationEventsBound = true;

  document.addEventListener('click', (event) => {
    const navButton = (event.target as HTMLElement | null)?.closest(
      '[data-nav-view]'
    ) as HTMLElement | null;

    if (!navButton) return;

    const sectionId = navButton.dataset.navView || '';
    if (!sectionId) return;

    const section = resolveAppSection(sectionId);
    if (!section) return;

    const isPrimaryNav =
      navButton.closest('.orbis-sidebar-nav') || navButton.closest('.orbis-app-nav');
    const isOverflowNav = navButton.closest('#toolbarOverflowMenu');
    const isQuickLink = navButton.closest('#dashboardQuickLinks');

    if (!isPrimaryNav && !isOverflowNav && !isQuickLink) {
      return;
    }

    event.preventDefault();
    switchMainView(sectionId);
  });
}

function bindToolbarOverflowMenu(): void {
  if ((window as { __toolbarOverflowBound?: boolean }).__toolbarOverflowBound) {
    return;
  }

  (window as { __toolbarOverflowBound?: boolean }).__toolbarOverflowBound = true;

  const menuBtn = document.getElementById('toolbarMenuBtn');
  const menu = document.getElementById('toolbarOverflowMenu');

  if (!menuBtn || !menu) return;

  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (event) => {
    if (menu.contains(event.target as Node) || menuBtn.contains(event.target as Node)) {
      return;
    }

    menu.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  });
}

bindNavigationEvents();
bindToolbarOverflowMenu();

window.switchMainView = switchMainView;
window.openCandidatesView = openCandidatesView;
window.openEmployeesView = openEmployeesView;
window.openDashboardView = openDashboardView;
