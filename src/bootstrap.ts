/**
 * Shared window bridges used during the JS → TS migration.
 * Legacy script tags remain for UI not yet ported; TS modules own data + save flows.
 */

import { appState } from './core/state';

export function syncEmployeeStateFromWindow(): void {
  const win = window as {
    EMPLOYEES?: unknown[];
    currentEmployeeRoster?: unknown[];
  };
  const employees = win.EMPLOYEES;

  if (Array.isArray(employees)) {
    appState.employees = employees;
    win.currentEmployeeRoster = employees;
  }
}

export function markOrbisMainBoot(): void {
  window.__orbisMainBoot = true;
}

export function markOrbisBootComplete(): void {
  window.__orbisBootComplete = true;
}
