import {
  getCurrentUserAccess,
  getLinkedEmployeeId,
  getSupervisorDepartmentScope,
  isAdminUser,
  isSupervisorUser,
  employeeMatchesSupervisorAccess,
} from './access';
import type { EmployeeLike } from './accessTypes';
import type { InternalJobInterest, InternalJobPosting } from '../types/internalJobBoardTypes';

export function canAccessInternalJobBoard(): boolean {
  return isAdminUser() || isSupervisorUser() || Boolean(getLinkedEmployeeId());
}

export function canManageInternalJobPostings(): boolean {
  return isAdminUser() || isSupervisorUser();
}

export function canDeleteInternalJobPostings(): boolean {
  return isAdminUser();
}

export function canSubmitInternalJobInterest(): boolean {
  return Boolean(getLinkedEmployeeId());
}

export function hiringManagerMatchesScope(hiringManagerName: string): boolean {
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const scopeName = String(
    getCurrentUserAccess()?.supervisor_name || getCurrentUserAccess()?.display_name || ''
  )
    .trim()
    .toLowerCase();

  const hiringManager = String(hiringManagerName || '')
    .trim()
    .toLowerCase();

  if (!scopeName || !hiringManager) return false;

  if (hiringManager.includes(scopeName) || scopeName.includes(hiringManager)) return true;

  const normalize = (value: string) => value.replace(/[^a-z0-9]/g, '');
  const normalizedScope = normalize(scopeName);
  const normalizedManager = normalize(hiringManager);

  return (
    normalizedManager.includes(normalizedScope) || normalizedScope.includes(normalizedManager)
  );
}

export function canViewInternalJobInterest(interest: InternalJobInterest | null | undefined): boolean {
  if (!interest) return false;
  if (isAdminUser()) return true;

  const linkedId = getLinkedEmployeeId();
  if (linkedId && String(interest.employee_id || '') === linkedId) return true;

  if (!isSupervisorUser()) return false;

  const posting = interest.internal_job_postings;
  if (posting) {
    const department = String(posting.department || '')
      .trim()
      .toLowerCase();
    if (department && getSupervisorDepartmentScope().includes(department)) return true;
    if (hiringManagerMatchesScope(String(posting.hiring_manager_name || ''))) return true;
  }

  const employee = findEmployeeLikeById(String(interest.employee_id || ''));
  if (employee && employeeMatchesSupervisorAccess(employee)) return true;

  return false;
}

export function canManageInternalJobPosting(posting: InternalJobPosting | null | undefined): boolean {
  if (!posting) return false;
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const department = String(posting.department || '')
    .trim()
    .toLowerCase();
  if (department && getSupervisorDepartmentScope().includes(department)) return true;
  if (hiringManagerMatchesScope(String(posting.hiring_manager_name || ''))) return true;

  return false;
}

export function resolveCurrentUserEmail(): string {
  return String(
    (window as { currentUserEmail?: string }).currentUserEmail ||
      getCurrentUserAccess()?.email ||
      ''
  )
    .trim()
    .toLowerCase();
}

export function resolveCurrentUserDisplayName(): string {
  const access = getCurrentUserAccess();
  return String(access?.display_name || access?.email || resolveCurrentUserEmail() || 'User').trim();
}

function findEmployeeLikeById(id: string): EmployeeLike | null {
  const normalized = String(id || '').trim();
  if (!normalized) return null;

  const employees = (window as { EMPLOYEES?: EmployeeLike[] }).EMPLOYEES;
  if (!Array.isArray(employees)) return null;

  return (
    employees.find((employee) => {
      const keys = [employee.id, employee.employee_id, employee.dbId, employee.displayId]
        .filter(Boolean)
        .map(String);
      return keys.includes(normalized);
    }) || null
  );
}
