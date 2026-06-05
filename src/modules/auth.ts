import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseClient as supabase } from '../services/supabaseClient';
import { devLog } from '../utils/devLog';

const AUTH_CALLBACK_PARAM_NAMES = [
  'code',
  'token_hash',
  'access_token',
  'refresh_token',
  'type',
  'error',
  'error_description',
] as const;

const AUTH_SESSION_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED']);

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

function mapMagicLinkAuthError(error: { message?: string; status?: number; code?: string }): string {
  const message = String(error.message || '').trim();
  const code = String((error as { code?: string }).code || '').trim();
  const lower = message.toLowerCase();

  if (
    lower.includes('user not found') ||
    lower.includes('no user found') ||
    code === 'user_not_found'
  ) {
    return (
      'No login exists for this email yet. Ask HR to run employee portal setup, or try again after HR has activated your account.'
    );
  }

  if (
    code === 'signup_disabled' ||
    lower.includes('signups not allowed') ||
    lower.includes('sign in is not available') ||
    lower.includes('signups not allowed for otp')
  ) {
    return (
      'First-time employee login is not activated for this email. HR must run provision_employee_auth_users.py ' +
      '(or turn on "Allow new users to sign up" in Supabase → Authentication → Email). ' +
      'Also confirm the Email provider is enabled and https://orbis-btw.com is in Redirect URLs.'
    );
  }

  if (lower.includes('redirect') || lower.includes('invalid') && lower.includes('url')) {
    return 'Sign-in link could not be sent. Add this site URL to Supabase Auth → Redirect URLs, then try again.';
  }

  return message || 'Could not send sign-in link.';
}

export async function signInWithMagicLink(email?: string): Promise<boolean> {
  const emailInput = document.querySelector<HTMLInputElement>(
    '#email, #loginEmail, input[name="email"], input[type="email"]'
  );
  const resolvedEmail = String(email || emailInput?.value || '').trim();

  setLoginError('');

  if (!isSupabaseConfigured) {
    const message =
      'This site is missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  if (!resolvedEmail) {
    const message = 'Enter the personal or work email on your employee record to receive a sign-in link.';
    setLoginError(message);
    showToast(message, 'error');
    return false;
  }

  setLoginLoading(true);

  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: resolvedEmail,
      options: {
        emailRedirectTo: redirectTo,
        // Auth users are pre-created by HR; avoids requiring public sign-up in Supabase.
        shouldCreateUser: false,
      },
    });

    if (error) {
      const message = mapMagicLinkAuthError(error);
      setLoginError(message);
      showToast(message, 'error');
      return false;
    }

    const message = `Sign-in link sent to ${resolvedEmail}. Check your inbox (and spam).`;
    setLoginError(message);
    showToast(message, 'success');
    return true;
  } catch (err) {
    console.error('Magic link failed:', err);
    setLoginError('Could not send sign-in link. Please try again.');
    showToast('Could not send sign-in link. Please try again.', 'error');
    return false;
  } finally {
    setLoginLoading(false);
  }
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

function readAuthRedirectParams(): URLSearchParams {
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hash.includes('=') ? hash : '');

  AUTH_CALLBACK_PARAM_NAMES.forEach((name) => {
    const hashValue = hashParams.get(name);
    if (hashValue && !search.has(name)) {
      search.set(name, hashValue);
    }
  });

  return search;
}

export function isAuthRedirectUrl(): boolean {
  const params = readAuthRedirectParams();
  return AUTH_CALLBACK_PARAM_NAMES.some((name) => params.has(name));
}

export function readAuthRedirectError(): string {
  const params = readAuthRedirectParams();
  return String(params.get('error_description') || params.get('error') || '').trim();
}

export function clearAuthRedirectParams(): void {
  if (!isAuthRedirectUrl()) return;
  window.history.replaceState({}, document.title, window.location.pathname);
}

export function showAuthCallbackLoadingState(): void {
  if (!isAuthRedirectUrl()) return;

  const loginError = document.getElementById('loginError');
  if (loginError) {
    loginError.textContent = 'Completing sign-in from your email link…';
    loginError.classList.remove('hidden');
  }

  const magicLinkBtn = document.getElementById('loginMagicLinkBtn') as HTMLButtonElement | null;
  const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement | null;
  if (magicLinkBtn) magicLinkBtn.disabled = true;
  if (loginBtn) loginBtn.disabled = true;
}

