import {
  canAccessAppSection,
  isEmployeeUser,
  isAdminUser,
  isSupervisorUser,
} from '../services/access';
import { isMobileLayout } from './mobileLayout';

export type MobileTabId = 'dashboard' | 'employees' | 'candidates' | 'attention' | 'more';

export interface MobileTabConfig {
  id: MobileTabId;
  label: string;
  icon: string;
  /** Section opened when the tab is tapped (not used for "more"). */
  sectionId: string;
}

export interface MobileMoreItem {
  sectionId: string;
  label: string;
}

const SECTION_LABELS: Record<string, string> = {
  dashboardView: 'Dashboard',
  employeesView: 'Employees',
  orgChartView: 'Org Chart',
  candidatesView: 'Candidates',
  documentsView: 'Documents',
  janusView: 'Janus',
  operationsView: 'Operations',
  careEngagementView: 'Care & Engagement',
  attendanceView: 'Attendance',
  myProfileView: 'My Profile',
  myTasksView: 'Tasks & Acknowledgments',
  myDirectoryView: 'Directory',
  myTimeOffView: 'My Time Off',
  internalJobBoardView: 'Internal Job Board',
  leadershipAcademyView: 'Leadership Academy',
  activityView: 'Activity',
  investigationsView: 'Investigations',
  reportsView: 'Reports',
  settingsView: 'Admin & Settings',
};

const MORE_SECTION_IDS = [
  'documentsView',
  'janusView',
  'reportsView',
  'investigationsView',
  'operationsView',
  'careEngagementView',
  'attendanceView',
  'orgChartView',
  'activityView',
  'myTimeOffView',
  'internalJobBoardView',
  'leadershipAcademyView',
  'settingsView',
  'myProfileView',
  'myTasksView',
  'myDirectoryView',
  'employeesView',
  'dashboardView',
] as const;

function primaryDashboardSection(): string {
  return isEmployeeUser() ? 'myProfileView' : 'dashboardView';
}

function primaryEmployeesSection(): string {
  if (isEmployeeUser()) return 'myDirectoryView';
  return 'employeesView';
}

function primaryAttentionSection(): string {
  if (isEmployeeUser()) return 'myTasksView';
  if (isMobileLayout() && (isAdminUser() || isSupervisorUser())) {
    return 'myTasksView';
  }
  return 'dashboardView';
}

function buildPrimaryTabs(): MobileTabConfig[] {
  const tabs: MobileTabConfig[] = [
    {
      id: 'dashboard',
      label: isEmployeeUser() ? 'Home' : 'Dashboard',
      icon: '⌂',
      sectionId: primaryDashboardSection(),
    },
    {
      id: 'employees',
      label: isEmployeeUser() ? 'Directory' : 'Employees',
      icon: '👥',
      sectionId: primaryEmployeesSection(),
    },
  ];

  if (canAccessAppSection('candidatesView')) {
    tabs.push({
      id: 'candidates',
      label: 'Candidates',
      icon: '📋',
      sectionId: 'candidatesView',
    });
  }

  tabs.push({
    id: 'attention',
    label: 'Attention',
    icon: '!',
    sectionId: primaryAttentionSection(),
  });

  tabs.push({
    id: 'more',
    label: 'More',
    icon: '⋯',
    sectionId: '',
  });

  return tabs.filter((tab) => {
    if (tab.id === 'more' || tab.id === 'attention') return true;
    return canAccessAppSection(tab.sectionId);
  });
}

export function getMobileTabsForUser(): MobileTabConfig[] {
  return buildPrimaryTabs();
}

export function getMobileMoreItems(): MobileMoreItem[] {
  const primarySectionIds = new Set(
    getMobileTabsForUser()
      .filter((tab) => tab.id !== 'more')
      .map((tab) => tab.sectionId)
  );

  return MORE_SECTION_IDS.filter((sectionId) => {
    if (!canAccessAppSection(sectionId)) return false;
    if (primarySectionIds.has(sectionId)) return false;
    return true;
  }).map((sectionId) => ({
    sectionId,
    label: SECTION_LABELS[sectionId] || sectionId,
  }));
}

const SECTION_TO_TAB: Record<string, MobileTabId> = {
  dashboardView: 'dashboard',
  myProfileView: 'dashboard',
  employeesView: 'employees',
  myDirectoryView: 'employees',
  candidatesView: 'candidates',
  myTasksView: 'attention',
  operationsView: 'more',
  orgChartView: 'more',
  documentsView: 'more',
  janusView: 'more',
  attendanceView: 'more',
  careEngagementView: 'more',
  investigationsView: 'more',
  reportsView: 'more',
  settingsView: 'more',
  activityView: 'more',
  myTimeOffView: 'more',
  internalJobBoardView: 'more',
  leadershipAcademyView: 'more',
};

export function sectionIdToMobileTab(sectionId: string): MobileTabId {
  return SECTION_TO_TAB[sectionId] || 'more';
}

/** Scroll the dashboard attention block into view after switching views. */
export function scrollToAttentionSection(): void {
  const targets = [
    document.getElementById('mobileHrTasksCard'),
    document.getElementById('mobileHrInboxFilters'),
    document.getElementById('managerHomeAttentionList'),
    document.getElementById('hrInboxCard'),
    document.getElementById('myTasksPendingList'),
  ].filter((el): el is HTMLElement => Boolean(el && !el.classList.contains('hidden')));

  const target = targets[0];
  if (!target) return;

  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
