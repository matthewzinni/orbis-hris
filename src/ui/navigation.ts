interface NavigationSection {
  id: string;
  targetId: string;
  aliases?: string[];
}

declare global {
  interface Window {
    openCandidatesView?: () => void;
    openEmployeesView?: () => void;
    openDashboardView?: () => void;
    switchMainView?: (sectionId: string) => void;
    currentMainView?: string;
  }
}

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: 'dashboardView',
    targetId: 'dashboardTop',
    aliases: ['dashboard'],
  },
  {
    id: 'employeesView',
    targetId: 'employeeRosterCard',
    aliases: ['employees', 'employeeRoster'],
  },
  {
    id: 'candidatesView',
    targetId: 'candidatesCard',
    aliases: ['candidates', 'candidatePipeline'],
  },
  {
    id: 'documentsView',
    targetId: 'documentsPage',
    aliases: ['documents'],
  },
];

function resolveSection(sectionId: string): NavigationSection | null {
  const normalized = String(sectionId || '').trim().toLowerCase();

  return (
    NAVIGATION_SECTIONS.find((section) => {
      if (section.id.toLowerCase() === normalized) {
        return true;
      }

      return (section.aliases || []).some((alias) => alias.toLowerCase() === normalized);
    }) || null
  );
}

function activateNavButtons(sectionId: string): void {
  document.querySelectorAll('[data-nav-view]').forEach((button) => {
    const target = String((button as HTMLElement).dataset.navView || '');
    const match = resolveSection(target);

    if (match?.id === sectionId) {
      button.classList.add('active');
      button.setAttribute('aria-current', 'page');
    } else {
      button.classList.remove('active');
      button.removeAttribute('aria-current');
    }
  });
}

export function switchMainView(sectionId: string): void {
  const section = resolveSection(sectionId);

  if (!section) {
    console.warn(`[Navigation] Unknown section: ${sectionId}`);
    return;
  }

  const target = document.getElementById(section.targetId);

  if (!target) {
    console.warn(`[Navigation] Target not found: ${section.targetId}`);
    return;
  }

  window.currentMainView = section.id;
  activateNavButtons(section.id);

  if (section.id === 'candidatesView' && typeof window.loadCandidates === 'function') {
    void window.loadCandidates();
  }

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
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

    event.preventDefault();

    const sectionId = navButton.dataset.navView || '';
    if (!sectionId) return;

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
