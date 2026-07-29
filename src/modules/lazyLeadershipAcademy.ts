import {
  canAccessLeadershipAcademy,
  canManageLeadershipAcademy,
} from '../services/leadershipAcademyAccess';

type LeadershipAcademyModule = typeof import('./leadershipAcademy');

let modulePromise: Promise<LeadershipAcademyModule> | null = null;
let wired = false;

function ensureLeadershipAcademyModule(): Promise<LeadershipAcademyModule> {
  if (!modulePromise) {
    modulePromise = Promise.all([
      import('./leadershipAcademy'),
      import('./leadershipAcademyEditor'),
    ])
      .then(([mod]) => mod)
      .catch((err) => {
        modulePromise = null;
        throw err;
      });
  }
  return modulePromise;
}

async function wireLeadershipAcademyGlobals(mod: LeadershipAcademyModule): Promise<void> {
  if (wired) return;

  window.loadLeadershipAcademy = mod.loadLeadershipAcademy;
  window.ensureLeadershipAcademyLoaded = mod.ensureLeadershipAcademyLoaded;
  window.openLeadershipAcademyView = mod.openLeadershipAcademyView;
  window.applyLeadershipAcademyAccessUi = mod.applyLeadershipAcademyAccessUi;

  wired = true;
}

export function applyLeadershipAcademyAccess(): void {
  const allowed = canAccessLeadershipAcademy();
  document.querySelectorAll('[data-leadership-academy-access]').forEach((element) => {
    element.classList.toggle('hidden', !allowed);
  });

  const canManage = canManageLeadershipAcademy();
  document.querySelectorAll('[data-leadership-academy-manage]').forEach((element) => {
    element.classList.toggle('hidden', !canManage);
  });

  if (typeof window.applyLeadershipAcademyAccessUi === 'function') {
    window.applyLeadershipAcademyAccessUi();
  }
}

export async function loadLeadershipAcademy(force = false): Promise<void> {
  try {
    const mod = await ensureLeadershipAcademyModule();
    await wireLeadershipAcademyGlobals(mod);
    await mod.loadLeadershipAcademy(force);
  } catch (err) {
    console.error('[LeadershipAcademy] Module load failed:', err);
    window.showToast?.('Could not load Leadership Academy module.', 'error');
  }
}

export function ensureLeadershipAcademyLoaded(force = false): void {
  void ensureLeadershipAcademyModule()
    .then(async (mod) => {
      await wireLeadershipAcademyGlobals(mod);
      mod.ensureLeadershipAcademyLoaded(force);
    })
    .catch((err) => {
      console.error('[LeadershipAcademy] Module load failed:', err);
    });
}

export function openLeadershipAcademyView(
  tab?: import('../types/leadershipAcademyTypes').LeadershipAcademyTab
): void {
  void ensureLeadershipAcademyModule()
    .then(async (mod) => {
      await wireLeadershipAcademyGlobals(mod);
      mod.openLeadershipAcademyView(tab);
    })
    .catch((err) => console.error('[LeadershipAcademy] Navigation failed:', err));
}

window.loadLeadershipAcademy = loadLeadershipAcademy;
window.ensureLeadershipAcademyLoaded = ensureLeadershipAcademyLoaded;
window.openLeadershipAcademyView = openLeadershipAcademyView;
window.applyLeadershipAcademyAccess = applyLeadershipAcademyAccess;
