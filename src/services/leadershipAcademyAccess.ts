import {
  getLinkedEmployeeId,
  isAdminUser,
  isSupervisorUser,
} from './access';

/** Any authenticated Orbis user with HRIS or portal access may open the module shell. */
export function canAccessLeadershipAcademy(): boolean {
  return isAdminUser() || isSupervisorUser() || Boolean(getLinkedEmployeeId());
}

/** Configure tiers, courses, modules, enrollments, workshops, competencies. */
export function canManageLeadershipAcademy(): boolean {
  return isAdminUser();
}

/** View organization-wide participant progress and coaching (subject to RLS). */
export function canViewLeadershipAcademyOrg(): boolean {
  return isAdminUser() || isSupervisorUser();
}

/** Participant self-service: assigned learning and progress. */
export function canViewLeadershipAcademySelf(): boolean {
  return Boolean(getLinkedEmployeeId());
}

/** Supervisors may add goals/coaching for direct reports when authorized. */
export function canManageLeadershipAcademyTeamRecords(): boolean {
  return isAdminUser() || isSupervisorUser();
}
