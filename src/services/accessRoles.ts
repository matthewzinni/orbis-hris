// Role resolution, auth fetch, and section-level access rules.
import { supabaseClient } from './supabaseClient';
import {
  getAccessApprovalStatus,
  normalizeOrbisRole,
  parseSupervisedEmployeeIds,
  type UserAccessRow,
} from './accessTypes';
import {
  accessSafeGet,
  getCurrentUserAccess,
  getCurrentUserRole,
  getLinkedEmployeeId,
  isAdminUser,
  isEmployeeUser,
  isJanusReadonlyUser,
  isJanusUser,
  isPortalUser,
  isSupervisorUser,
  setAccessRole,
  setAccessRow,
  setAccessSession,
  setLinkedEmployeeId,
  setSupervisedEmployeeIds,
  syncAccessToWindow,
} from './accessState';

export type { UserAccessRow, OrbisAccessState, EmployeeLike } from './accessTypes';
export {
  getCurrentUserRole,
  getCurrentUserAccess,
  getLinkedEmployeeId,
  isAdminUser,
  isJanusUser,
  isJanusReadonlyUser,
  isSupervisorUser,
  isEmployeeUser,
  isPortalUser,
} from './accessState';
export { getAccessApprovalStatus, normalizeOrbisRole, parseSupervisedEmployeeIds } from './accessTypes';

/** Leadership emails that must remain admin (not employee portal). */
export const LEADERSHIP_ADMIN_EMAILS = new Set([
  'matthew.zinni@btwglobal.com',
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
  'colewoolard@gmail.com',
  'david.allewalt@btwglobal.com',
  'orlando.gomez@btwglobal.com',
  'willblake13@gmail.com',
]);

export const EMPLOYEE_PORTAL_SECTIONS = new Set([
  'myProfileView',
  'myTasksView',
  'myDirectoryView',
  'myTimeOffView',
]);

/** Employee-portal sections admins may use alongside full HRIS access. */
const ADMIN_PORTAL_SECTIONS = new Set(['myTasksView', 'myDirectoryView']);

const ADMIN_ONLY_SECTIONS = new Set([
  'candidatesView',
  'documentsView',
  'janusView',
  'investigationsView',
  'reportsView',
  'settingsView',
]);

const SUPERVISOR_SECTIONS = new Set([
  'dashboardView',
  'employeesView',
  'orgChartView',
  'attendanceView',
  'operationsView',
  'careEngagementView',
  'activityView',
]);

export function setCurrentUserAccess(access: UserAccessRow | null, role?: string): void {
  setAccessSession(access, role);
  syncAccessToWindow();
  updateTopbarSignedInLabel();
}

export function resolveSignedInUserLabel(
  access: UserAccessRow | null = getCurrentUserAccess(),
  fallbackEmail = ''
): string {
  const displayName = String(access?.display_name || '').trim();
  if (displayName) return displayName;

  const accessEmail = String(access?.email || '').trim();
  if (accessEmail) return accessEmail;

  const authEmail = String(fallbackEmail || (window as { currentUserEmail?: string }).currentUserEmail || '')
    .trim();
  if (authEmail) return authEmail;

  return '';
}

/** Keep topbar "Signed in as" in sync with auth + user_access. */
export function updateTopbarSignedInLabel(fallbackEmail = ''): void {
  const access = getCurrentUserAccess();
  const label = resolveSignedInUserLabel(access, fallbackEmail) || '—';
  const el = accessSafeGet('currentUserEmail');
  if (el) {
    el.textContent = label;
    const email = String(
      access?.email ||
        fallbackEmail ||
        (window as { currentUserEmail?: string }).currentUserEmail ||
        ''
    )
      .trim()
      .toLowerCase();
    if (email && label.toLowerCase() !== email) {
      el.setAttribute('title', email);
    } else {
      el.removeAttribute('title');
    }
  }

  const cacheEmail = String(
    access?.email ||
      fallbackEmail ||
      (window as { currentUserEmail?: string }).currentUserEmail ||
      ''
  )
    .trim()
    .toLowerCase();
  if (cacheEmail) {
    (window as { currentUserEmail?: string }).currentUserEmail = cacheEmail;
  }
}

export async function fetchUserAccessRowForEmail(email: string): Promise<UserAccessRow | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const select =
    'email, display_name, role, supervisor_name, supervised_employee_ids, linked_employee_id, can_delete, approval_status';

  const { data: rpcRow, error: rpcErr } = await supabaseClient.rpc('orbis_get_my_user_access');
  if (!rpcErr && rpcRow) {
    const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as UserAccessRow | undefined;
    if (row && typeof row === 'object') {
      const rowEmail = String(row.email || '')
        .trim()
        .toLowerCase();
      if (rowEmail === normalized) {
        return row;
      }
    }
  }

  const { data: exactMatch, error: exactErr } = await supabaseClient
    .from('user_access')
    .select(select)
    .eq('email', normalized)
    .limit(1);

  if (!exactErr && exactMatch?.[0]) {
    return exactMatch[0] as UserAccessRow;
  }

  const { data: ilikeMatch, error: ilikeErr } = await supabaseClient
    .from('user_access')
    .select(select)
    .ilike('email', normalized)
    .limit(1);

  if (!ilikeErr && ilikeMatch?.[0]) {
    return ilikeMatch[0] as UserAccessRow;
  }

  return null;
}

