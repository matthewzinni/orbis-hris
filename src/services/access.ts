// User access / role scoping — barrel re-exports (split: roles, scopes, ui).
export type { UserAccessRow, OrbisAccessState, EmployeeLike } from './accessTypes';
export {
  getAccessApprovalStatus,
  normalizeOrbisRole,
  parseSupervisedEmployeeIds,
} from './accessTypes';

export {
  getCurrentUserRole,
  getCurrentUserAccess,
  getLinkedEmployeeId,
  isAdminUser,
  isJanusUser,
  isJanusReadonlyUser,
  hasJanusAccessGrant,
  isSupervisorUser,
  isEmployeeUser,
  isPortalUser,
} from './accessState';

export {
  LEADERSHIP_ADMIN_EMAILS,
  setCurrentUserAccess,
  resolveSignedInUserLabel,
  updateTopbarSignedInLabel,
  fetchUserAccessRowForEmail,
  getUserRole,
  canAccessJanus,
  canEditJanus,
  canManageEmployeeRecords,
  hasPersonalEmployeePortal,
  ensureLinkedEmployeeRecord,
  ensureSupervisorEmployeeScope,
  canAccessOrbisApp,
  canAccessAppSection,
} from './accessRoles';

export {
  PERFORMANCE_REVIEW_EXECUTIVE_NOTIFY_EMAILS,
  canEmailSupervisorsPerformanceReviews,
  supervisorNameMatches,
  employeeMatchesSupervisorAccess,
  getSupervisorDepartmentScope,
  hasOrgWidePerformanceReviewAccess,
  employeeMatchesPerformanceReviewScope,
  ATTENDANCE_ORG_WIDE_EMAILS,
  hasOrgWideAttendanceAccess,
  employeeMatchesAttendanceScope,
  canAccessPerformanceReviews,
  canEditEmployeeAdmin,
  resolveDirectReportIdsFromRoster,
  resolveDirectReportIdsForSupervisorName,
  resolveEmployeeRosterName,
  resolveSupervisorScopeForEmployee,
  type EmployeeRosterIndex,
  type EmployeeSupervisorLookup,
  loadEmployeeRosterIndex,
  loadEmployeeSupervisorLookup,
  resolveEmployeeFileSupervisor,
  resolveSupervisorRosterName,
  resolveTeamIdsForAccessRow,
  resolveLinkedEmployeeIdForEmail,
} from './accessScopes';

export {
  applyRoleNavigation,
  applyEmployeePortalView,
  applyAdminDashboardView,
  clearOrbisSessionState,
  applySupervisorDashboardView,
  applyRoleLocks,
  applyAddEmployeeAsCandidateAccess,
  ensureDeleteEmployeeButton,
  applyRolePermissions,
} from './accessUi';

import { syncAccessToWindow } from './accessState';
import {
  getUserRole,
  updateTopbarSignedInLabel,
  resolveSignedInUserLabel,
  isAdminUser,
  canManageEmployeeRecords,
  isSupervisorUser,
  isEmployeeUser,
  canAccessOrbisApp,
  canAccessAppSection,
  getLinkedEmployeeId,
} from './accessRoles';
import {
  canAccessPerformanceReviews,
  canEditEmployeeAdmin,
  employeeMatchesSupervisorAccess,
} from './accessScopes';
import {
  applyRoleNavigation,
  applyEmployeePortalView,
  applyAdminDashboardView,
  applySupervisorDashboardView,
  clearOrbisSessionState,
  applyRoleLocks,
  applyAddEmployeeAsCandidateAccess,
  applyRolePermissions,
  ensureDeleteEmployeeButton,
} from './accessUi';

syncAccessToWindow();

window.getUserRole = getUserRole;
window.updateTopbarSignedInLabel = updateTopbarSignedInLabel;
window.resolveSignedInUserLabel = resolveSignedInUserLabel;
window.isAdminUser = isAdminUser;
window.canManageEmployeeRecords = canManageEmployeeRecords;
window.isSupervisorUser = isSupervisorUser;
window.isEmployeeUser = isEmployeeUser;
window.canAccessOrbisApp = canAccessOrbisApp;
window.canAccessAppSection = canAccessAppSection;
window.applyRoleNavigation = applyRoleNavigation;
window.getLinkedEmployeeId = getLinkedEmployeeId;
window.applyEmployeePortalView = applyEmployeePortalView;
window.canAccessPerformanceReviews = canAccessPerformanceReviews;
window.canEditEmployeeAdmin = canEditEmployeeAdmin;
window.employeeMatchesSupervisorAccess = employeeMatchesSupervisorAccess;
window.applyAdminDashboardView = applyAdminDashboardView;
window.applySupervisorDashboardView = applySupervisorDashboardView;
window.clearOrbisSessionState = clearOrbisSessionState;
window.applyRoleLocks = applyRoleLocks;
window.applyAddEmployeeAsCandidateAccess = applyAddEmployeeAsCandidateAccess;
window.applyRolePermissions = applyRolePermissions;
window.ensureDeleteEmployeeButton = ensureDeleteEmployeeButton;
