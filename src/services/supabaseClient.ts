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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Temporary legacy bridge during migration
(window as any).supabase = supabase;

console.log('Supabase client initialized');
