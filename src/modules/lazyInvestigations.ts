import { canAccessInvestigationsCenter } from '../services/investigationsAccess';

type InvestigationsModule = typeof import('./investigations');

let investigationsModulePromise: Promise<InvestigationsModule> | null = null;
let investigationsWired = false;

function ensureInvestigationsModule(): Promise<InvestigationsModule> {
  if (!investigationsModulePromise) {
    investigationsModulePromise = import('./investigations').catch((err) => {
      investigationsModulePromise = null;
      throw err;
    });
  }

  return investigationsModulePromise;
}

async function wireInvestigationsGlobals(mod: InvestigationsModule): Promise<void> {
  if (investigationsWired) return;

  window.loadInvestigations = mod.loadInvestigations;
  window.ensureInvestigationsLoaded = mod.ensureInvestigationsLoaded;
  window.ensureInvestigationsReady = mod.ensureInvestigationsReady;
  window.exportInvestigationsCsv = mod.exportInvestigationsCsv;
  window.openInvestigationsView = mod.openInvestigationsView;
  window.openNewInvestigationForm = mod.openNewInvestigationForm;
  window.openInvestigationDrawer = mod.openInvestigationDrawer;
  window.closeInvestigationDrawer = mod.closeInvestigationDrawer;
  window.saveInvestigationRecord = mod.saveInvestigationRecord;
  window.deleteInvestigationRecord = mod.deleteInvestigationRecord;
  window.deleteInvestigationById = mod.deleteInvestigationById;
  window.cancelInvestigationEdit = mod.cancelInvestigationEdit;
  window.isInvestigationDrawerOpen = mod.isInvestigationDrawerOpen;

  investigationsWired = true;
}

export function applyInvestigationsCenterAccess(): void {
  const canAccess = canAccessInvestigationsCenter();
  document.querySelectorAll('[data-investigations-access]').forEach((element) => {
    (element as HTMLElement).classList.toggle('hidden', !canAccess);
  });
}

export async function loadInvestigations(): Promise<void> {
  try {
    const mod = await ensureInvestigationsModule();
    await wireInvestigationsGlobals(mod);
    await mod.loadInvestigations();
  } catch (err) {
    console.error('[Investigations] Module load failed:', err);
    window.showToast?.('Could not load Investigations module.', 'error');
  }
}

export function ensureInvestigationsLoaded(force = false): void {
  void ensureInvestigationsModule()
    .then(async (mod) => {
      await wireInvestigationsGlobals(mod);
      mod.ensureInvestigationsLoaded(force);
    })
    .catch((err) => {
      console.error('[Investigations] Module load failed:', err);
    });
}

export async function ensureInvestigationsReady(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  await wireInvestigationsGlobals(mod);
  await mod.ensureInvestigationsReady();
}

export function exportInvestigationsCsv(): void {
  void ensureInvestigationsModule()
    .then(async (mod) => {
      await wireInvestigationsGlobals(mod);
      mod.exportInvestigationsCsv();
    })
    .catch((err) => console.error('[Investigations] Export failed:', err));
}

export function openInvestigationsView(): void {
  void ensureInvestigationsModule()
    .then(async (mod) => {
      await wireInvestigationsGlobals(mod);
      mod.openInvestigationsView();
    })
    .catch((err) => console.error('[Investigations] Navigation failed:', err));
}

export function openNewInvestigationForm(): void {
  void ensureInvestigationsModule()
    .then(async (mod) => {
      await wireInvestigationsGlobals(mod);
      mod.openNewInvestigationForm();
    })
    .catch((err) => console.error('[Investigations] Open form failed:', err));
}

export function openInvestigationDrawer(investigationId: string): Promise<void> {
  return ensureInvestigationsModule().then(async (mod) => {
    await wireInvestigationsGlobals(mod);
    return mod.openInvestigationDrawer(investigationId);
  });
}

export function closeInvestigationDrawer(): void {
  void ensureInvestigationsModule()
    .then(async (mod) => {
      await wireInvestigationsGlobals(mod);
      mod.closeInvestigationDrawer();
    })
    .catch((err) => console.error('[Investigations] Close drawer failed:', err));
}

export async function saveInvestigationRecord(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  await wireInvestigationsGlobals(mod);
  await mod.saveInvestigationRecord();
}

export async function deleteInvestigationRecord(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  await wireInvestigationsGlobals(mod);
  await mod.deleteInvestigationRecord();
}

export async function deleteInvestigationById(investigationId: string): Promise<void> {
  const mod = await ensureInvestigationsModule();
  await wireInvestigationsGlobals(mod);
  await mod.deleteInvestigationById(investigationId);
}

export function cancelInvestigationEdit(): void {
  void ensureInvestigationsModule()
    .then(async (mod) => {
      await wireInvestigationsGlobals(mod);
      mod.cancelInvestigationEdit();
    })
    .catch((err) => console.error('[Investigations] Cancel edit failed:', err));
}

export function isInvestigationDrawerOpen(): boolean {
  return Boolean(document.getElementById('investigationDrawer')?.classList.contains('open'));
}

window.loadInvestigations = loadInvestigations;
window.ensureInvestigationsLoaded = ensureInvestigationsLoaded;
window.ensureInvestigationsReady = ensureInvestigationsReady;
window.exportInvestigationsCsv = exportInvestigationsCsv;
window.openInvestigationsView = openInvestigationsView;
window.openNewInvestigationForm = openNewInvestigationForm;
window.openInvestigationDrawer = openInvestigationDrawer;
window.closeInvestigationDrawer = closeInvestigationDrawer;
window.saveInvestigationRecord = saveInvestigationRecord;
window.deleteInvestigationRecord = deleteInvestigationRecord;
window.deleteInvestigationById = deleteInvestigationById;
window.cancelInvestigationEdit = cancelInvestigationEdit;
window.isInvestigationDrawerOpen = isInvestigationDrawerOpen;
window.applyInvestigationsCenterAccess = applyInvestigationsCenterAccess;
