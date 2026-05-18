// ============================================
// ORBIS SUPABASE CLIENT
// Centralized Supabase connection for TypeScript modules
// ============================================

import { supabase } from './services/supabaseClient.ts';
import './utils/helpers';

// Documents
import { initializeDocumentsLibrary } from './modules/documents';

import { signIn, signOut, watchAuthState, getCurrentSession } from './modules/auth';

import { loadEmployees, getEmployees } from './modules/employees';

// Current legacy app bridge
import * as app from '../js/app.js';

console.log('main.ts loaded');
console.log('Supabase bridge:', supabase);
console.log('initializeDocumentsLibrary import:', initializeDocumentsLibrary);

// Legacy JS bridge
(window as any).supabase = supabase;
(window as any).supabaseClient = supabase;

window.addEventListener('DOMContentLoaded', async () => {
  console.log('Orbis booted via main.ts');

  const session = await getCurrentSession();
  console.log('Current session:', session);

  watchAuthState((event, sessionData) => {
    console.log('Auth event:', event, sessionData);
  });

  // Do not load protected data until authenticated
  if (!session) {
    console.log('No active session detected. Waiting for sign in...');
  } else {
    try {
      console.log('Initializing Documents Library...');
      await initializeDocumentsLibrary();
      console.log('Documents Library initialized successfully');
    } catch (err) {
      console.error('Documents Library failed to initialize:', err);
    }

    try {
      console.log('Loading employees from employees.ts...');
      await loadEmployees();
      console.log('Employees loaded:', getEmployees().length);
    } catch (err) {
      console.error('Employee module failed to load employees:', err);
    }
  }

  // TEMP: expose functions for HTML onclick bridge during migration.
  (window as any).signIn = signIn;
  (window as any).signOut = signOut;

  (window as any).loadAllDashboardData =
    (window as any).loadAllDashboardData || (app as any).loadAllDashboardData;

  (window as any).openNewEmployeeForm =
    (window as any).openNewEmployeeForm || (app as any).openNewEmployeeForm;

  (window as any).openCandidatesView =
    (window as any).openCandidatesView || (app as any).openCandidatesView;
});
