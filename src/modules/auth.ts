import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseClient as supabase } from '../services/supabaseClient';
import { devLog } from '../utils/devLog';

type AuthMode = 'signin' | 'register';

let authMode: AuthMode = 'signin';
let registeringAccount = false;

export function isRegisteringAccount(): boolean {
  return registeringAccount;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

function setLoginLoading(loading: boolean): void {
  const btn = document.getElementById('authSubmitBtn') as HTMLButtonElement | null;
  const email = document.getElementById('loginEmail') as HTMLInputElement | null;
  const password = document.getElementById('loginPassword') as HTMLInputElement | null;
  const confirm = document.getElementById('registerPasswordConfirm') as HTMLInputElement | null;
  const displayName = document.getElementById('registerDisplayName') as HTMLInputElement | null;

  const busy = loading;
  if (btn) {
    btn.disabled = busy;
    if (busy) {
      btn.textContent = authMode === 'register' ? 'Creating account…' : 'Signing in…';
    } else {
      btn.textContent = authMode === 'register' ? 'Create account' : 'Sign in';
    }
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  if (email) email.disabled = busy;
  if (password) password.disabled = busy;
  if (confirm) confirm.disabled = busy;
  if (displayName) displayName.disabled = busy;
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

function readAuthFields(): {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
} {
  const emailInput = document.querySelector<HTMLInputElement>(
    '#email, #loginEmail, input[name="email"], input[type="email"]'
  );
  const passwordInput = document.querySelector<HTMLInputElement>(
    '#password, #loginPassword, input[name="password"], input[type="password"]'
  );
  const confirmInput = document.getElementById('registerPasswordConfirm') as HTMLInputElement | null;
  const displayInput = document.getElementById('registerDisplayName') as HTMLInputElement | null;

  return {
    email: String(emailInput?.value || '').trim(),
    password: String(passwordInput?.value || '').trim(),
    confirmPassword: String(confirmInput?.value || '').trim(),
    displayName: String(displayInput?.value || '').trim(),
  };
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

export function setAuthMode(mode: AuthMode): void {
  authMode = mode;

  const registerPanel = document.getElementById('authRegisterPanel');
  const signInTab = document.getElementById('authTabSignIn');
  const registerTab = document.getElementById('authTabRegister');
  const submitBtn = document.getElementById('authSubmitBtn') as HTMLButtonElement | null;

  registerPanel?.classList.toggle('hidden', mode !== 'register');

  signInTab?.classList.toggle('active', mode === 'signin');
  registerTab?.classList.toggle('active', mode === 'register');
  signInTab?.setAttribute('aria-selected', mode === 'signin' ? 'true' : 'false');
  registerTab?.setAttribute('aria-selected', mode === 'register' ? 'true' : 'false');

  if (submitBtn) {
    submitBtn.textContent = mode === 'register' ? 'Create account' : 'Sign in';
  }

  const password = document.getElementById('loginPassword') as HTMLInputElement | null;
  const passwordLabel = document.querySelector<HTMLLabelElement>('label[for="loginPassword"]');
  if (password) {
    password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    password.placeholder = mode === 'register' ? 'At least 8 characters' : 'Password';
  }
  if (passwordLabel) {
    passwordLabel.textContent = 'Password';
  }

  setLoginError('');
}

export async function registerAccount(): Promise<boolean> {
  setLoginError('');

  if (!isSupabaseConfigured) {
    const message =
      'This site is missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  const { email, password, confirmPassword, displayName } = readAuthFields();

  if (!email || !password) {
    const message = 'Enter your email and a password.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  if (password.length < 8) {
    const message = 'Password must be at least 8 characters.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  if (password !== confirmPassword) {
    const message = 'Passwords do not match.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  setLoginLoading(true);
  registeringAccount = true;

  const finishPendingRequest = async (): Promise<boolean> => {
    const { error: regErr } = await supabase.rpc('orbis_register_account_request', {
      p_display_name: displayName || null,
    });

    if (regErr) {
      console.error('Account request registration failed:', regErr);
      await supabase.auth.signOut();
      const message = regErr.message || 'Could not submit your access request. Contact HR.';
      setLoginError(message);
      showToast(message, 'error');
      return false;
    }

    await supabase.auth.signOut();

    const message =
      'Account created. An HR admin must approve your access and set your permission level ' +
      '(user, supervisor, or admin) before you can sign in.';
    setLoginError(message);
    showToast(message, 'success');
    setAuthMode('signin');
    return true;
  };

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: displayName ? { display_name: displayName } : undefined,
      },
    });

    if (error) {
      const raw = error.message || 'Could not create account.';
      if (/signups?\s+not\s+allowed/i.test(raw)) {
        const message =
          'Self-registration is turned off in Supabase. Enable Authentication → Providers → ' +
          'Email → Allow new users to sign up, then try again.';
        setLoginError(message);
        showToast(message, 'error');
        return false;
      }

      if (/already registered|already been registered/i.test(raw)) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInErr || !signInData.session) {
          const message =
            'This email is already registered. Sign in with your password, or contact HR for help.';
          setLoginError(message);
          showToast(message, 'error');
          return false;
        }

        return finishPendingRequest();
      }

      setLoginError(raw);
      showToast(raw, 'error');
      return false;
    }

    if (!data.session) {
      const message =
        'Account created. Check your email to confirm your address, then sign in. ' +
        'An admin must still approve your Orbis access before you can use the app.';
      setLoginError(message);
      showToast(message, 'success');
      setAuthMode('signin');
      return true;
    }

    return finishPendingRequest();
  } catch (err) {
    console.error('Registration failed:', err);
    setLoginError('Could not create account. Please try again.');
    showToast('Could not create account. Please try again.', 'error');
    return false;
  } finally {
    registeringAccount = false;
    setLoginLoading(false);
  }
}

