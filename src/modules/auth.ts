import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseClient as supabase } from '../services/supabaseClient';
import { devLog } from '../utils/devLog';

type AuthMode = 'signin' | 'register';

let authMode: AuthMode = 'signin';
let registeringAccount = false;
let signInFlowActive = false;
let authBindingsInitialized = false;

type AuthFieldSnapshot = {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
};

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
  const modeToggle = document.getElementById('authModeToggle') as HTMLButtonElement | null;

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
  if (modeToggle) modeToggle.disabled = busy;
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

function readAuthFields(): AuthFieldSnapshot {
  const form = document.getElementById('authForm') as HTMLFormElement | null;
  const fromForm = form ? new FormData(form) : null;

  const emailInput = document.querySelector<HTMLInputElement>(
    '#email, #loginEmail, input[name="email"], input[type="email"]'
  );
  const passwordInput = document.querySelector<HTMLInputElement>(
    '#password, #loginPassword, input[name="password"], input[type="password"]'
  );
  const confirmInput = document.getElementById('registerPasswordConfirm') as HTMLInputElement | null;
  const displayInput = document.getElementById('registerDisplayName') as HTMLInputElement | null;

  const email = String(fromForm?.get('email') || emailInput?.value || '').trim();
  const password = String(fromForm?.get('password') || passwordInput?.value || '').trim();
  const confirmPassword = String(
    fromForm?.get('passwordConfirm') || confirmInput?.value || ''
  ).trim();
  const displayName = String(fromForm?.get('displayName') || displayInput?.value || '').trim();

  return { email, password, confirmPassword, displayName };
}

function restoreAuthFields(snapshot: AuthFieldSnapshot): void {
  const emailInput = document.getElementById('loginEmail') as HTMLInputElement | null;
  const passwordInput = document.getElementById('loginPassword') as HTMLInputElement | null;

  if (emailInput && snapshot.email) {
    emailInput.value = snapshot.email;
  }
  if (passwordInput && snapshot.password) {
    passwordInput.value = snapshot.password;
  }
}

export function isSignInFlowActive(): boolean {
  return signInFlowActive;
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
  const submitBtn = document.getElementById('authSubmitBtn') as HTMLButtonElement | null;
  const modeToggle = document.getElementById('authModeToggle') as HTMLButtonElement | null;

  registerPanel?.classList.toggle('hidden', mode !== 'register');

  if (submitBtn) {
    submitBtn.textContent = mode === 'register' ? 'Create account' : 'Sign in';
  }

  if (modeToggle) {
    modeToggle.textContent =
      mode === 'register'
        ? 'Already have an account? Sign in'
        : 'Need an account? Create one';
    modeToggle.setAttribute('aria-pressed', mode === 'register' ? 'true' : 'false');
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

export async function registerAccount(fields?: AuthFieldSnapshot): Promise<boolean> {
  setLoginError('');

  if (!isSupabaseConfigured) {
    const message =
      'This site is missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  const { email, password, confirmPassword, displayName } = fields || readAuthFields();

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
  const snapshot = readAuthFields();
  const resolvedEmail = String(email ?? snapshot.email).trim();
  const resolvedPassword = String(password ?? snapshot.password).trim();

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
    restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
    return null;
  }

  setLoginLoading(true);
  signInFlowActive = true;
  let signedIn = false;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: resolvedPassword,
    });

    if (error) {
      const message = error.message || 'Sign in failed.';
      setLoginError(message);
      showToast(message, 'error');
      restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
      return null;
    }

    const role = typeof window.getUserRole === 'function' ? await window.getUserRole() : null;

    if (role === 'pending') {
      await supabase.auth.signOut();
      const message =
        'Your account is waiting for admin approval. You will be able to sign in after HR approves your access.';
      setLoginError(message);
      showToast(message, 'error');
      restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
      return null;
    }

    if (role === 'rejected') {
      await supabase.auth.signOut();
      const message = 'This account request was rejected. Contact HR if you believe this is an error.';
      setLoginError(message);
      showToast(message, 'error');
      restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
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
        restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
        return null;
      }

      await supabase.auth.signOut();
      const message =
        'No approved Orbis access for this account. Contact HR or use Create account if you are new.';
      setLoginError(message);
      showToast(message, 'error');
      restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
      return null;
    }

    signedIn = true;
    showToast('Signed in successfully.');
    await enterAuthenticatedApp();
    return data;
  } catch (err) {
    console.error('Sign in failed:', err);
    setLoginError('Sign in failed. Please try again.');
    showToast('Sign in failed. Please try again.', 'error');
    restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
    return null;
  } finally {
    signInFlowActive = false;
    setLoginLoading(false);
    if (!signedIn) {
      restoreAuthFields({ ...snapshot, email: resolvedEmail, password: resolvedPassword });
    }
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

let authSubmitInFlight = false;

async function submitAuthForm(): Promise<void> {
  if (authSubmitInFlight) return;

  // Read immediately — never blur first (iOS clears autofill fields on blur).
  const snapshot = readAuthFields();

  authSubmitInFlight = true;
  try {
    if (authMode === 'register') {
      await registerAccount(snapshot);
      return;
    }

    await signIn(snapshot.email, snapshot.password);
  } finally {
    authSubmitInFlight = false;
  }
}

/** Wire login / register / logout without inline HTML handlers. */
export function initAuthBindings(): void {
  const authForm = document.getElementById('authForm');
  const submitBtn = document.getElementById('authSubmitBtn');
  const passwordInput = document.getElementById('loginPassword');
  const logoutBtn = document.getElementById('logoutBtn');
  const modeToggle = document.getElementById('authModeToggle');

  const handleAuthSubmit = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    void submitAuthForm();
  };

  if (authForm && authForm.getAttribute('data-auth-bound') !== '1') {
    authForm.setAttribute('data-auth-bound', '1');
    authForm.addEventListener('submit', handleAuthSubmit, true);
  }

  if (submitBtn && submitBtn.getAttribute('data-auth-bound') !== '1') {
    submitBtn.setAttribute('data-auth-bound', '1');
    submitBtn.addEventListener('click', handleAuthSubmit, true);
  }

  if (passwordInput && passwordInput.getAttribute('data-auth-bound') !== '1') {
    passwordInput.setAttribute('data-auth-bound', '1');
    passwordInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      void submitAuthForm();
    });
  }

  if (modeToggle && modeToggle.getAttribute('data-auth-bound') !== '1') {
    modeToggle.setAttribute('data-auth-bound', '1');
    modeToggle.addEventListener('click', () => {
      setAuthMode(authMode === 'register' ? 'signin' : 'register');
    });
  }

  if (logoutBtn && logoutBtn.getAttribute('data-auth-bound') !== '1') {
    logoutBtn.setAttribute('data-auth-bound', '1');
    logoutBtn.addEventListener('click', () => {
      void signOut();
    });
  }

  if (!authBindingsInitialized) {
    authBindingsInitialized = true;
    setAuthMode('signin');
  }
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
    isSignInFlowActive?: () => boolean;
  }
}

window.isSignInFlowActive = isSignInFlowActive;

window.signIn = signIn;
window.registerAccount = registerAccount;
window.setAuthMode = setAuthMode;
window.signOut = signOut;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthBindings);
} else {
  initAuthBindings();
}
