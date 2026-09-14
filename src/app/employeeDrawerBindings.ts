import {
  configureEmployeeDrawerTabLoads, invalidateEmployeeDrawerTab,
  loadEmployeeDrawerTab, resetEmployeeDrawerTabLoadState,
} from '../modules/employeeDrawerTabLoads';
import { canAccessPerformanceReviews } from '../services/access';
import { loadEmployeeInternalJobInterests } from '../modules/lazyInternalJobBoard';
import { loadEmployeeNotes } from '../modules/notes';
import { loadEmployeeDiscipline } from '../modules/discipline';
import { loadEmployeeIncidents } from '../modules/incidents';
import { loadEmployeeMeetings } from '../modules/meetings';
import { loadStayInterviews } from '../modules/stayInterviews';
import { loadEmployeeReviews } from '../modules/reviews';
import { loadEmergencyContacts } from '../modules/emergencyContacts';
import { loadOnboardingTasks } from '../modules/onboarding';
import { loadOffboardingTasks } from '../modules/offboarding';
import { loadEmployeeLeaveRequests } from '../modules/leaveRequests';
import { loadEmployeeDocuments } from '../modules/employeeDocuments';
import { loadEmployeeHistory } from '../ui/history';
import { initAccessibleDrawerTabs } from '../ui/drawerTabs';
import { loadEmployeeCareSupport } from '../modules/employeeCareSupport';
import { loadEmployeeManualAtRisk, loadEmployeeManualImpactPlayer } from '../modules/employeeFlags';
import { loadEmployeePayrollHandoffs } from '../modules/payrollHandoff';

// Selected employee state remains legacy-owned until the state migration.
function getEmployeeId(): string {
  const employee = window.currentEmployee;
  return String(employee?.dbId || employee?.id || employee?.employee_id || window.selectedEmployeeId || '').trim();
}

export function initializeEmployeeDrawerBindings(): void {
  configureEmployeeDrawerTabLoads({
    getEmployeeId,
    canLoad: (tab) => tab !== 'reviews' || canAccessPerformanceReviews(window.currentEmployee),
    onError: (error, tab) => console.error(`[DrawerTab] ${tab} load failed:`, error),
    loaders: {
      profile: loadEmployeeInternalJobInterests,
      notes: loadEmployeeNotes,
      discipline: loadEmployeeDiscipline,
      incidents: loadEmployeeIncidents,
      meetings: loadEmployeeMeetings,
      'stay-interviews': loadStayInterviews,
      reviews: loadEmployeeReviews,
      emergency: loadEmergencyContacts,
      onboarding: loadOnboardingTasks,
      offboarding: loadOffboardingTasks,
      'time-off': loadEmployeeLeaveRequests,
      documents: loadEmployeeDocuments,
      history: loadEmployeeHistory,
      'care-support': loadEmployeeCareSupport,
      employee: async (id, context) => {
        await Promise.all([
          loadEmployeeManualAtRisk(id, context),
          loadEmployeeManualImpactPlayer(id, context),
          loadEmployeePayrollHandoffs(id, context),
        ]);
      },
    },
  });

  // Compatibility for inline controls and callers not yet migrated.
  window.resetEmployeeDrawerTabLoadState = resetEmployeeDrawerTabLoadState;
  window.invalidateEmployeeDrawerTab = invalidateEmployeeDrawerTab;
  window.loadEmployeeDrawerTab = loadEmployeeDrawerTab;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccessibleDrawerTabs, { once: true });
  } else {
    initAccessibleDrawerTabs();
  }
}
