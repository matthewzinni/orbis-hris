import './styles/app-shell.css';
import './styles/orbis-brand.css';
import './styles/orbis-space-theme.css';
import './styles/orbis-polish.css';
import './styles/styles.css';
import './styles/care-engagement.css';
import './styles/orbis-alerts.css';
import './styles/org-chart.css';
import './styles/attendance.css';
import './styles/hr-inbox.css';
import './styles/payroll-handoff.css';
import './styles/leave-requests.css';
import './styles/employee-portal.css';
import './utils/helpers';
import { supabase } from './services/supabaseClient';
import { isEmployeeUser } from './services/access';
import {
  signIn,
  signOut,
  watchAuthState,
  waitForAuthSession,
  clearAuthRedirectParams,
  readAuthRedirectError,
  initAuthBindings,
} from './modules/auth';
import { devLog } from './utils/devLog';
import {
  markOrbisBootComplete,
  markOrbisMainBoot,
  syncEmployeeStateFromWindow,
} from './bootstrap';
import './core/legacyGlobals';
import './services/employeeNormalizer';
import './services/access';
import './modules/drawerForms';
import './ui/history';
import './ui/drawerLayout';
import './ui/drawerIdentityHeader';
import './ui/drawerUi';
import './ui/drawerTabs';
import './modules/employeeDrawerTabLoads';
import './modules/drawer';
import './modules/notes';
import './ui/appSections';
import './ui/navigation';
import './ui/workspaceAlerts';
import './ui/hrInbox';
import './modules/payrollHandoff';
import './ui/departmentSummary';
import './modules/onboarding';
import './modules/offboarding';
import './modules/leaveRequests';
import './modules/employeePortal';
import './modules/employees';
import './modules/orgChart';
import './modules/attendance';
import './modules/dashboardBoot';
import './ui/executiveInsight';
import './ui/dashboardDisclosure';
import './ui/employeeDrawerRiskSignals';
import './modules/reports';
import './modules/settingsAdmin';
import { initAppShell, showAuthenticatedOrbisView, showAuthView } from './app/appShell';
import { initAppSections, showAppSection } from './ui/appSections';
import { switchMainView } from './ui/navigation';
import './services/auditTrail';
import './modules/employeeAdmin';
import './modules/employeeFlags';
import './ui/badges';
import './ui/employeeForm';

import { initializeDocumentsLibrary } from './modules/documents';
import {
  saveReviewRecord,
  loadEmployeeReviews,
  editReviewRecord,
  deleteReviewRecord,
  cancelReviewEdit,
} from './modules/reviews';
import {
  saveDisciplineRecord,
  loadEmployeeDiscipline,
  editDisciplineRecord,
  deleteDisciplineRecord,
} from './modules/discipline';
import {
  saveIncidentRecord,
  loadEmployeeIncidents,
  editIncidentRecord,
  deleteIncidentRecord,
} from './modules/incidents';
import {
  saveMeetingRecord,
  loadEmployeeMeetings,
  editMeetingRecord,
  deleteMeetingRecord,
  cancelMeetingEdit,
} from './modules/meetings';
import './modules/stayInterviews';
import './modules/stayInterviewOrgInsights';
import './modules/emergencyContacts';
import './modules/employeeDocuments';
import {
  loadCandidates,
  saveCandidateRecord,
  editCandidateRecord,
  deleteCandidateRecord,
  moveCandidateToStage,
  convertCandidateToEmployee,
} from './modules/candidates';
import './modules/candidateNotes';
import {
  applyOperationsCenterAccess,
  cancelOperationsIssueEdit,
  closeOperationsIssueDrawer,
  deleteOperationsIssueById,
  deleteOperationsIssueRecord,
  isOperationsIssueDrawerOpen,
  ensureOperationsIssuesLoaded,
  exportOperationsIssuesCsv,
  loadOperationsIssues,
  openNewOperationsIssueForm,
  openOperationsIssueDrawer,
  openOperationsView,
  saveOperationsIssueRecord,
} from './modules/operationsIssues';
import {
  applyCareEngagementCenterAccess,
  ensureCareEngagementLoaded,
  loadCareEngagement,
  openCareEngagementView,
} from './modules/careEngagement';
import './modules/careEngagementEditor';
import './modules/employeeCareSupport';
import {
  applyInvestigationsCenterAccess,
  cancelInvestigationEdit,
  closeInvestigationDrawer,
  deleteInvestigationById,
  deleteInvestigationRecord,
  ensureInvestigationsLoaded,
  exportInvestigationsCsv,
  isInvestigationDrawerOpen,
  loadInvestigations,
  openInvestigationDrawer,
  openInvestigationsView,
  openNewInvestigationForm,
  saveInvestigationRecord,
} from './modules/investigations';
import './ui/loadingUi';
import './ui/dashboardRetry';
import './ui/confirmModal';
import './modules/dictation';
import './ui/commandPalette';
import './ui/signaturePads';
import './ui/kpis';
import './ui/employeeRoster';

