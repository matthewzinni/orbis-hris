import {
  getCurrentUserAccess,
  getSupervisorDepartmentScope,
  isAdminUser,
  isSupervisorUser,
} from './access';

export { getSupervisorDepartmentScope };
import { supabaseClient } from './supabaseClient';
import type { OperationsIssue } from '../types/operationsTypes';

export function canAccessOperationsCenter(): boolean {
  return isAdminUser() || isSupervisorUser();
}

export function canViewOperationsIssue(issue: OperationsIssue | null | undefined): boolean {
  if (!issue) return false;
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const email = String(
    (window as { currentUserEmail?: string }).currentUserEmail ||
      getCurrentUserAccess()?.email ||
      ''
  )
    .trim()
    .toLowerCase();

  const department = String(issue.department || '')
    .trim()
    .toLowerCase();
  const scopedDepartments = getSupervisorDepartmentScope();

  if (department && scopedDepartments.includes(department)) return true;
  if (email && String(issue.reported_by_email || '').toLowerCase() === email) return true;
  if (email && String(issue.assigned_to_email || '').toLowerCase() === email) return true;

  return false;
}

export function canDeleteOperationsIssue(): boolean {
  return isAdminUser();
}

export async function resolveCurrentUserEmail(): Promise<string> {
  const cached = String((window as { currentUserEmail?: string }).currentUserEmail || '')
    .trim()
    .toLowerCase();

  if (cached) return cached;

  const accessEmail = String(getCurrentUserAccess()?.email || '')
    .trim()
    .toLowerCase();

  if (accessEmail) {
    (window as { currentUserEmail?: string }).currentUserEmail = accessEmail;
    return accessEmail;
  }

  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    const authEmail = String(user?.email || '')
      .trim()
      .toLowerCase();
    if (authEmail) {
      (window as { currentUserEmail?: string }).currentUserEmail = authEmail;
      return authEmail;
    }
  } catch (err) {
    console.warn('[Operations] Could not resolve auth email:', err);
  }

  return '';
}

export function resolveCurrentUserDisplayName(): string {
  return String(
    getCurrentUserAccess()?.display_name ||
      getCurrentUserAccess()?.supervisor_name ||
      'User'
  ).trim();
}
