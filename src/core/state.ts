// ============================================
// ORBIS GLOBAL APP STATE
// Shared application state during migration
// ============================================

export type OrbisAppState = {
  employees: any[];
  candidates: any[];
  currentEmployee: any | null;
  reviews: any[];
  incidents: any[];
  disciplineReports: any[];
};

export const appState: OrbisAppState = {
  employees: [],
  candidates: [],
  currentEmployee: null,
  reviews: [],
  incidents: [],
  disciplineReports: [],
};

// Temporary legacy bridge during migration
(window as any).appState = appState;

console.log('Global app state initialized');