devLog('Orbis main.ts loaded');

markOrbisMainBoot();

const bridge = window as any;

bridge.supabase = supabase;
bridge.supabaseClient = supabase;
bridge.signIn = signIn;
bridge.signOut = signOut;
bridge.showAuthenticatedOrbisView = showAuthenticatedOrbisView;
bridge.showAuthView = showAuthView;
bridge.bootstrapOrbisAfterAuth = async () => {
  await initializeProtectedModules();
  initAppSections();
};

// Always use the section router from appSections (not legacy scroll-into-view navigation).
bridge.showAppSection = showAppSection;
bridge.switchMainView = switchMainView;

function openCandidatesViewFallback(): void {
  if (typeof bridge.switchMainView === 'function') {
    bridge.switchMainView('candidatesView');
    return;
  }

  if (typeof bridge.loadCandidates === 'function') {
    void bridge.loadCandidates();
  }
}

function registerLegacyBridges(): void {
  bridge.signIn = signIn;
  bridge.signOut = signOut;

  // openNewEmployeeForm, createEmployee, runDeleteEmployee wired in employeeAdmin.ts

  bridge.openCandidatesView = bridge.openCandidatesView || openCandidatesViewFallback;

  bridge.saveReviewRecord = saveReviewRecord;
  bridge.saveEmployeeReview = saveReviewRecord;
  bridge.loadEmployeeReviews = loadEmployeeReviews;
  bridge.editReviewRecord = editReviewRecord;
  bridge.deleteReviewRecord = deleteReviewRecord;
  bridge.cancelReviewEdit = cancelReviewEdit;

  bridge.saveDisciplineRecord = saveDisciplineRecord;
  bridge.saveDisciplineReport = saveDisciplineRecord;
  bridge.loadEmployeeDiscipline = loadEmployeeDiscipline;
  bridge.editDisciplineRecord = editDisciplineRecord;
  bridge.deleteDisciplineRecord = deleteDisciplineRecord;

  bridge.saveIncidentRecord = saveIncidentRecord;
  bridge.loadEmployeeIncidents = loadEmployeeIncidents;
  bridge.editIncidentRecord = editIncidentRecord;
  bridge.deleteIncidentRecord = deleteIncidentRecord;

  bridge.saveMeetingRecord = saveMeetingRecord;
  bridge.saveMeeting = saveMeetingRecord;
  bridge.loadEmployeeMeetings = loadEmployeeMeetings;
  bridge.loadMeetingRecords = loadEmployeeMeetings;
  bridge.editMeetingRecord = editMeetingRecord;
  bridge.deleteMeetingRecord = deleteMeetingRecord;
  bridge.cancelMeetingEdit = cancelMeetingEdit;

  bridge.loadCandidates = loadCandidates;
  bridge.refreshCandidatesView = loadCandidates;

  bridge.saveCandidateRecord = saveCandidateRecord;
  bridge.editCandidateRecord = editCandidateRecord;
  bridge.deleteCandidateRecord = deleteCandidateRecord;
  bridge.moveCandidateToStage = moveCandidateToStage;
  bridge.convertCandidateToEmployee = convertCandidateToEmployee;

  bridge.loadOperationsIssues = loadOperationsIssues;
  bridge.ensureOperationsIssuesLoaded = ensureOperationsIssuesLoaded;
  bridge.exportOperationsIssuesCsv = exportOperationsIssuesCsv;
  bridge.openOperationsView = openOperationsView;
  bridge.openNewOperationsIssueForm = openNewOperationsIssueForm;
  bridge.openOperationsIssueDrawer = openOperationsIssueDrawer;
  bridge.closeOperationsIssueDrawer = closeOperationsIssueDrawer;
  bridge.saveOperationsIssueRecord = saveOperationsIssueRecord;
  bridge.deleteOperationsIssueRecord = deleteOperationsIssueRecord;
  bridge.deleteOperationsIssueById = deleteOperationsIssueById;
  bridge.cancelOperationsIssueEdit = cancelOperationsIssueEdit;
  bridge.applyOperationsCenterAccess = applyOperationsCenterAccess;

  bridge.loadInvestigations = loadInvestigations;
  bridge.ensureInvestigationsLoaded = ensureInvestigationsLoaded;
  bridge.exportInvestigationsCsv = exportInvestigationsCsv;
  bridge.openInvestigationsView = openInvestigationsView;
  bridge.openNewInvestigationForm = openNewInvestigationForm;
  bridge.openInvestigationDrawer = openInvestigationDrawer;
  bridge.closeInvestigationDrawer = closeInvestigationDrawer;
  bridge.saveInvestigationRecord = saveInvestigationRecord;
  bridge.deleteInvestigationRecord = deleteInvestigationRecord;
  bridge.deleteInvestigationById = deleteInvestigationById;
  bridge.cancelInvestigationEdit = cancelInvestigationEdit;
  bridge.applyInvestigationsCenterAccess = applyInvestigationsCenterAccess;

  bridge.loadCareEngagement = loadCareEngagement;
  bridge.ensureCareEngagementLoaded = ensureCareEngagementLoaded;
  bridge.openCareEngagementView = openCareEngagementView;
  bridge.applyCareEngagementCenterAccess = applyCareEngagementCenterAccess;

  globalThis.loadOperationsIssues = loadOperationsIssues;
  globalThis.ensureOperationsIssuesLoaded = ensureOperationsIssuesLoaded;
  globalThis.exportOperationsIssuesCsv = exportOperationsIssuesCsv;
  globalThis.openOperationsView = openOperationsView;
  globalThis.openNewOperationsIssueForm = openNewOperationsIssueForm;
  globalThis.openOperationsIssueDrawer = openOperationsIssueDrawer;
  globalThis.closeOperationsIssueDrawer = closeOperationsIssueDrawer;
  globalThis.saveOperationsIssueRecord = saveOperationsIssueRecord;
  globalThis.deleteOperationsIssueRecord = deleteOperationsIssueRecord;
  globalThis.deleteOperationsIssueById = deleteOperationsIssueById;
  globalThis.cancelOperationsIssueEdit = cancelOperationsIssueEdit;
  globalThis.isOperationsIssueDrawerOpen = isOperationsIssueDrawerOpen;
  globalThis.applyOperationsCenterAccess = applyOperationsCenterAccess;

  globalThis.loadInvestigations = loadInvestigations;
  globalThis.ensureInvestigationsLoaded = ensureInvestigationsLoaded;
  globalThis.exportInvestigationsCsv = exportInvestigationsCsv;
  globalThis.openInvestigationsView = openInvestigationsView;
  globalThis.openNewInvestigationForm = openNewInvestigationForm;
  globalThis.openInvestigationDrawer = openInvestigationDrawer;
  globalThis.closeInvestigationDrawer = closeInvestigationDrawer;
  globalThis.saveInvestigationRecord = saveInvestigationRecord;
  globalThis.deleteInvestigationRecord = deleteInvestigationRecord;
  globalThis.deleteInvestigationById = deleteInvestigationById;
  globalThis.cancelInvestigationEdit = cancelInvestigationEdit;
  globalThis.isInvestigationDrawerOpen = isInvestigationDrawerOpen;
  globalThis.applyInvestigationsCenterAccess = applyInvestigationsCenterAccess;

  globalThis.loadCareEngagement = loadCareEngagement;
  globalThis.ensureCareEngagementLoaded = ensureCareEngagementLoaded;
  globalThis.openCareEngagementView = openCareEngagementView;
  globalThis.applyCareEngagementCenterAccess = applyCareEngagementCenterAccess;
}

