/**
 * "First time here or forgot your password?" — email a link, then set a password.
 *
 * Accounts HR creates ahead of time have no password, and there was no way to set one. The
 * emailed link (Supabase recovery, implicit flow) returns to the site with
 * #access_token=…&refresh_token=…&type=recovery. The Supabase client has detectSessionInUrl off,
 * so we read the hash ourselves BEFORE the app boots, hold the tokens in memory, and only sign in
 * (setSession → updateUser) once the new password is submitted. Then the page reloads into Orbis.
 */
import { supabaseClient } from '../services/supabaseClient';

export type PasswordLink =
  | { kind: 'recovery'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string };

export const MIN_PASSWORD_LENGTH = 8;

// Captured when this module loads: Orbis's section router rewrites location.hash during startup,
// which would otherwise erase the email link's tokens before startPasswordSetupFromUrl runs.
const initialHash = typeof window !== 'undefined' ? String(window.location?.hash || '') : '';

/** Parse a URL hash from a Supabase email link (null when it isn't one). */
export function readPasswordLink(hash: string): PasswordLink | null {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);

  const errorCode = params.get('error_code') || params.get('error');
  if (errorCode) {
    const expired = /expired|otp_expired|access_denied/i.test(`${errorCode} ${params.get('error_description') || ''}`);
    return {
      kind: 'error',
      message: expired
        ? 'That link has expired or was already used. Enter your email and send a new one.'
        : 'That link did not work. Enter your email and send a new one.',
    };
  }

  const type = params.get('type');
  const accessToken = params.get('access_token') || '';
  const refreshToken = params.get('refresh_token') || '';
  if ((type === 'recovery' || type === 'invite') && accessToken && refreshToken) {
    return { kind: 'recovery', accessToken, refreshToken };
  }
  return null;
}

export function validateNewPassword(password: string, confirm: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setMessage(id: string, message: string, tone: 'error' | 'success' | 'muted' = 'error'): void {
  const box = el(id);
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('hidden', !message);
  box.style.color = tone === 'success' ? 'var(--success, #15803d)' : '';
  box.classList.toggle('login-error', tone === 'error');
}

/** Send the "set your password" email. The reply never reveals whether the email has an account. */
export async function requestPasswordSetupEmail(rawEmail: string): Promise<void> {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    setMessage('loginError', 'Enter your email above, then click the link again.');
    return;
  }
  const btn = el<HTMLButtonElement>('authPasswordLinkBtn');
  if (btn) btn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error && /rate|seconds|too many/i.test(error.message || '')) {
      setMessage('loginError', 'A link was sent very recently. Wait a minute, check your email, then try again.');
      return;
    }
    if (error) console.warn('[PasswordSetup] resetPasswordForEmail:', error.message);
    setMessage(
      'loginError',
      `If ${email} has an Orbis account, we just emailed a link to set your password. Check your inbox and spam folder.`,
      'success'
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}

function showSetPasswordPanel(link: Extract<PasswordLink, { kind: 'recovery' }>): void {
  el('authForm')?.classList.add('hidden');
  el('authSetPasswordPanel')?.classList.remove('hidden');
  el<HTMLInputElement>('setPasswordInput')?.focus();

  const form = el<HTMLFormElement>('authSetPasswordPanel');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = el<HTMLInputElement>('setPasswordInput')?.value || '';
    const confirm = el<HTMLInputElement>('setPasswordConfirmInput')?.value || '';
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setMessage('setPasswordError', problem);
      return;
    }
    const btn = el<HTMLButtonElement>('setPasswordSubmitBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving…';
    }
    try {
      const { error: sessionErr } = await supabaseClient.auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
      if (sessionErr) {
        throw new Error('That link has expired or was already used. Click Back to sign in and send yourself a new one.');
      }
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw new Error(error.message || 'Could not save your password.');
      setMessage('setPasswordError', 'Password saved. Opening Orbis…', 'success');
      window.location.replace(`${window.location.origin}/`);
    } catch (err) {
      setMessage('setPasswordError', err instanceof Error ? err.message : 'Could not save your password.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save password';
      }
    }
  });
}

/**
 * Call at startup, before the app reads the session. Returns true when the page was opened from a
 * password email link and the set-password screen has taken over (the caller must not boot the app).
 */
export function startPasswordSetupFromUrl(showAuthView: () => void): boolean {
  const link = readPasswordLink(initialHash);
  if (!link) return false;

  // Don't leave tokens in the address bar or browser history.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  if (link.kind === 'error') {
    // Let the normal sign-in screen load; just explain why the link didn't work.
    setMessage('loginError', link.message);
    return false;
  }
  showAuthView();
  showSetPasswordPanel(link);
  return true;
}

export function initPasswordSetupLink(): void {
  const btn = el<HTMLButtonElement>('authPasswordLinkBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    void requestPasswordSetupEmail(el<HTMLInputElement>('loginEmail')?.value || '');
  });
}
