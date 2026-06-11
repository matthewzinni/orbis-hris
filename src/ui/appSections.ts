import {
  isAdminUser,
  isEmployeeUser,
  isSupervisorUser,
  canAccessAppSection,
  applySupervisorDashboardView,
} from '../services/access';

export interface AppSection {
  id: string;
  rootId: string;
  targetId: string;
  aliases?: string[];
  onEnter?: () => void;
}

declare global {
  interface Window {
    currentMainView?: string;
    showAppSection?: (sectionId: string) => void;
    ensureInvestigationsLoaded?: (force?: boolean) => void;
    loadInvestigations?: () => Promise<void>;
    ensureCareEngagementLoaded?: (force?: boolean) => void;
    loadCareEngagement?: () => Promise<void>;
    loadAttendance?: (force?: boolean) => Promise<void>;
    loadHrInbox?: (force?: boolean) => Promise<void>;
    loadOrgChart?: () => Promise<void>;
    renderOrgChart?: () => void;
    loadMyProfilePortal?: () => Promise<void>;
    loadMyTasksPortal?: () => Promise<void>;
    loadMyHandbookPortal?: () => Promise<void>;
    loadMyDirectoryPortal?: () => Promise<void>;
    loadMyTimeOffPortal?: () => Promise<void>;
    loadMobileActivityFeed?: (force?: boolean) => Promise<void>;
  }
}

async function ensureCandidatesSectionReady(): Promise<void> {
  const employees = (window as { EMPLOYEES?: unknown[] }).EMPLOYEES;

  if ((!Array.isArray(employees) || !employees.length) && typeof window.loadEmployees === 'function') {
    try {
      await window.loadEmployees();
    } catch (err) {
      console.error('[AppSections] Employee preload for candidates failed:', err);
    }
  }

  if (typeof window.loadCandidates === 'function') {
    await window.loadCandidates();
  }
}

async function ensureEmployeesSectionReady(): Promise<void> {
  const employees = (window as { EMPLOYEES?: unknown[] }).EMPLOYEES;

  if ((!Array.isArray(employees) || !employees.length) && typeof window.loadEmployees === 'function') {
    try {
      await window.loadEmployees();
    } catch (err) {
      console.error('[AppSections] Employee load failed:', err);
    }
  }

  if (typeof window.renderEmployeeRoster === 'function') {
    window.renderEmployeeRoster();
  }
}

const SECTION_LABELS: Record<string, string> = {
  dashboardView: 'Dashboard',
  employeesView: 'Employees',
  orgChartView: 'Org Chart',
  candidatesView: 'Candidates',
  documentsView: 'Documents',
  operationsView: 'Operations',
  careEngagementView: 'Care & Engagement',
  attendanceView: 'Attendance',
  myProfileView: 'My Profile',
  myTasksView: 'Tasks & Acknowledgments',
  myDirectoryView: 'Directory',
  myTimeOffView: 'My Time Off',
  activityView: 'Activity',
  investigationsView: 'Investigations',
  reportsView: 'Reports',
  settingsView: 'Admin & Settings',
};

