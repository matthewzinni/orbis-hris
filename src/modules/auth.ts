import * as SupabaseService from '../services/supabaseClient';

const supabase =
  (SupabaseService as any).supabaseClient ||
  (SupabaseService as any).supabase ||
  (window as any).supabaseClient ||
  (window as any).supabase;

if (!supabase) {
  console.error(
    'Supabase client export was not found. Check src/services/supabaseClient.ts exports.'
  );
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

function setLoginLoading(loading: boolean): void {
  const btn = document.getElementById('loginBtn') as HTMLButtonElement | null;
  const email = document.getElementById('loginEmail') as HTMLInputElement | null;
  const password = document.getElementById('loginPassword') as HTMLInputElement | null;

  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Signing in…' : 'Sign In';
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  if (email) email.disabled = loading;
  if (password) password.disabled = loading;
}

function setLoginError(message: string): void {
  const el = document.getElementById('loginError');

  if (!el) return;

  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

async function enterAuthenticatedApp(): Promise<void> {
  if (typeof window.clearOrbisSessionState === 'function') {
    window.clearOrbisSessionState();
  }

  if (typeof window.showAuthenticatedOrbisView === 'function') {
    window.showAuthenticatedOrbisView();
  }

  if (typeof window.bootstrapOrbisAfterAuth === 'function') {
    await window.bootstrapOrbisAfterAuth();
    return;
  }

  window.location.reload();
}

export async function signIn(email?: string, password?: string) {
  const emailInput = document.querySelector<HTMLInputElement>(
    '#email, #loginEmail, input[name="email"], input[type="email"]'
  );

  const passwordInput = document.querySelector<HTMLInputElement>(
    '#password, #loginPassword, input[name="password"], input[type="password"]'
  );

  const resolvedEmail = String(email || emailInput?.value || '').trim();
  const resolvedPassword = String(password || passwordInput?.value || '').trim();

  setLoginError('');

  if (!resolvedEmail || !resolvedPassword) {
    const message = 'Please enter both email and password.';
    setLoginError(message);
    showToast(message, 'error');
    return null;
  }

  setLoginLoading(true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: resolvedPassword,
    });

    if (error) {
      const message = error.message || 'Sign in failed.';
      setLoginError(message);
      showToast(message, 'error');
      return null;
    }

    showToast('Signed in successfully.');
    await enterAuthenticatedApp();
    return data;
  } catch (err) {
    console.error('Sign in failed:', err);
    setLoginError('Sign in failed. Please try again.');
    showToast('Sign in failed. Please try again.', 'error');
    return null;
  } finally {
    setLoginLoading(false);
  }
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
    if (typeof window.clearOrbisSessionState === 'function') {
      window.clearOrbisSessionState();
    }
    showToast('Signed out.');

    if (typeof window.showAuthView === 'function') {
      window.showAuthView();
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.error('Sign out failed:', err);
    showToast('Could not sign out. Please try again.', 'error');
  }
}

export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

export function watchAuthState(callback: (event: string, session: unknown) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    callback(event, session);
  });
}

declare global {
  interface Window {
    signIn?: typeof signIn;
    signOut?: typeof signOut;
    showAuthenticatedOrbisView?: () => void;
    showAuthView?: () => void;
    bootstrapOrbisAfterAuth?: () => Promise<void>;
    clearOrbisSessionState?: () => void;
  }
}

window.signIn = signIn;
window.signOut = signOut;
