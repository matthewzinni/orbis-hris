import {
  canAccessAppSection,
  isEmployeeUser,
  isAdminUser,
  isSupervisorUser,
} from '../services/access';

export type MobileTabId = 'home' | 'people' | 'tasks' | 'activity' | 'more';

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
  'candidatesView',
  'settingsView',
  'myProfileView',
  'myTimeOffView',
  'myTasksView',
  'myDirectoryView',
  'employeesView',
  'dashboardView',
] as const;

function primaryHomeSection(): string {
  return isEmployeeUser() ? 'myProfileView' : 'dashboardView';
}

function primaryPeopleSection(): string {
  if (isEmployeeUser()) return 'myDirectoryView';
  return 'employeesView';
}

function primaryTasksSection(): string {
  return 'myTasksView';
}

function primaryActivitySection(): string {
  if (isEmployeeUser()) return 'myTimeOffView';
  if (isSupervisorUser() || isAdminUser()) return 'activityView';
  return 'myTimeOffView';
}

function buildPrimaryTabs(): MobileTabConfig[] {
  const tabs: MobileTabConfig[] = [
    {
      id: 'home',
      label: 'Home',
      icon: '⌂',
      sectionId: primaryHomeSection(),
    },
    {
      id: 'people',
      label: isEmployeeUser() ? 'Directory' : 'People',
      icon: '👥',
      sectionId: primaryPeopleSection(),
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: '✓',
      sectionId: primaryTasksSection(),
    },
    {
      id: 'activity',
      label: isEmployeeUser() ? 'Time Off' : 'Activity',
      icon: '◎',
      sectionId: primaryActivitySection(),
    },
    {
      id: 'more',
      label: 'More',
      icon: '⋯',
      sectionId: '',
    },
  ];

  return tabs.filter((tab) => {
    if (tab.id === 'more') return true;
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
  dashboardView: 'home',
  myProfileView: 'home',
  employeesView: 'people',
  myDirectoryView: 'people',
  myTasksView: 'tasks',
  activityView: 'activity',
  myTimeOffView: 'activity',
  operationsView: 'more',
  orgChartView: 'more',
  candidatesView: 'more',
  documentsView: 'more',
  janusView: 'more',
  attendanceView: 'more',
  careEngagementView: 'more',
  investigationsView: 'more',
  reportsView: 'more',
  settingsView: 'more',
};

export function sectionIdToMobileTab(sectionId: string): MobileTabId {
  return SECTION_TO_TAB[sectionId] || 'more';
}
