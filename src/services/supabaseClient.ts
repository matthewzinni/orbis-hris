import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables.');
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
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
