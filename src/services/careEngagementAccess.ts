import { isAdminUser } from './access';

/** Care & Engagement center and drawer tab are HR/admin only by default. */
export function canAccessCareEngagementCenter(): boolean {
  return isAdminUser();
}

export function canViewCareEngagementDetails(): boolean {
  return isAdminUser();
}

export function canManageCareEngagementRecords(): boolean {
  return isAdminUser();
}