export async function signIn(email?: string, password?: string) {
  const fields = readAuthFields();
  const resolvedEmail = String(email || fields.email).trim();
  const resolvedPassword = String(password || fields.password).trim();

  setLoginError('');

  if (!isSupabaseConfigured) {
    const message =
      'This site is missing Supabase configuration. In Vercel (or your host), set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for Production, then redeploy.';
    setLoginError(message);
    showToast(message, 'error');
    return null;
  }

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

    const role = typeof window.getUserRole === 'function' ? await window.getUserRole() : null;

    if (role === 'pending') {
      await supabase.auth.signOut();
      const message =
        'Your account is waiting for admin approval. You will be able to sign in after HR approves your access.';
      setLoginError(message);
      showToast(message, 'error');
      return null;
    }

    if (role === 'rejected') {
      await supabase.auth.signOut();
      const message = 'This account request was rejected. Contact HR if you believe this is an error.';
      setLoginError(message);
      showToast(message, 'error');
      return null;
    }

    if (!role) {
      const { error: regErr } = await supabase.rpc('orbis_register_account_request', {
        p_display_name: null,
      });

      if (!regErr) {
        await supabase.auth.signOut();
        const message =
          'Access request submitted. An HR admin must approve your account before you can sign in.';
        setLoginError(message);
        showToast(message, 'success');
        return null;
      }

      await supabase.auth.signOut();
      const message =
        'No approved Orbis access for this account. Contact HR or use Create account if you are new.';
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
  if (!isSupabaseConfigured) {
    showToast('Sign out skipped: Supabase is not configured.', 'error');
    return;
  }

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

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}

export function watchAuthState(
  callback: (event: string, session: Session | null) => void
): { unsubscribe: () => void } {
  if (!isSupabaseConfigured) {
    return { unsubscribe: () => {} };
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return { unsubscribe: () => subscription.unsubscribe() };
}

export async function waitForAuthSession(timeoutMs = 8000): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const existing = await getCurrentSession();
  if (existing) {
    return existing;
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(session);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      devLog('Auth wait event:', event, Boolean(session));
      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        finish(session);
      }
    });

    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}

/** Wire login / register / logout without inline HTML handlers. */
export function initAuthBindings(): void {
  const submitBtn = document.getElementById('authSubmitBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const email = document.getElementById('loginEmail');
  const password = document.getElementById('loginPassword');
  const signInTab = document.getElementById('authTabSignIn');
  const registerTab = document.getElementById('authTabRegister');

  if (submitBtn && submitBtn.getAttribute('data-auth-bound') !== '1') {
    submitBtn.setAttribute('data-auth-bound', '1');
    submitBtn.addEventListener('click', () => {
      if (authMode === 'register') {
        void registerAccount();
      } else {
        void signIn();
      }
    });
  }

  if (signInTab && signInTab.getAttribute('data-auth-bound') !== '1') {
    signInTab.setAttribute('data-auth-bound', '1');
    signInTab.addEventListener('click', () => setAuthMode('signin'));
  }

  if (registerTab && registerTab.getAttribute('data-auth-bound') !== '1') {
    registerTab.setAttribute('data-auth-bound', '1');
    registerTab.addEventListener('click', () => setAuthMode('register'));
  }

  const onEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (authMode === 'register') {
      void registerAccount();
    } else {
      void signIn();
    }
  };

  if (email && email.getAttribute('data-auth-bound') !== '1') {
    email.setAttribute('data-auth-bound', '1');
    email.addEventListener('keydown', onEnter);
  }

  if (password && password.getAttribute('data-auth-bound') !== '1') {
    password.setAttribute('data-auth-bound', '1');
    password.addEventListener('keydown', onEnter);
  }

  const confirmPassword = document.getElementById('registerPasswordConfirm');
  if (confirmPassword && confirmPassword.getAttribute('data-auth-bound') !== '1') {
    confirmPassword.setAttribute('data-auth-bound', '1');
    confirmPassword.addEventListener('keydown', onEnter);
  }

  if (logoutBtn && logoutBtn.getAttribute('data-auth-bound') !== '1') {
    logoutBtn.setAttribute('data-auth-bound', '1');
    logoutBtn.addEventListener('click', () => {
      void signOut();
    });
  }

  setAuthMode('signin');
}

declare global {
  interface Window {
    signIn?: typeof signIn;
    registerAccount?: typeof registerAccount;
    setAuthMode?: typeof setAuthMode;
    signOut?: typeof signOut;
    showAuthenticatedOrbisView?: () => void;
    showAuthView?: () => void;
    bootstrapOrbisAfterAuth?: () => Promise<void>;
    clearOrbisSessionState?: () => void;
    getUserRole?: () => Promise<string | null>;
  }
}

window.signIn = signIn;
window.registerAccount = registerAccount;
window.setAuthMode = setAuthMode;
window.signOut = signOut;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthBindings);
} else {
  initAuthBindings();
}