const APP_SECTIONS: AppSection[] = [
  {
    id: 'dashboardView',
    rootId: 'orbisSectionDashboard',
    targetId: 'dashboardTop',
    aliases: ['dashboard'],
    onEnter: () => {
      if (typeof window.loadHrInbox === 'function') {
        void window.loadHrInbox();
      }
      if (typeof window.loadManagerHome === 'function') {
        void window.loadManagerHome();
      }
      if (typeof window.updateWorkspaceAlerts === 'function') {
        window.updateWorkspaceAlerts();
      }
    },
  },
  {
    id: 'employeesView',
    rootId: 'orbisSectionEmployees',
    targetId: 'employeeRosterCard',
    aliases: ['employees', 'employeeRoster'],
    onEnter: () => {
      void ensureEmployeesSectionReady();
    },
  },
  {
    id: 'orgChartView',
    rootId: 'orbisSectionOrgChart',
    targetId: 'orgChartPage',
    aliases: ['org chart', 'orgchart', 'organization chart', 'hierarchy'],
    onEnter: () => {
      if (typeof window.loadOrgChart === 'function') {
        void window.loadOrgChart();
      } else if (typeof window.renderOrgChart === 'function') {
        window.renderOrgChart();
      }
    },
  },
  {
    id: 'candidatesView',
    rootId: 'orbisSectionCandidates',
    targetId: 'candidatesCard',
    aliases: ['candidates', 'candidatePipeline'],
    onEnter: () => {
      void ensureCandidatesSectionReady();
    },
  },
  {
    id: 'documentsView',
    rootId: 'orbisSectionDocuments',
    targetId: 'documentsPage',
    aliases: ['documents'],
    onEnter: () => {
      if (typeof window.loadDocuments === 'function') {
        void window.loadDocuments();
      }
      if (typeof window.loadPolicyCampaignsAdmin === 'function') {
        void window.loadPolicyCampaignsAdmin();
      }
    },
  },
  {
    id: 'operationsView',
    rootId: 'orbisSectionOperations',
    targetId: 'operationsCenterTop',
    aliases: ['operations', 'operationsCenter', 'ops'],
    onEnter: () => {
      if (typeof window.ensureOperationsIssuesLoaded === 'function') {
        window.ensureOperationsIssuesLoaded(true);
      } else if (typeof window.loadOperationsIssues === 'function') {
        void window.loadOperationsIssues();
      }
    },
  },
  {
    id: 'attendanceView',
    rootId: 'orbisSectionAttendance',
    targetId: 'attendancePage',
    aliases: ['attendance', 'workforce attendance'],
    onEnter: () => {
      if (typeof window.loadAttendance === 'function') {
        void window.loadAttendance();
      }
    },
  },
  {
    id: 'myProfileView',
    rootId: 'orbisSectionMyProfile',
    targetId: 'myProfilePage',
    aliases: ['my-profile', 'profile'],
    onEnter: () => {
      if (typeof window.loadMyProfilePortal === 'function') {
        void window.loadMyProfilePortal();
      }
    },
  },
  {
    id: 'myTasksView',
    rootId: 'orbisSectionMyTasks',
    targetId: 'myTasksPage',
    aliases: ['tasks', 'acknowledgments', 'handbook', 'my-handbook', 'policies'],
    onEnter: () => {
      if (typeof window.loadMyTasksPortal === 'function') {
        void window.loadMyTasksPortal();
      }
    },
  },
  {
    id: 'myDirectoryView',
    rootId: 'orbisSectionMyDirectory',
    targetId: 'myDirectoryPage',
    aliases: ['directory', 'org-chart', 'orgchart', 'company-directory'],
    onEnter: () => {
      if (typeof window.loadMyDirectoryPortal === 'function') {
        void window.loadMyDirectoryPortal();
      }
    },
  },
  {
    id: 'myTimeOffView',
    rootId: 'orbisSectionMyTimeOff',
    targetId: 'myTimeOffPage',
    aliases: ['my-time-off', 'timeoff', 'pto'],
    onEnter: () => {
      if (typeof window.loadMyTimeOffPortal === 'function') {
        void window.loadMyTimeOffPortal();
      }
    },
  },
  {
    id: 'activityView',
    rootId: 'orbisSectionActivity',
    targetId: 'activityPage',
    aliases: ['activity', 'team-activity', 'hr-activity'],
    onEnter: () => {
      if (typeof window.loadMobileActivityFeed === 'function') {
        void window.loadMobileActivityFeed();
      }
    },
  },
  {
    id: 'careEngagementView',
    rootId: 'orbisSectionCareEngagement',
    targetId: 'careEngagementCenterTop',
    aliases: ['care', 'care engagement', 'engagement', 'culture', 'support'],
    onEnter: () => {
      if (typeof window.ensureCareEngagementLoaded === 'function') {
        window.ensureCareEngagementLoaded(true);
      } else if (typeof window.loadCareEngagement === 'function') {
        void window.loadCareEngagement();
      }

      if (typeof window.updateWorkspaceAlerts === 'function') {
        window.updateWorkspaceAlerts();
      }
    },
  },
  {
    id: 'investigationsView',
    rootId: 'orbisSectionInvestigations',
    targetId: 'investigationsCenterTop',
    aliases: ['investigations', 'investigationCenter', 'hr investigations'],
    onEnter: () => {
      if (typeof window.ensureInvestigationsLoaded === 'function') {
        window.ensureInvestigationsLoaded(true);
      } else if (typeof window.loadInvestigations === 'function') {
        void window.loadInvestigations();
      }

      if (typeof window.updateWorkspaceAlerts === 'function') {
        window.updateWorkspaceAlerts();
      }
    },
  },
  {
    id: 'reportsView',
    rootId: 'orbisSectionReports',
    targetId: 'reportsPage',
    aliases: ['reports', 'analytics'],
    onEnter: () => {
      if (typeof window.loadReportsSection === 'function') {
        void window.loadReportsSection();
      }
    },
  },
  {
    id: 'settingsView',
    rootId: 'orbisSectionSettings',
    targetId: 'settingsPage',
    aliases: ['settings', 'admin'],
    onEnter: () => {
      if (typeof window.loadSettingsAdmin === 'function') {
        void window.loadSettingsAdmin();
      }
    },
  },
];

