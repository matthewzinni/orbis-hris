/**
 * Accessible drawer tab groups (WAI-ARIA tabs pattern).
 */

type DrawerTabKind = 'employee' | 'candidate';

type DrawerTabGroup = {
  kind: DrawerTabKind;
  drawer: HTMLElement;
  tablist: HTMLElement;
  tabs: HTMLButtonElement[];
  panels: HTMLElement[];
};

const drawerTabGroups = new Map<DrawerTabKind, DrawerTabGroup>();

function getTabNameFromButton(button: HTMLButtonElement, kind: DrawerTabKind): string | null {
  if (kind === 'candidate') {
    return button.dataset.candidateTab || null;
  }

  return button.dataset.tab || null;
}

function getPanelId(kind: DrawerTabKind, tabName: string): string {
  return kind === 'candidate' ? `candidate-tab-${tabName}` : `tab-${tabName}`;
}

function getTabButtonId(kind: DrawerTabKind, tabName: string): string {
  return `orbis-${kind}-tab-${tabName}`;
}

function findPanel(drawer: HTMLElement, kind: DrawerTabKind, tabName: string): HTMLElement | null {
  const panelId = getPanelId(kind, tabName);
  return drawer.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`);
}

function shouldResetEntryTabForm(
  tabName: string
): boolean {
  if (tabName === 'incidents' && window.currentIncidentReportId) return false;
  if (tabName === 'discipline' && window.currentDisciplineReportId) return false;
  if (tabName === 'notes' && window.currentNoteId) return false;
  if (tabName === 'meetings' && window.currentMeetingId) return false;
  if (tabName === 'reviews' && window.currentReviewId) return false;
  if (tabName === 'stay-interviews' && window.currentStayInterviewId) return false;
  if (tabName === 'emergency' && window.currentEmergencyContactId) return false;
  return ['incidents', 'discipline', 'notes', 'meetings', 'reviews', 'stay-interviews', 'emergency'].includes(
    tabName
  );
}

function runEmployeeTabSideEffects(tabName: string): void {
  if (shouldResetEntryTabForm(tabName) && typeof window.resetDrawerEntryForms === 'function') {
    window.resetDrawerEntryForms();
  }

  if (typeof window.sanitizeDisciplineAutofillLeak === 'function') {
    if (tabName === 'discipline') {
      window.sanitizeDisciplineAutofillLeak(true);
      setTimeout(() => window.sanitizeDisciplineAutofillLeak?.(true), 100);
      setTimeout(() => window.sanitizeDisciplineAutofillLeak?.(true), 300);
    }
  }

  if (tabName === 'onboarding') {
    const employee =
      typeof window.getCurrentEmployeeForOrbis === 'function'
        ? window.getCurrentEmployeeForOrbis()
        : window.currentEmployee;

    const employeeId = String(
      (employee as { employee_id?: string; id?: string; dbId?: string })?.employee_id
        || (employee as { id?: string })?.id
        || (employee as { dbId?: string })?.dbId
        || ''
    ).trim();

    if (employeeId && typeof window.loadOnboardingTasks === 'function') {
      void window.loadOnboardingTasks(employeeId);
    }
  }

  if (tabName === 'discipline' && typeof window.initDisciplineSignaturePads === 'function') {
    window.initDisciplineSignaturePads();
  }

  if (tabName === 'incidents' && typeof window.initIncidentSignaturePads === 'function') {
    window.initIncidentSignaturePads();
  }

  if (tabName === 'reviews' && typeof window.initReviewSignaturePads === 'function') {
    window.initReviewSignaturePads();
  }

  const isEmployeeAdminTab =
    tabName === 'employee' || tabName === 'admin' || tabName === 'employeeAdmin';

  if (
    isEmployeeAdminTab &&
    !window.isCreatingEmployee &&
    window.currentEmployee &&
    typeof window.forcePopulateEmployeeAdminPanel === 'function'
  ) {
    setTimeout(() => {
      if (window.isCreatingEmployee || !window.currentEmployee) {
        return;
      }

      window.forcePopulateEmployeeAdminPanel?.(window.currentEmployee);
    }, 25);

    setTimeout(() => {
      if (window.isCreatingEmployee || !window.currentEmployee) {
        return;
      }

      window.forcePopulateEmployeeAdminPanel?.(window.currentEmployee);
    }, 150);
  }
}

function enhanceTabGroup(kind: DrawerTabKind): DrawerTabGroup | null {
  const drawerId = kind === 'candidate' ? 'candidateDrawer' : 'employeeDrawer';
  const drawer = document.getElementById(drawerId);

  if (!drawer) return null;

  const tablist = drawer.querySelector<HTMLElement>('.tabs.drawer-tablist, .tabs');

  if (!tablist) return null;

  const tabSelector = kind === 'candidate' ? '[data-candidate-tab]' : '[data-tab]';
  const tabs = Array.from(drawer.querySelectorAll<HTMLButtonElement>(tabSelector));
  const panels = Array.from(drawer.querySelectorAll<HTMLElement>('.tab-panel'));

  if (!tabs.length || !panels.length) return null;

  const label =
    kind === 'candidate' ? 'Candidate record sections' : 'Employee record sections';

  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', label);
  tablist.classList.add('drawer-tablist');

  tabs.forEach((tab) => {
    const tabName = getTabNameFromButton(tab, kind);
    if (!tabName) return;

    const panel = findPanel(drawer, kind, tabName);
    const tabId = getTabButtonId(kind, tabName);
    const panelId = getPanelId(kind, tabName);

    tab.id = tabId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('type', 'button');
    tab.setAttribute('aria-controls', panelId);

    if (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.id = panelId;
    }

    tab.removeAttribute('onclick');
  });

  const group: DrawerTabGroup = { kind, drawer, tablist, tabs, panels };
  drawerTabGroups.set(kind, group);

  return group;
}

export function activateDrawerTab(kind: DrawerTabKind, tabName: string, focusTab = true): boolean {
  if (
    kind === 'employee' &&
    tabName === 'reviews' &&
    typeof window.canAccessPerformanceReviews === 'function' &&
    !window.canAccessPerformanceReviews()
  ) {
    tabName = 'profile';
  }

  let group = drawerTabGroups.get(kind);

  if (!group) {
    group = enhanceTabGroup(kind) || undefined;
  }

  if (!group) return false;

  let matched = false;

  group.tabs.forEach((tab) => {
    const name = getTabNameFromButton(tab, kind);
    const isSelected = name === tabName;

    if (isSelected) matched = true;

    tab.classList.toggle('active', isSelected);
    tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    tab.tabIndex = isSelected ? 0 : -1;
  });

  group.panels.forEach((panel) => {
    const panelTabName = panel.id.startsWith('candidate-tab-')
      ? panel.id.slice('candidate-tab-'.length)
      : panel.id.startsWith('tab-')
        ? panel.id.slice('tab-'.length)
        : '';

    const isSelected = panelTabName === tabName;

    panel.classList.toggle('active', isSelected);
    panel.hidden = !isSelected;
    panel.setAttribute('aria-hidden', isSelected ? 'false' : 'true');
  });

  if (focusTab) {
    const activeTab = group.tabs.find((tab) => getTabNameFromButton(tab, kind) === tabName);
    activeTab?.focus();
  }

  if (kind === 'employee') {
    runEmployeeTabSideEffects(tabName);
  }

  if (kind === 'candidate') {
    runCandidateTabSideEffects(tabName);
  }

  return matched;
}

function runCandidateTabSideEffects(tabName: string): void {
  if (tabName !== 'notes') {
    return;
  }

  const noteDate = document.getElementById('candidateNoteDate') as HTMLInputElement | null;

  if (noteDate && !noteDate.value && typeof window.todayInputValue === 'function') {
    noteDate.value = window.todayInputValue();
  }

  if (typeof window.loadCandidateNotes === 'function') {
    void window.loadCandidateNotes();
    return;
  }

  const target =
    document.getElementById('candidateNotesHistory') ||
    document.getElementById('candidateNotesPreview');

  if (target) {
    target.innerHTML =
      '<div class="empty">Save the candidate record before adding dated notes.</div>';
  }
}

function getVisibleTabs(group: DrawerTabGroup): HTMLButtonElement[] {
  return group.tabs.filter((tab) => !tab.classList.contains('hidden'));
}

function getSelectedTabIndex(group: DrawerTabGroup): number {
  const visibleTabs = getVisibleTabs(group);

  return visibleTabs.findIndex(
    (tab) => tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('active')
  );
}

function focusTabAt(group: DrawerTabGroup, index: number): void {
  const visibleTabs = getVisibleTabs(group);
  const tab = visibleTabs[index];
  const tabName = tab ? getTabNameFromButton(tab, group.kind) : null;

  if (tabName) {
    activateDrawerTab(group.kind, tabName, true);
  }
}

function handleTablistKeydown(event: KeyboardEvent, group: DrawerTabGroup): void {
  const { key } = event;
  const visibleTabs = getVisibleTabs(group);
  const currentIndex = getSelectedTabIndex(group);

  if (currentIndex < 0 || !visibleTabs.length) return;

  let nextIndex = currentIndex;

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % visibleTabs.length;
    event.preventDefault();
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    event.preventDefault();
  } else if (key === 'Home') {
    nextIndex = 0;
    event.preventDefault();
  } else if (key === 'End') {
    nextIndex = visibleTabs.length - 1;
    event.preventDefault();
  } else {
    return;
  }

  focusTabAt(group, nextIndex);
}

function bindTabGroupEvents(group: DrawerTabGroup): void {
  group.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('hidden')) return;

      const tabName = getTabNameFromButton(tab, group.kind);
      if (tabName) activateDrawerTab(group.kind, tabName, false);
    });
  });

  group.tablist.addEventListener('keydown', (event) => {
    handleTablistKeydown(event as KeyboardEvent, group);
  });
}

export function initAccessibleDrawerTabs(): void {
  (['employee', 'candidate'] as DrawerTabKind[]).forEach((kind) => {
    const group = enhanceTabGroup(kind);
    if (!group) return;

    bindTabGroupEvents(group);

    const initialTab =
      getTabNameFromButton(
        group.tabs.find((tab) => tab.classList.contains('active')) || group.tabs[0],
        kind
      ) || (kind === 'candidate' ? 'profile' : 'profile');

    activateDrawerTab(kind, initialTab, false);
  });
}

declare global {
  interface Window {
    initAccessibleDrawerTabs?: () => void;
    activateDrawerTab?: (kind: DrawerTabKind, tabName: string, focusTab?: boolean) => void;
  }
}

window.initAccessibleDrawerTabs = initAccessibleDrawerTabs;
window.activateDrawerTab = activateDrawerTab;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAccessibleDrawerTabs);
} else {
  initAccessibleDrawerTabs();
}
