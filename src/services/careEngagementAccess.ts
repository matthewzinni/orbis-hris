import { isAdminUser, isSupervisorUser } from './access';

/** Care & Engagement center: admins (full) and supervisors (read-only overview). */
export function canAccessCareEngagementCenter(): boolean {
  return isAdminUser() || isSupervisorUser();
}

/** Employee drawer Care & Support tab — HR/admin only (sensitive notes). */
export function canViewCareEngagementDetails(): boolean {
  return isAdminUser();
}

export function canManageCareEngagementRecords(): boolean {
  return isAdminUser();
}
