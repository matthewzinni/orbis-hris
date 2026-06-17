// Back-compat re-exports — investigations loads eagerly from main.ts (no dynamic chunk).
export {
  applyInvestigationsCenterAccess,
  cancelInvestigationEdit,
  closeInvestigationDrawer,
  deleteInvestigationById,
  deleteInvestigationRecord,
  ensureInvestigationsLoaded,
  ensureInvestigationsReady,
  exportInvestigationsCsv,
  generateInvestigationGuidance,
  isInvestigationDrawerOpen,
  loadInvestigations,
  openInvestigationDrawer,
  openInvestigationsView,
  openNewInvestigationForm,
  saveInvestigationRecord,
} from './investigations';
