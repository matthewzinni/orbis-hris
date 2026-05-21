import './styles/app-shell.css';
import './styles/styles.css';
import './utils/helpers';
import { supabase } from './services/supabaseClient';
import {
  signIn,
  signOut,
  watchAuthState,
  getCurrentSession,
} from './modules/auth';
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
import './modules/drawer';
import './modules/notes';
import './ui/navigation';
import './ui/departmentSummary';
import './modules/onboarding';
import './modules/employees';
import './modules/dashboardBoot';
import { initAppShell, showAuthenticatedOrbisView, showAuthView } from './app/appShell';
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
import './ui/loadingUi';
import './ui/dashboardRetry';
import './ui/confirmModal';
import './ui/commandPalette';
import './ui/kpis';
import './ui/employeeRoster';

console.log('Orbis main.ts loaded');

markOrbisMainBoot();

const bridge = window as any;

bridge.supabase = supabase;
bridge.supabaseClient = supabase;
bridge.signIn = signIn;
bridge.signOut = signOut;
bridge.showAuthenticatedOrbisView = showAuthenticatedOrbisView;
bridge.showAuthView = showAuthView;
bridge.bootstrapOrbisAfterAuth = initializeProtectedModules;

function openCandidatesViewFallback(): void {
  const candidatesCard = document.getElementById('candidatesCard');
  const candidatePipeline = document.getElementById('candidatePipeline');
  const candidatesSection = candidatesCard || candidatePipeline;

  if (candidatesSection) {
    candidatesSection.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  if (typeof bridge.loadCandidates === 'function') {
    bridge.loadCandidates();
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

  bridge.loadCandidates = loadCandidates;
  bridge.refreshCandidatesView = loadCandidates;

  bridge.saveCandidateRecord = saveCandidateRecord;
  bridge.editCandidateRecord = editCandidateRecord;
  bridge.deleteCandidateRecord = deleteCandidateRecord;
  bridge.moveCandidateToStage = moveCandidateToStage;
  bridge.convertCandidateToEmployee = convertCandidateToEmployee;
}

async function initializeProtectedModules(): Promise<void> {
  try {
    console.log('Initializing Documents Library...');
    await initializeDocumentsLibrary();
    console.log('Documents Library initialized successfully');
  } catch (err) {
    console.error('Documents Library failed to initialize:', err);
  }

  try {
    if (typeof bridge.loadAllDashboardData === 'function') {
      console.log('Loading dashboard data...');
      await bridge.loadAllDashboardData();
    } else if (typeof bridge.loadEmployees === 'function') {
      console.log('Loading employees...');
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
    console.log('Employees loaded:', employeeCount);
  } catch (err) {
    console.error('Employee module failed to load employees:', err);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Orbis booted via main.ts');

  initAppShell();
  registerLegacyBridges();

  const session = await getCurrentSession();
  console.log('Current session:', session);

  watchAuthState((event, sessionData) => {
    console.log('Auth event:', event, sessionData);
  });

  if (!session) {
    console.log('No active session detected. Waiting for sign in...');
    showAuthView();
    return;
  }

  showAuthenticatedOrbisView();

  if (typeof window.showDashboardLoadingSkeletons === 'function') {
    window.showDashboardLoadingSkeletons();
  }

  await initializeProtectedModules();
  markOrbisBootComplete();

  if (typeof window.hideDashboardLoadingSkeletons === 'function') {
    window.hideDashboardLoadingSkeletons();
  }
});
