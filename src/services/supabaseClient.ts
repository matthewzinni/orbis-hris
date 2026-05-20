import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables.');
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
export const supabase = supabaseClient;

((window as any).supabaseClient = supabaseClient);
(window as any).supabase = supabaseClient;

console.log('Supabase client initialized');

export default supabaseClient;
