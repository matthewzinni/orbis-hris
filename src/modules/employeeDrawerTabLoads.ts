/**
 * Lazy-load employee drawer tab data when a tab is first activated (avoids N parallel
 * Supabase calls on every drawer open).
 */

let loadedEmployeeId: string | null = null;
const loadedTabs = new Set<string>();

function getDrawerEmployeeId(employeeId?: string): string {
  if (employeeId) return String(employeeId).trim();

  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;

  return String(
    employee?.dbId || employee?.id || employee?.employee_id || window.selectedEmployeeId || ''
  ).trim();
}

export function resetEmployeeDrawerTabLoadState(): void {
  loadedEmployeeId = null;
  loadedTabs.clear();
}

/** Force the next visit to a tab to reload (e.g. after save). */
export function invalidateEmployeeDrawerTab(tabName: string): void {
  loadedTabs.delete(tabName);
}

export function loadEmployeeDrawerTab(tabName: string, employeeId?: string): void {
  const id = getDrawerEmployeeId(employeeId);
  if (!id) return;

  if (loadedEmployeeId !== id) {
    loadedTabs.clear();
    loadedEmployeeId = id;
  }

  if (loadedTabs.has(tabName)) return;
  loadedTabs.add(tabName);

  switch (tabName) {
    case 'profile':
      window.loadEmployeeInternalJobInterests?.(id);
      break;
    case 'notes':
      window.loadEmployeeNotes?.(id);
      break;
    case 'discipline':
      window.loadEmployeeDiscipline?.(id);
      break;
    case 'incidents':
      window.loadEmployeeIncidents?.(id);
      break;
    case 'meetings':
      window.loadEmployeeMeetings?.(id);
      break;
    case 'stay-interviews':
      window.loadStayInterviews?.(id);
      break;
    case 'reviews':
    const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
    if (
      typeof window.canAccessPerformanceReviews === 'function' &&
      !window.canAccessPerformanceReviews(employee)
    ) {
      loadedTabs.delete(tabName);
      return;
    }
    void window.loadEmployeeReviews?.(id);
      break;
    case 'emergency':
      window.loadEmergencyContacts?.(id);
      break;
    case 'onboarding':
      void window.loadOnboardingTasks?.(id);
      break;
    case 'offboarding':
      void window.loadOffboardingTasks?.(id);
      break;
    case 'time-off':
      void window.loadEmployeeLeaveRequests?.(id);
      break;
    case 'documents':
      void window.loadEmployeeDocuments?.(id);
      break;
    case 'history':
      window.loadEmployeeHistory?.(id);
      break;
    case 'care-support':
      void window.loadEmployeeCareSupport?.(id);
      break;
    case 'employee':
      window.loadEmployeeManualAtRisk?.(id);
      window.loadEmployeeManualImpactPlayer?.(id);
      void window.loadEmployeePayrollHandoffs?.(id);
      break;
    default:
      loadedTabs.delete(tabName);
      break;
  }
}

window.resetEmployeeDrawerTabLoadState = resetEmployeeDrawerTabLoadState;
window.invalidateEmployeeDrawerTab = invalidateEmployeeDrawerTab;
window.loadEmployeeDrawerTab = loadEmployeeDrawerTab;
