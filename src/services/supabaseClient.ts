import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/** False when production build was deployed without Vercel/host env vars. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.error(
    '[Orbis] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add both in your host ' +
      '(e.g. Vercel → Project → Settings → Environment Variables for Production), then redeploy. ' +
      'Copy values from Supabase → Project Settings → API.'
  );
}

// Never throw at module load: auth must register signIn on window before the login form is used.
const fallbackUrl = 'https://orbis-config-missing.invalid';
const fallbackKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.orbis-placeholder-not-a-real-key';

export const supabaseClient = createClient(
  isSupabaseConfigured ? supabaseUrl : fallbackUrl,
  isSupabaseConfigured ? supabaseAnonKey : fallbackKey,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
    },
  }
);
export const supabase = supabaseClient;

declare global {
  interface Window {
    supabaseClient: typeof supabaseClient;
    supabase: typeof supabase;
  }
}

window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;

export default supabaseClient;