async function initializeProtectedModules(): Promise<void> {
  try {
    devLog('Initializing Documents Library...');
    await initializeDocumentsLibrary();
    devLog('Documents Library initialized successfully');
  } catch (err) {
    console.error('Documents Library failed to initialize:', err);
  }

  try {
    if (typeof bridge.loadDashboardOverview === 'function') {
      devLog('Loading dashboard overview...');
      await bridge.loadDashboardOverview();
    } else if (typeof bridge.loadAllDashboardData === 'function') {
      devLog('Loading dashboard data...');
      await bridge.loadAllDashboardData();
    } else if (typeof bridge.loadEmployees === 'function') {
      devLog('Loading employees...');
      await bridge.loadEmployees();

      if (typeof bridge.renderEmployeeRoster === 'function') {
        bridge.renderEmployeeRoster();
      }
    } else {
      console.warn('loadEmployees bridge missing; roster may not populate.');
      return;
    }

    syncEmployeeStateFromWindow();

    const employeeCount = Array.isArray(bridge.EMPLOYEES) ? bridge.EMPLOYEES.length : 0;
    devLog('Employees loaded:', employeeCount);

    if (isEmployeeUser()) {
      if (typeof bridge.applyEmployeePortalView === 'function') {
        bridge.applyEmployeePortalView();
      }
      if (typeof bridge.loadMyTimeOffPortal === 'function') {
        await bridge.loadMyTimeOffPortal();
      }
      return;
    }

    applyOperationsCenterAccess();
    applyCareEngagementCenterAccess();
    applyInvestigationsCenterAccess();
    if (typeof bridge.applyAttendanceAccess === 'function') {
      bridge.applyAttendanceAccess();
    }
  } catch (err) {
    console.error('Employee module failed to load employees:', err);
  }
}