function updateWorkspaceTitle(sectionId: string): void {
  const titleEl = document.getElementById('dashboardTitle');
  if (!titleEl) return;

  if (sectionId === 'dashboardView') {
    if (isSupervisorUser()) {
      applySupervisorDashboardView();
    } else {
      titleEl.textContent = SECTION_LABELS.dashboardView;
    }
    return;
  }

  titleEl.textContent = SECTION_LABELS[sectionId] || 'Orbis';
}

export function resolveAppSection(sectionId: string): AppSection | null {
  const normalized = String(sectionId || '').trim().toLowerCase();

  return (
    APP_SECTIONS.find((section) => {
      if (section.id.toLowerCase() === normalized) {
        return true;
      }

      return (section.aliases || []).some((alias) => alias.toLowerCase() === normalized);
    }) || null
  );
}

function activateNavButtons(sectionId: string): void {
  document.querySelectorAll('[data-nav-view]').forEach((button) => {
    const target = String((button as HTMLElement).dataset.navView || '');
    const match = resolveAppSection(target);

    if (match?.id === sectionId) {
      button.classList.add('active');
      button.setAttribute('aria-current', 'page');
    } else {
      button.classList.remove('active');
      button.removeAttribute('aria-current');
    }
  });
}

export function showAppSection(sectionId: string): boolean {
  let resolvedSectionId = String(sectionId || '').trim();

  if (isEmployeeUser() && !canAccessAppSection(resolvedSectionId)) {
    resolvedSectionId = 'myProfileView';
  }

  if (!canAccessAppSection(resolvedSectionId)) {
    resolvedSectionId = getDefaultAppSectionId();
  }

  const section = resolveAppSection(resolvedSectionId);

  if (!section) {
    console.warn(`[AppSections] Unknown section: ${sectionId}`);
    return false;
  }

  const root = document.getElementById(section.rootId);

  if (!root) {
    console.warn(`[AppSections] Section root not found: ${section.rootId}`);
    return false;
  }

  if (!document.getElementById(section.targetId)) {
    console.warn(`[AppSections] Section target not found: ${section.targetId}`);
    return false;
  }

  document.querySelectorAll('.orbis-app-section').forEach((element) => {
    const el = element as HTMLElement;
    const isActive = el.id === section.rootId;
    el.classList.toggle('active', isActive);
    el.classList.toggle('hidden', !isActive);
    el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    el.style.display = isActive ? '' : 'none';
  });

  window.currentMainView = section.id;
  activateNavButtons(section.id);
  updateWorkspaceTitle(section.id);

  if (section.onEnter) {
    section.onEnter();
  }

  window.dispatchEvent(
    new CustomEvent('orbis:section-change', {
      detail: { sectionId: section.id, targetId: section.targetId },
    })
  );

  return true;
}

export function getDefaultAppSectionId(): string {
  if (isEmployeeUser()) return 'myProfileView';
  return 'dashboardView';
}

export function initAppSections(): void {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  const initial = hash ? resolveAppSection(hash)?.id : getDefaultAppSectionId();
  showAppSection(initial || getDefaultAppSectionId());
}

window.showAppSection = showAppSection;
