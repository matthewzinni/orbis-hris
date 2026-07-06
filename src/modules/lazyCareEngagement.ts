import {
  canAccessCareEngagementCenter,
  canManageCareEngagementRecords,
} from '../services/careEngagementAccess';

type CareEngagementModule = typeof import('./careEngagement');

const CARE_MATRIX_HELP_MANAGE =
  'Map support across stakeholder groups and care dimensions. Click a cell for details; double-click to edit, or use Edit in the detail panel below.';
const CARE_MATRIX_HELP_VIEW =
  'Map support across stakeholder groups and care dimensions. Click a cell for details. Editing matrix cells requires HR admin access.';

let careModulePromise: Promise<CareEngagementModule> | null = null;
let careWired = false;

function ensureCareEngagementModule(): Promise<CareEngagementModule> {
  if (!careModulePromise) {
    careModulePromise = Promise.all([
      import('./careEngagement'),
      import('./careEngagementEditor'),
    ]).then(([care]) => care).catch((err) => {
      careModulePromise = null;
      throw err;
    });
  }

  return careModulePromise;
}

async function wireCareEngagementGlobals(mod: CareEngagementModule): Promise<void> {
  if (careWired) return;

  window.loadCareEngagement = mod.loadCareEngagement;
  window.ensureCareEngagementLoaded = mod.ensureCareEngagementLoaded;
  window.openCareEngagementView = mod.openCareEngagementView;

  careWired = true;
}

export function applyCareEngagementCenterAccess(): void {
  const allowed = canAccessCareEngagementCenter();
  document.querySelectorAll('[data-care-engagement-access]').forEach((element) => {
    element.classList.toggle('hidden', !allowed);
  });

  const canManage = canManageCareEngagementRecords();
  document.querySelectorAll('[data-care-engagement-manage]').forEach((element) => {
    element.classList.toggle('hidden', !canManage);
  });

  document.querySelectorAll('#careTrackerCard thead th:last-child').forEach((cell) => {
    cell.classList.toggle('hidden', !canManage);
  });

  const readOnlyBanner = document.getElementById('careEngagementReadOnlyBanner');
  if (readOnlyBanner) {
    readOnlyBanner.classList.toggle('hidden', !allowed || canManage);
  }

  const matrixHelp = document.getElementById('careMatrixHelpText');
  if (matrixHelp) {
    matrixHelp.textContent = canManage ? CARE_MATRIX_HELP_MANAGE : CARE_MATRIX_HELP_VIEW;
  }
}

export async function loadCareEngagement(force = false): Promise<void> {
  try {
    const mod = await ensureCareEngagementModule();
    await wireCareEngagementGlobals(mod);
    await mod.loadCareEngagement(force);
  } catch (err) {
    console.error('[CareEngagement] Module load failed:', err);
    window.showToast?.('Could not load Care & Engagement module.', 'error');
  }
}

export function ensureCareEngagementLoaded(force = false): void {
  void ensureCareEngagementModule()
    .then(wireCareEngagementGlobals)
    .then((mod) => {
      mod.ensureCareEngagementLoaded(force);
    })
    .catch((err) => {
      console.error('[CareEngagement] Module load failed:', err);
    });
}

export function openCareEngagementView(): void {
  void ensureCareEngagementModule()
    .then(wireCareEngagementGlobals)
    .then((mod) => mod.openCareEngagementView())
    .catch((err) => console.error('[CareEngagement] Navigation failed:', err));
}

window.loadCareEngagement = loadCareEngagement;
window.ensureCareEngagementLoaded = ensureCareEngagementLoaded;
window.openCareEngagementView = openCareEngagementView;
window.applyCareEngagementCenterAccess = applyCareEngagementCenterAccess;