registerLegacyBridges();

let authenticatedBootStarted = false;

async function bootAuthenticatedApp(): Promise<void> {
  if (authenticatedBootStarted) return;
  authenticatedBootStarted = true;

  clearAuthRedirectParams();
  showAuthenticatedOrbisView();

  if (typeof window.showDashboardLoadingSkeletons === 'function') {
    window.showDashboardLoadingSkeletons();
  }

  await initializeProtectedModules();
  initAppSections();
  markOrbisBootComplete();

  if (typeof window.hideDashboardLoadingSkeletons === 'function') {
    window.hideDashboardLoadingSkeletons();
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  devLog('Orbis booted via main.ts');

  initAuthBindings();
  initAppShell();
  registerLegacyBridges();

  watchAuthState((event, sessionData) => {
    devLog('Auth event:', event, sessionData);
    if (
      sessionData &&
      (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
      document.getElementById('appView')?.classList.contains('hidden')
    ) {
      void bootAuthenticatedApp();
    }
  });

  const session = await waitForAuthSession();
  devLog('Resolved session:', session);

  if (!session) {
    const redirectError = readAuthRedirectError();
    if (redirectError) {
      const loginError = document.getElementById('loginError');
      if (loginError) {
        loginError.textContent = redirectError;
        loginError.classList.remove('hidden');
      }
      clearAuthRedirectParams();
    }

    devLog('No active session detected. Waiting for sign in...');
    showAuthView();
    return;
  }

  await bootAuthenticatedApp();
});
