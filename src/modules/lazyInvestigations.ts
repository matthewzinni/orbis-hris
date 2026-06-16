import { canAccessInvestigationsCenter } from '../services/investigationsAccess';

type InvestigationsModule = typeof import('./investigations');

let investigationsModulePromise: Promise<InvestigationsModule> | null = null;
let investigationsModule: InvestigationsModule | null = null;

async function ensureInvestigationsModule(): Promise<InvestigationsModule> {
  if (investigationsModule) {
    return investigationsModule;
  }

  if (!investigationsModulePromise) {
    investigationsModulePromise = import('./investigations').then((mod) => {
      investigationsModule = mod;
      return mod;
    });
  }

  return investigationsModulePromise;
}

export function applyInvestigationsCenterAccess(): void {
  const canAccess = canAccessInvestigationsCenter();
  document.querySelectorAll('[data-investigations-access]').forEach((element) => {
    (element as HTMLElement).classList.toggle('hidden', !canAccess);
  });
}

export async function loadInvestigations(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  return mod.loadInvestigations();
}

export function ensureInvestigationsLoaded(force = false): void {
  if (!canAccessInvestigationsCenter()) return;

  if (!force && !investigationsModule) {
    applyInvestigationsCenterAccess();
    return;
  }

  void (async () => {
    const mod = await ensureInvestigationsModule();
    mod.ensureInvestigationsLoaded(force);
  })();
}

export function openInvestigationsView(): void {
  if (typeof window.switchMainView === 'function') {
    window.switchMainView('investigationsView');
    return;
  }

  ensureInvestigationsLoaded(true);
}

export async function openInvestigationDrawer(investigationId: string): Promise<void> {
  const mod = await ensureInvestigationsModule();
  return mod.openInvestigationDrawer(investigationId);
}

export function closeInvestigationDrawer(): void {
  if (!investigationsModule) return;
  investigationsModule.closeInvestigationDrawer();
}

export function openNewInvestigationForm(): void {
  void ensureInvestigationsModule().then((mod) => mod.openNewInvestigationForm());
}

export function cancelInvestigationEdit(): void {
  void ensureInvestigationsModule().then((mod) => mod.cancelInvestigationEdit());
}

export async function saveInvestigationRecord(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  return mod.saveInvestigationRecord();
}

export async function deleteInvestigationRecord(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  return mod.deleteInvestigationRecord();
}

export async function deleteInvestigationById(investigationId: string): Promise<void> {
  const mod = await ensureInvestigationsModule();
  return mod.deleteInvestigationById(investigationId);
}

export function exportInvestigationsCsv(): void {
  void ensureInvestigationsModule().then((mod) => mod.exportInvestigationsCsv());
}

export function isInvestigationDrawerOpen(): boolean {
  return investigationsModule?.isInvestigationDrawerOpen() ?? false;
}

export async function generateInvestigationGuidance(): Promise<void> {
  const mod = await ensureInvestigationsModule();
  return mod.generateInvestigationGuidance();
}

function wireInvestigationsWindowGlobals(): void {
  const globalRef = globalThis as typeof globalThis & Window;

  globalRef.loadInvestigations = loadInvestigations;
  globalRef.ensureInvestigationsLoaded = ensureInvestigationsLoaded;
  globalRef.exportInvestigationsCsv = exportInvestigationsCsv;
  globalRef.openInvestigationsView = openInvestigationsView;
  globalRef.openNewInvestigationForm = openNewInvestigationForm;
  globalRef.openInvestigationDrawer = openInvestigationDrawer;
  globalRef.closeInvestigationDrawer = closeInvestigationDrawer;
  globalRef.saveInvestigationRecord = saveInvestigationRecord;
  globalRef.deleteInvestigationRecord = deleteInvestigationRecord;
  globalRef.deleteInvestigationById = deleteInvestigationById;
  globalRef.cancelInvestigationEdit = cancelInvestigationEdit;
  globalRef.isInvestigationDrawerOpen = isInvestigationDrawerOpen;
  globalRef.applyInvestigationsCenterAccess = applyInvestigationsCenterAccess;
  globalRef.generateInvestigationGuidance = generateInvestigationGuidance;
}

wireInvestigationsWindowGlobals();
