import { supabase } from './supabase';

export type UserAccessRow = {
  email?: string;
  display_name?: string;
  role?: string;
};

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
    .select('email, display_name, role')
    .eq('email', normalized)
    .limit(1);

  if (exactMatch?.[0]) {
    return exactMatch[0] as UserAccessRow;
  }

  const { data: ilikeMatch } = await supabase
    .from('user_access')
    .select('email, display_name, role')
    .ilike('email', normalized)
    .limit(1);

  return (ilikeMatch?.[0] as UserAccessRow | undefined) ?? null;
}

export function normalizeRole(role: unknown): string {
  return String(role || '')
    .trim()
    .toLowerCase();
}

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'admin';
}
