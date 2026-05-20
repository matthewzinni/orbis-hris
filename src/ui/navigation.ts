

interface NavigationSection {
  id: string;
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
    aliases: ['dashboard'],
  },
  {
    id: 'employeesView',
    aliases: ['employees', 'employeeRoster'],
  },
  {
    id: 'candidatesView',
    aliases: ['candidates', 'candidatePipeline'],
  },
  {
    id: 'documentsView',
    aliases: ['documents'],
  },
];

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function resolveSectionId(sectionId: string): string {
  const normalized = String(sectionId || '').trim().toLowerCase();

  const match = NAVIGATION_SECTIONS.find((section) => {
    if (section.id.toLowerCase() === normalized) {
      return true;
    }

    return (section.aliases || []).some(
      (alias) => alias.toLowerCase() === normalized
    );
  });

  return match?.id || sectionId;
}

function hideAllSections(): void {
  NAVIGATION_SECTIONS.forEach((section) => {
    const el = safeGet(section.id);

    if (!el) {
      return;
    }

    el.style.display = 'none';
    el.classList.remove('active');
  });
}

function activateNavButtons(sectionId: string): void {
  document
    .querySelectorAll('[data-nav-view]')
    .forEach((button) => {
      const target = String(
        (button as HTMLElement).dataset.navView || ''
      );

      if (resolveSectionId(target) === sectionId) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
}

export function switchMainView(sectionId: string): void {
  const resolvedId = resolveSectionId(sectionId);

  hideAllSections();

  const target = safeGet(resolvedId);

  if (!target) {
    console.warn(
      `[Navigation] Section not found: ${resolvedId}`
    );

    return;
  }

  target.style.display = '';
  target.classList.add('active');

  activateNavButtons(resolvedId);

  window.currentMainView = resolvedId;

  requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
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
  if ((window as any).__navigationEventsBound) {
    return;
  }

  (window as any).__navigationEventsBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;

    const navButton = target?.closest(
      '[data-nav-view]'
    ) as HTMLElement | null;

    if (!navButton) {
      return;
    }

    event.preventDefault();

    const sectionId =
      navButton.dataset.navView || '';

    if (!sectionId) {
      return;
    }

    switchMainView(sectionId);
  });
}

bindNavigationEvents();

window.switchMainView = switchMainView;
window.openCandidatesView = openCandidatesView;
window.openEmployeesView = openEmployeesView;
window.openDashboardView = openDashboardView;