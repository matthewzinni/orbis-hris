import { supabaseClient } from '../services/supabaseClient';

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

  const { data, error } = await supabaseClient.auth.signInWithPassword({
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
  await supabaseClient.auth.signOut();
  window.location.reload();
}

export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  return session;
}

export function watchAuthState(callback: (event: string, session: unknown) => void) {
  return supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    callback(event, session);
  });
}

// Temporary global bridge for legacy inline onclick handlers
(window as any).signIn = signIn;
(window as any).signOut = signOut;

/// <reference types="vite/client" />

// ============================================
// ORBIS SUPABASE CLIENT
// Centralized Supabase connection for TypeScript modules
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
export const supabase = supabaseClient;

// Temporary legacy bridge during migration
(window as any).supabase = supabaseClient;
(window as any).supabaseClient = supabaseClient;

console.log('Supabase client initialized');