function authRedirectFailureMessage(): string {
  return (
    'Sign-in link could not be completed. Request a new link, then open it promptly. ' +
    'If you requested the link on a computer, open the email on that same device, or try copying the link into Safari/Chrome instead of an in-app mail viewer.'
  );
}

async function recoverSessionFromAuthRedirect(): Promise<Session | null> {
  await supabase.auth.initialize();

  const params = readAuthRedirectParams();

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error && data.session) {
      return data.session;
    }
    devLog('Auth setSession from hash failed:', error?.message || error);
  }

  const tokenHash = params.get('token_hash');
  const otpType = params.get('type');
  if (tokenHash && otpType) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as 'email' | 'magiclink' | 'signup' | 'recovery' | 'invite' | 'email_change',
    });
    if (!error && data.session) {
      return data.session;
    }
    devLog('Auth verifyOtp failed:', error?.message || error);
  }

  const {
    data: { session: afterInit },
  } = await supabase.auth.getSession();
  if (afterInit) {
    return afterInit;
  }

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      return data.session;
    }
    devLog('Auth code exchange failed:', error?.message || error);
  }

  return null;
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

/**
 * Magic-link redirects land with tokens in the URL hash (implicit) or ?code= (PKCE)
 * before the client has a session. Wait for Supabase initialize + exchange.
 */
export async function waitForAuthSession(timeoutMs = 12000): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const existing = await getCurrentSession();
  if (existing) {
    return existing;
  }

  if (!isAuthRedirectUrl()) {
    return null;
  }

  const recovered = await recoverSessionFromAuthRedirect();
  if (recovered) {
    return recovered;
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
      devLog('Auth redirect wait event:', event, Boolean(session));
      if (session && AUTH_SESSION_EVENTS.has(event)) {
        finish(session);
      }
    });

    const timer = window.setTimeout(() => {
      void recoverSessionFromAuthRedirect().then((session) => finish(session));
    }, timeoutMs);

    void recoverSessionFromAuthRedirect().then((session) => {
      if (session) finish(session);
    });
  });
}

export function readAuthRedirectFailureMessage(): string {
  return authRedirectFailureMessage();
}

export function watchAuthState(callback: (event: string, session: unknown) => void) {
  if (!isSupabaseConfigured) {
    return { data: { subscription: { unsubscribe: () => undefined } } };
  }

  return supabase.auth.onAuthStateChange((event, session) => {
    devLog('Auth state changed:', event);
    callback(event, session);
  });
}

/** Wire login / logout without inline HTML handlers. */
export function initAuthBindings(): void {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const email = document.getElementById('loginEmail');
  const password = document.getElementById('loginPassword');

  const magicLinkBtn = document.getElementById('loginMagicLinkBtn');

  if (loginBtn && loginBtn.getAttribute('data-auth-bound') !== '1') {
    loginBtn.setAttribute('data-auth-bound', '1');
    loginBtn.addEventListener('click', () => {
      void signIn();
    });
  }

  if (magicLinkBtn && magicLinkBtn.getAttribute('data-auth-bound') !== '1') {
    magicLinkBtn.setAttribute('data-auth-bound', '1');
    magicLinkBtn.addEventListener('click', () => {
      void signInWithMagicLink();
    });
  }

  const onEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void signIn();
  };

  if (email && email.getAttribute('data-auth-bound') !== '1') {
    email.setAttribute('data-auth-bound', '1');
    email.addEventListener('keydown', onEnter);
  }

  if (password && password.getAttribute('data-auth-bound') !== '1') {
    password.setAttribute('data-auth-bound', '1');
    password.addEventListener('keydown', onEnter);
  }

  if (logoutBtn && logoutBtn.getAttribute('data-auth-bound') !== '1') {
    logoutBtn.setAttribute('data-auth-bound', '1');
    logoutBtn.addEventListener('click', () => {
      void signOut();
    });
  }
}

declare global {
  interface Window {
    signIn?: typeof signIn;
    signInWithMagicLink?: typeof signInWithMagicLink;
    signOut?: typeof signOut;
    showAuthenticatedOrbisView?: () => void;
    showAuthView?: () => void;
    bootstrapOrbisAfterAuth?: () => Promise<void>;
    clearOrbisSessionState?: () => void;
  }
}

window.signIn = signIn;
window.signInWithMagicLink = signInWithMagicLink;
window.signOut = signOut;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthBindings);
} else {
  initAuthBindings();
}
