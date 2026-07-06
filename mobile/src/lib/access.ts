import { supabase } from './supabase';

export type UserAccessRow = {
  email?: string;
  display_name?: string;
  role?: string;
  approval_status?: 'pending' | 'approved' | 'rejected' | string;
};

export type OrbisAccessState = 'approved' | 'pending' | 'rejected' | 'none';

export async function fetchUserAccessForEmail(email: string): Promise<UserAccessRow | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const { data: rpcRow, error: rpcErr } = await supabase.rpc('orbis_get_my_user_access');
  if (!rpcErr && rpcRow) {
    const row = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as UserAccessRow | undefined;
    if (row && String(row.email || '').trim().toLowerCase() === normalized) {
      return row;
    }
  }

  const { data: exactMatch } = await supabase
    .from('user_access')
    .select('email, display_name, role, approval_status')
    .eq('email', normalized)
    .limit(1);

  if (exactMatch?.[0]) {
    return exactMatch[0] as UserAccessRow;
  }

  const { data: ilikeMatch } = await supabase
    .from('user_access')
    .select('email, display_name, role, approval_status')
    .ilike('email', normalized)
    .limit(1);

  return (ilikeMatch?.[0] as UserAccessRow | undefined) ?? null;
}

export function normalizeRole(role: unknown): string {
  const value = String(role || '')
    .trim()
    .toLowerCase();
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

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'admin';
}

export function resolveMobileAccessRole(
  access: UserAccessRow | null
): 'admin' | 'pending' | 'rejected' | 'denied' | null {
  if (!access) return null;

  const approval = getAccessApprovalStatus(access);
  if (approval === 'pending') return 'pending';
  if (approval === 'rejected') return 'rejected';

  const role = normalizeRole(access.role);
  if (isAdminRole(role)) return 'admin';
  return 'denied';
}