export async function getUserRole(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return null;

    const userEmail = String(user.email || '')
      .trim()
      .toLowerCase();

    if (userEmail) {
      (window as { currentUserEmail?: string }).currentUserEmail = userEmail;
    }

    setAccessRow(null);

    const accessRow = await fetchUserAccessRowForEmail(userEmail);

    if (accessRow) {
      setAccessRow(accessRow);
      const approval = getAccessApprovalStatus(accessRow);

      if (approval === 'pending') {
        setAccessRole('pending');
        syncAccessToWindow();
        return 'pending';
      }

      if (approval === 'rejected') {
        setAccessRole('rejected');
        syncAccessToWindow();
        return 'rejected';
      }

      const accessRole = normalizeOrbisRole(String(accessRow.role || ''));
      if (
        accessRole === 'admin' ||
        accessRole === 'supervisor' ||
        accessRole === 'user' ||
        accessRole === 'janus' ||
        accessRole === 'janus_readonly'
      ) {
        setAccessRole(accessRole);
        syncAccessToWindow();
        await ensureLinkedEmployeeRecord();
        if (accessRole === 'supervisor') {
          await ensureSupervisorEmployeeScope();
        }
        updateTopbarSignedInLabel(userEmail);
        return accessRole;
      }
    }

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('hr_role')
      .eq('id', user.id);

    if (error) {
      console.error(error);
      return null;
    }

    const roles = (data || [])
      .map((row: { hr_role?: string }) =>
        String(row.hr_role || '')
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);

    if (roles.includes('admin')) {
      setAccessRole('admin');
      syncAccessToWindow();
      updateTopbarSignedInLabel(userEmail);
      return 'admin';
    }

    if (roles.includes('supervisor')) {
      setAccessRole('supervisor');
      syncAccessToWindow();
      updateTopbarSignedInLabel(userEmail);
      return 'supervisor';
    }

    setAccessRole('');
    setAccessRow(null);
    syncAccessToWindow();
    updateTopbarSignedInLabel();
    return null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function canAccessJanus(): boolean {
  return isAdminUser() || isJanusUser() || isJanusReadonlyUser();
}

export function canEditJanus(): boolean {
  return isAdminUser() || isJanusUser();
}

export function canManageEmployeeRecords(): boolean {
  return isAdminUser();
}

/** Self-service profile / tasks / PTO for employees and supervisors linked to a roster record. */
export function hasPersonalEmployeePortal(): boolean {
  if (isEmployeeUser()) return true;
  if (!getLinkedEmployeeId()) return false;
  return isSupervisorUser();
}

export async function ensureLinkedEmployeeRecord(): Promise<string | null> {
  const existing = getLinkedEmployeeId();
  if (existing) return existing;

  if (!getCurrentUserAccess()) return null;

  const access = getCurrentUserAccess();
  const role = normalizeOrbisRole(String(access?.role || ''));
  if (role !== 'user' && role !== 'supervisor' && role !== 'admin') return null;

  const { data, error } = await supabaseClient.rpc('orbis_link_my_employee_record');

  if (error) {
    console.warn('[Access] Could not link employee record:', error.message || error);
    return null;
  }

  const employeeId = String(data || '').trim();
  if (employeeId) {
    setLinkedEmployeeId(employeeId);
    syncAccessToWindow();
  }

  return employeeId || null;
}

/** Refresh explicit supervisor team ids from roster supervisor field when a stale list exists. */
export async function ensureSupervisorEmployeeScope(): Promise<string[] | null> {
  if (!isSupervisorUser() || !getCurrentUserAccess()) return null;

  const access = getCurrentUserAccess();
  const current = parseSupervisedEmployeeIds(access);
  if (!current.length) return null;

  const { data, error } = await supabaseClient.rpc('orbis_sync_my_supervisor_scope');

  if (error) {
    console.warn('[Access] Could not sync supervisor scope:', error.message || error);
    return null;
  }

  const synced = Array.isArray(data)
    ? data.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  if (synced.length) {
    setSupervisedEmployeeIds(synced);
    syncAccessToWindow();
  }

  return synced.length ? synced : null;
}

export function canAccessOrbisApp(): boolean {
  return isAdminUser() || isSupervisorUser() || isPortalUser();
}

export function canAccessAppSection(sectionId: string): boolean {
  const section = String(sectionId || '').trim();
  if (!section) return false;

  if (section === 'janusView') {
    return canAccessJanus();
  }

  if (isPortalUser()) {
    return EMPLOYEE_PORTAL_SECTIONS.has(section);
  }

  if (isAdminUser()) {
    if (ADMIN_PORTAL_SECTIONS.has(section)) return true;
    return !EMPLOYEE_PORTAL_SECTIONS.has(section);
  }

  if (isSupervisorUser()) {
    if (section === 'myTasksView') return true;
    if (EMPLOYEE_PORTAL_SECTIONS.has(section) && hasPersonalEmployeePortal()) return true;
    if (EMPLOYEE_PORTAL_SECTIONS.has(section)) return false;
    if (ADMIN_ONLY_SECTIONS.has(section)) return false;
    return SUPERVISOR_SECTIONS.has(section);
  }

  return false;
}
