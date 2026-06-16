export type UserAccessRow = {
  email?: string;
  display_name?: string;
  role?: string;
  supervisor_name?: string;
  /** When non-empty, supervisor roster + RLS are limited to these employees.id values. */
  supervised_employee_ids?: string[] | null;
  /** employees.id for role=user (self-service PTO portal). */
  linked_employee_id?: string | null;
  can_delete?: boolean;
  approval_status?: 'pending' | 'approved' | 'rejected' | string;
};

export type OrbisAccessState = 'approved' | 'pending' | 'rejected' | 'none';

export type EmployeeLike = Record<string, unknown>;

export function normalizeOrbisRole(role: string): string {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'employee') return 'user';
  return value;
}

export function getAccessApprovalStatus(
  row: UserAccessRow | null | undefined
): OrbisAccessState {
  const status = String(row?.approval_status || 'approved').trim().toLowerCase();
  if (status === 'pending') return 'pending';
  if (status === 'rejected') return 'rejected';
  if (status === 'approved') return 'approved';
  return 'none';
}

/** Normalize UUID list from user_access (PostgREST may return string[] or JSON). */
export function parseSupervisedEmployeeIds(access: UserAccessRow | null | undefined): string[] {
  const raw = access?.supervised_employee_ids;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}
