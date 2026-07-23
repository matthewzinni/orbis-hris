import { initMobileLayout } from './mobile/mobileLayout';
initMobileLayout();
import './styles/responsive-tokens.css';
import './styles/responsive-forms.css';
import './styles/responsive-components.css';
import './styles/app-shell.css';
import './styles/orbis-mobile.css';
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
import './styles/internal-job-board.css';
import './styles/manager-home.css';
import './styles/onboarding.css';
import './styles/policy-campaigns.css';
import './styles/janus.css';
import './styles/dashboard-charts.css';
import './styles/er-signing-modal.css';
import './styles/er-acknowledgment-print.css';
import './styles/discipline-report-print.css';
import './styles/demo-banner.css';
import './ui/dashboardCharts';
import './utils/helpers';
import './ui/demoBanner';
import { supabase } from './services/supabaseClient';
import { getUserRole, isEmployeeUser, canAccessOrbisApp } from './services/access';
import {
  signIn,
  signOut,
  watchAuthState,
  waitForAuthSession,
  isRegisteringAccount,
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
import './modules/drawerForms';
import './ui/history';
import './ui/drawerLayout';
import './ui/drawerIdentityHeader';
import './ui/drawerUi';
import './ui/drawerTabs';
import './modules/employeeDrawerTabLoads';
import './modules/drawer';
import './modules/notes';
import './ui/workspaceAlerts';
import './ui/hrInbox';
import './services/attention/attentionSummary';
import './modules/payrollHandoff';
import './ui/departmentSummary';
import './modules/onboarding';
import './modules/offboarding';
import './modules/leaveRequests';
import './modules/employeePortal';
import './modules/myProfilePortal';
import './modules/myTasksPortal';
import './modules/performanceReviewSupervisorNotify';
import './modules/performanceReviewCompletedLedger';
import { bootErSigningFromUrl } from './modules/erSigningModal';
import './modules/myDirectoryPortal';
import './modules/employees';
import './modules/orgChart';
import './modules/attendance';
import './modules/lazyJanus';
import './modules/dashboardBoot';
import './modules/dashboard';
import './modules/managerHome';
import './modules/internalJobBoard';
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
  initializePolicyCampaignsAdmin,
  loadPolicyCampaignsAdmin,
} from './modules/policyCampaigns';
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
import './modules/employeeCareSupport';
import {
  applyCareEngagementCenterAccess,
} from './modules/lazyCareEngagement';
import {
  applyInvestigationsCenterAccess,
} from './modules/lazyInvestigations';
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
  const bootOk = await initializeProtectedModules();
  if (!bootOk) return;
  initAppSections();
  if (typeof window.refreshMobileTasksBadge === 'function') {
    void window.refreshMobileTasksBadge();
  }
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
}

async function initializeProtectedModules(): Promise<boolean> {
  let role: string | null = null;
  try {
    role = await getUserRole();
  } catch (roleErr) {
    console.warn('Could not resolve user role before boot:', roleErr);
  }

  if (role === 'pending') {
    const loginError = document.getElementById('loginError');
    const message =
      'Your account is waiting for admin approval. You can sign in after HR approves your access.';
    if (loginError) {
      loginError.textContent = message;
      loginError.classList.remove('hidden');
    }
    await supabase.auth.signOut();
    showAuthView();
    return false;
  }

  if (role === 'rejected') {
    const loginError = document.getElementById('loginError');
    const message = 'Orbis access is not available for this account. Contact HR if you need assistance.';
    if (loginError) {
      loginError.textContent = message;
      loginError.classList.remove('hidden');
    }
    await supabase.auth.signOut();
    showAuthView();
    return false;
  }

  if (!role || !canAccessOrbisApp()) {
    const loginError = document.getElementById('loginError');
    const message =
      'No approved Orbis access for this account. Use Create account or contact HR.';
    if (loginError) {
      loginError.textContent = message;
      loginError.classList.remove('hidden');
    }
    await supabase.auth.signOut();
    showAuthView();
    return false;
  }

  if (typeof window.applyRolePermissions === 'function') {
    window.applyRolePermissions();
  }

  try {
    devLog('Initializing Documents Library...');
    await initializeDocumentsLibrary();
    initializePolicyCampaignsAdmin();
    void loadPolicyCampaignsAdmin();
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
      return false;
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
      return true;
    }

    applyOperationsCenterAccess();
    applyCareEngagementCenterAccess();
    applyInvestigationsCenterAccess();
    if (typeof bridge.applyJanusAccess === 'function') {
      bridge.applyJanusAccess();
    }
    if (typeof bridge.applyAttendanceAccess === 'function') {
      bridge.applyAttendanceAccess();
    }
  } catch (err) {
    console.error('Employee module failed to load employees:', err);
  }

  return true;
}

registerLegacyBridges();

let authenticatedBootStarted = false;

async function bootAuthenticatedApp(): Promise<void> {
  if (authenticatedBootStarted) return;
  authenticatedBootStarted = true;

  showAuthenticatedOrbisView();

  if (typeof window.showDashboardLoadingSkeletons === 'function') {
    window.showDashboardLoadingSkeletons();
  }

  const bootOk = await initializeProtectedModules();
  if (!bootOk) {
    authenticatedBootStarted = false;
    if (typeof window.hideDashboardLoadingSkeletons === 'function') {
      window.hideDashboardLoadingSkeletons();
    }
    return;
  }

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
  bootErSigningFromUrl();

  watchAuthState((event, sessionData) => {
    devLog('Auth event:', event, sessionData);
    if (isRegisteringAccount()) {
      return;
    }
    if (
      typeof window.isSignInFlowActive === 'function' &&
      window.isSignInFlowActive() &&
      event === 'SIGNED_IN'
    ) {
      return;
    }
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
    devLog('No active session detected. Waiting for sign in...');
    showAuthView();
    return;
  }

  await bootAuthenticatedApp();
});
