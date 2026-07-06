/**
 * Lazy-load employee drawer tab data when a tab is first activated (avoids N parallel
 * Supabase calls on every drawer open).
 */

let loadedEmployeeId: string | null = null;
let drawerLoadGeneration = 0;
const loadedTabs = new Set<string>();
const loadingTabs = new Set<string>();

function getDrawerEmployeeId(employeeId?: string): string {
  if (employeeId) return String(employeeId).trim();

  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;

  return String(
    employee?.dbId || employee?.id || employee?.employee_id || window.selectedEmployeeId || ''
  ).trim();
}

function runDrawerTabLoad(
  tabName: string,
  employeeId: string,
  generation: number,
  loader: () => void | Promise<void>
): void {
  loadingTabs.add(tabName);

  void Promise.resolve()
    .then(() => loader())
    .then(() => {
      if (generation !== drawerLoadGeneration || loadedEmployeeId !== employeeId) return;
      loadedTabs.add(tabName);
    })
    .catch((err) => {
      console.error(`[DrawerTab] ${tabName} load failed:`, err);
    })
    .finally(() => {
      loadingTabs.delete(tabName);
    });
}

export function resetEmployeeDrawerTabLoadState(): void {
  loadedEmployeeId = null;
  loadedTabs.clear();
  loadingTabs.clear();
  drawerLoadGeneration += 1;
}

/** Force the next visit to a tab to reload (e.g. after save). */
export function invalidateEmployeeDrawerTab(tabName: string): void {
  loadedTabs.delete(tabName);
  loadingTabs.delete(tabName);
}

export function loadEmployeeDrawerTab(tabName: string, employeeId?: string): void {
  const id = getDrawerEmployeeId(employeeId);
  if (!id) return;

  if (loadedEmployeeId !== id) {
    loadedTabs.clear();
    loadingTabs.clear();
    drawerLoadGeneration += 1;
    loadedEmployeeId = id;
  }

  if (loadedTabs.has(tabName) || loadingTabs.has(tabName)) return;

  const generation = drawerLoadGeneration;

  switch (tabName) {
    case 'profile':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeInternalJobInterests?.(id));
      break;
    case 'notes':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeNotes?.(id));
      break;
    case 'discipline':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeDiscipline?.(id));
      break;
    case 'incidents':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeIncidents?.(id));
      break;
    case 'meetings':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeMeetings?.(id));
      break;
    case 'stay-interviews':
      runDrawerTabLoad(tabName, id, generation, () => window.loadStayInterviews?.(id));
      break;
    case 'reviews': {
      const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
      if (
        typeof window.canAccessPerformanceReviews === 'function' &&
        !window.canAccessPerformanceReviews(employee)
      ) {
        return;
      }
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeReviews?.(id));
      break;
    }
    case 'emergency':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmergencyContacts?.(id));
      break;
    case 'onboarding':
      runDrawerTabLoad(tabName, id, generation, () => window.loadOnboardingTasks?.(id));
      break;
    case 'offboarding':
      runDrawerTabLoad(tabName, id, generation, () => window.loadOffboardingTasks?.(id));
      break;
    case 'time-off':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeLeaveRequests?.(id));
      break;
    case 'documents':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeDocuments?.(id));
      break;
    case 'history':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeHistory?.(id));
      break;
    case 'care-support':
      runDrawerTabLoad(tabName, id, generation, () => window.loadEmployeeCareSupport?.(id));
      break;
    case 'employee':
      runDrawerTabLoad(tabName, id, generation, () => {
        window.loadEmployeeManualAtRisk?.(id);
        window.loadEmployeeManualImpactPlayer?.(id);
        return window.loadEmployeePayrollHandoffs?.(id);
      });
      break;
    default:
      break;
  }
}

window.resetEmployeeDrawerTabLoadState = resetEmployeeDrawerTabLoadState;
window.invalidateEmployeeDrawerTab = invalidateEmployeeDrawerTab;
window.loadEmployeeDrawerTab = loadEmployeeDrawerTab;
