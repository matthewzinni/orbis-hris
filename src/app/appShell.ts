// ============================================
// App shell: drawer tabs, current employee bridge
// ============================================

import { initMobileShell } from '../mobile/mobileShell';
import { resetEmployeeDrawerShell } from '../ui/drawerUi';

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

export function getCurrentEmployeeForOrbis(): Record<string, unknown> | null {
  return (window.currentEmployee as Record<string, unknown> | null) || null;
}

export function setCurrentEmployeeForOrbis(employee: Record<string, unknown> | null): void {
  window.currentEmployee = employee || null;
}

export function switchTab(tabName: string): void {
  if (typeof window.activateDrawerTab === 'function') {
    window.activateDrawerTab('employee', tabName, false);
    return;
  }

  const drawer = document.getElementById('employeeDrawer');

  drawer?.querySelectorAll('[data-tab]').forEach((btn) => {
    const el = btn as HTMLElement;
    const isSelected = el.dataset.tab === tabName;
    el.classList.toggle('active', isSelected);
    el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  drawer?.querySelectorAll('.tab-panel').forEach((panel) => {
    const isSelected = panel.id === `tab-${tabName}`;
    panel.classList.toggle('active', isSelected);
    (panel as HTMLElement).hidden = !isSelected;
  });

  if (tabName === 'discipline') {
    sanitizeDisciplineAutofillLeak(true);
    setTimeout(() => sanitizeDisciplineAutofillLeak(true), 100);
    setTimeout(() => sanitizeDisciplineAutofillLeak(true), 300);
  }

  if (tabName === 'onboarding') {
    const employee = getCurrentEmployeeForOrbis();
    const employeeId = String(
      employee?.employee_id || employee?.id || employee?.dbId || ''
    ).trim();
    if (employeeId && typeof window.loadOnboardingTasks === 'function') {
      void window.loadOnboardingTasks(employeeId);
    }
  }
}

export function sanitizeDisciplineAutofillLeak(forceClear = false): void {
  const activeEmployee = getCurrentEmployeeForOrbis();

  const descriptionField = safeGet('disciplineDescription') as HTMLInputElement | null;
  const actionField = safeGet('disciplineAction') as HTMLInputElement | null;

  if (forceClear) {
    if (descriptionField) descriptionField.value = '';
    if (actionField) actionField.value = '';
    return;
  }

  if (!activeEmployee) return;

  const supervisorValue = String(
    activeEmployee.supervisor || activeEmployee.supervisor_name || ''
  )
    .trim()
    .toLowerCase();
  const payTypeValue = String(activeEmployee.pay_type || activeEmployee.payType || '')
    .trim()
    .toLowerCase();

  if (descriptionField) {
    const descriptionValue = String(descriptionField.value || '')
      .trim()
      .toLowerCase();
    if (
      descriptionValue &&
      (descriptionValue === supervisorValue || descriptionValue === payTypeValue)
    ) {
      descriptionField.value = '';
    }
  }

  if (actionField) {
    const actionValue = String(actionField.value || '')
      .trim()
      .toLowerCase();
    if (actionValue && (actionValue === supervisorValue || actionValue === payTypeValue)) {
      actionField.value = '';
    }
  }

  if (typeof window.scrubAllSignatureNameInputs === 'function') {
    window.scrubAllSignatureNameInputs();
  }
}

export function ensureDrawerTabFallbacks(
  employee: Record<string, unknown> | null = getCurrentEmployeeForOrbis()
): void {
  if (!employee) return;

  const fallbacks: Record<string, string> = {
    notesHistory: 'No notes found for this employee.',
    disciplineHistory: 'No discipline records found for this employee.',
    incidentsHistory: 'No incident reports found for this employee.',
    reviewsHistory: 'No reviews found for this employee.',
    meetingsHistory: 'No meetings found for this employee.',
    ecHistory: 'No emergency contacts found for this employee.',
    stayInterviewHistory: 'No stay interviews found for this employee.',
    docHistory: 'No documents found for this employee.',
    historyTimeline: 'No HR history found for this employee.',
    onboardingChecklist: 'No onboarding tasks found for this employee.',
  };

  Object.entries(fallbacks).forEach(([id, message]) => {
    const el = safeGet(id);
    if (el && !String(el.innerHTML || '').trim()) {
      el.innerHTML = `<div class="empty">${esc(message)}</div>`;
    }
  });
}

window.switchTab = switchTab;
window.sanitizeDisciplineAutofillLeak = sanitizeDisciplineAutofillLeak;
window.getCurrentEmployeeForOrbis = getCurrentEmployeeForOrbis;
window.setCurrentEmployeeForOrbis = setCurrentEmployeeForOrbis;
window.ensureDrawerTabFallbacks = ensureDrawerTabFallbacks;

function setRootViewVisibility(view: 'auth' | 'app'): void {
  const authView = document.getElementById('authView');
  const appView = document.getElementById('appView');

  if (authView) {
    authView.classList.toggle('hidden', view !== 'auth');
    authView.style.display = view === 'auth' ? '' : 'none';
  }

  if (appView) {
    appView.classList.toggle('hidden', view !== 'app');
    appView.style.display = view === 'app' ? '' : 'none';
  }

  document.body.classList.toggle('authenticated', view === 'app');
  document.body.classList.toggle('auth-only', view === 'auth');
}

export function showAuthView(): void {
  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.textContent = '';
    loginError.classList.add('hidden');
  }

  setRootViewVisibility('auth');
}

export function showAuthenticatedOrbisView(): void {
  setRootViewVisibility('app');
  if (typeof window.refreshMobileNavigation === 'function') {
    window.refreshMobileNavigation();
  }
}

function bindRosterSortHeaders(): void {
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    const header = th as HTMLElement;
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const nextColumn = header.dataset.sort;
      if (!nextColumn) return;

      if (!window.currentSort) {
        window.currentSort = { column: 'name', direction: 'asc' };
      }

      if (window.currentSort.column === nextColumn) {
        window.currentSort.direction =
          window.currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        window.currentSort.column = nextColumn;
        window.currentSort.direction = 'asc';
      }

      if (typeof window.renderRoster === 'function') {
        window.renderRoster();
      } else if (typeof window.renderEmployeeRoster === 'function') {
        window.renderEmployeeRoster();
      }
    });
  });
}

/** UI wiring that does not require an authenticated session */
export function initAppShell(): void {
  resetEmployeeDrawerShell();

  const currentDateEl = safeGet('currentDate');
  if (currentDateEl) {
    currentDateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  bindRosterSortHeaders();

  const backdrop = safeGet('drawerBackdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (event) => {
      if (event.target !== backdrop) return;
      if (typeof window.closeDrawer === 'function') {
        window.closeDrawer();
      }
    });
  }

  const initCommandPalette = (window as { initCommandPalette?: () => void }).initCommandPalette;
  if (typeof initCommandPalette === 'function') {
    initCommandPalette();
  }

  initMobileShell();
}
