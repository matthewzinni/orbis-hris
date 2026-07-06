import { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchUserAccessForEmail, isAdminRole, resolveMobileAccessRole } from '@/src/lib/access';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  role: string | null;
  isAdmin: boolean;
  accessDenied: boolean;
  displayName: string;
  email: string;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveRoleForSession(session: Session | null): Promise<{
  role: string | null;
  displayName: string;
  accessState: 'admin' | 'pending' | 'rejected' | 'denied' | 'none';
}> {
  if (!session?.user?.email) {
    return { role: null, displayName: '', accessState: 'none' };
  }

  const email = session.user.email.trim().toLowerCase();
  const access = await fetchUserAccessForEmail(email);
  const accessState = resolveMobileAccessRole(access) ?? 'none';
  const role =
    accessState === 'admin'
      ? 'admin'
      : accessState === 'pending'
        ? 'pending'
        : accessState === 'rejected'
          ? 'rejected'
          : null;
  const displayName =
    String(access?.display_name || '').trim() ||
    String(session.user.user_metadata?.full_name || '').trim() ||
    email;

  return { role, displayName, accessState };
}

async function applyResolvedSession(
  nextSession: Session | null,
  setSession: (session: Session | null) => void,
  setRole: (role: string | null) => void,
  setDisplayName: (name: string) => void
): Promise<void> {
  setSession(nextSession);

  if (!nextSession) {
    setRole(null);
    setDisplayName('');
    return;
  }

  const resolved = await resolveRoleForSession(nextSession);
  if (resolved.accessState === 'pending' || resolved.accessState === 'rejected') {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setDisplayName('');
    return;
  }

  setRole(resolved.role);
  setDisplayName(resolved.displayName);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');

  const refreshRole = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await applyResolvedSession(data.session, setSession, setRole, setDisplayName);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;

    void (async () => {
      try {
        await refreshRole();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applyResolvedSession(nextSession, setSession, setRole, setDisplayName);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshRole]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return error.message || 'Sign in failed.';
    }

    const resolved = await resolveRoleForSession(data.session);
    if (resolved.accessState === 'pending') {
      await supabase.auth.signOut();
      return 'Your account is waiting for admin approval.';
    }
    if (resolved.accessState === 'rejected') {
      await supabase.auth.signOut();
      return 'Orbis access is not available for this account. Contact HR if you need assistance.';
    }
    if (!isAdminRole(resolved.role)) {
      await supabase.auth.signOut();
      return 'Orbis Mobile Phase 0 is admin-only. Supervisor access comes in a later release.';
    }

    setSession(data.session);
    setRole(resolved.role);
    setDisplayName(resolved.displayName);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setDisplayName('');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      role,
      isAdmin: isAdminRole(role),
      accessDenied: Boolean(session && !isAdminRole(role)),
      displayName,
      email: String(session?.user?.email || ''),
      signIn,
      signOut,
      refreshRole,
    }),
    [session, loading, role, displayName, signIn, signOut, refreshRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
