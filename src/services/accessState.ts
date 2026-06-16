// Shared access session state and role predicates.
import { normalizeOrbisRole, type UserAccessRow } from './accessTypes';

export type { UserAccessRow, OrbisAccessState, EmployeeLike } from './accessTypes';
export { normalizeOrbisRole, getAccessApprovalStatus, parseSupervisedEmployeeIds } from './accessTypes';

let currentUserRole = 'user';
let currentUserAccess: UserAccessRow | null = null;

export function accessSafeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

export function syncAccessToWindow(): void {
  window.currentUserRole = currentUserRole;
  window.currentUserAccess = currentUserAccess;
}

export function getCurrentUserRole(): string {
  return currentUserRole;
}

export function getCurrentUserAccess(): UserAccessRow | null {
  return currentUserAccess;
}

export function setAccessSession(access: UserAccessRow | null, role?: string): void {
  currentUserAccess = access;
  if (role !== undefined) {
    currentUserRole = String(role || 'user').trim().toLowerCase();
  }
}

export function setAccessRole(role: string): void {
  currentUserRole = String(role || '').trim().toLowerCase();
}

export function setAccessRow(access: UserAccessRow | null): void {
  currentUserAccess = access;
}

export function setLinkedEmployeeId(employeeId: string): void {
  if (!currentUserAccess) return;
  currentUserAccess.linked_employee_id = employeeId;
}

export function setSupervisedEmployeeIds(ids: string[]): void {
  if (!currentUserAccess) return;
  currentUserAccess.supervised_employee_ids = ids;
}

export function getLinkedEmployeeId(): string {
  return String(currentUserAccess?.linked_employee_id || '').trim();
}

export function isAdminUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'admin';
}

export function isJanusUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'janus';
}

export function isJanusReadonlyUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'janus_readonly';
}

export function isSupervisorUser(): boolean {
  return String(currentUserRole || '').toLowerCase() === 'supervisor';
}

export function isEmployeeUser(): boolean {
  return normalizeOrbisRole(currentUserRole) === 'user';
}

export function isPortalUser(): boolean {
  return isEmployeeUser();
}
