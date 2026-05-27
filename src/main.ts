import './styles/app-shell.css';
import './styles/styles.css';
import './styles/care-engagement.css';
import './utils/helpers';
import { supabase } from './services/supabaseClient';
import {
  signIn,
  signOut,
  watchAuthState,
  getCurrentSession,
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
import './ui/departmentSummary';
import './modules/onboarding';
import './modules/employees';
import './modules/dashboardBoot';
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

    applyOperationsCenterAccess();
    applyCareEngagementCenterAccess();
    applyInvestigationsCenterAccess();
  } catch (err) {
    console.error('Employee module failed to load employees:', err);
  }
}

registerLegacyBridges();

window.addEventListener('DOMContentLoaded', async () => {
  devLog('Orbis booted via main.ts');

  initAuthBindings();
  initAppShell();
  registerLegacyBridges();

  const session = await getCurrentSession();
  devLog('Current session:', session);

  watchAuthState((event, sessionData) => {
    devLog('Auth event:', event, sessionData);
  });

  if (!session) {
    devLog('No active session detected. Waiting for sign in...');
    showAuthView();
    return;
  }

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
});
