import * as SupabaseService from '../services/supabaseClient';

const supabase =
  (SupabaseService as any).supabaseClient ||
  (SupabaseService as any).supabase ||
  (window as any).supabaseClient ||
  (window as any).supabase;

if (!supabase) {
  console.error('Supabase client export was not found. Check src/services/supabaseClient.ts exports.');
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

  if (!resolvedEmail || !resolvedPassword) {
    alert('Please enter both email and password.');
    return null;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password: resolvedPassword,
  });

  if (error) {
    alert(error.message || 'Sign in failed.');
    throw error;
  }

  window.location.reload();
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
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

// Temporary global bridge for legacy inline onclick handlers
(window as any).signIn = signIn;
(window as any).signOut = signOut;
