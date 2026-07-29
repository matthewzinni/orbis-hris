import {
  canManageLeadershipAcademy,
  canViewLeadershipAcademyOrg,
} from '../services/leadershipAcademyAccess';
import { fetchLeadershipAcademyFoundation } from '../data/leadershipAcademyStore';
import { switchMainView } from '../ui/navigation';
import type { LeadershipAcademyTab } from '../types/leadershipAcademyTypes';
import { LEADERSHIP_ACADEMY_MODULE_VERSION } from '../types/leadershipAcademyTypes';

let activeTab: LeadershipAcademyTab = 'dashboard';
let moduleHydrated = false;
let bindingsReady = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setText(id: string, value: string): void {
  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

export function applyLeadershipAcademyAccessUi(): void {
  const canManage = canManageLeadershipAcademy();
  const canViewOrg = canViewLeadershipAcademyOrg();

  document.querySelectorAll('[data-leadership-academy-manage]').forEach((element) => {
    element.classList.toggle('hidden', !canManage);
  });

  document.querySelectorAll('[data-leadership-academy-org]').forEach((element) => {
    element.classList.toggle('hidden', !canViewOrg);
  });

  const readOnlyBanner = document.getElementById('leadershipAcademyReadOnlyBanner');
  if (readOnlyBanner) {
    readOnlyBanner.classList.toggle('hidden', canManage);
  }

  document.querySelectorAll('[data-leadership-academy-tab]').forEach((button) => {
    const tab = String((button as HTMLElement).dataset.leadershipAcademyTab || '') as LeadershipAcademyTab;
    const manageTabs: LeadershipAcademyTab[] = [
      'programs',
      'participants',
      'workshops',
      'coaching',
      'goals',
      'competencies',
      'philosophy',
      'reports',
    ];
    const orgTabs: LeadershipAcademyTab[] = ['participants', 'workshops', 'coaching', 'goals', 'reports'];

    let allowed = true;
    if (manageTabs.includes(tab) && !canManage) {
      allowed = orgTabs.includes(tab) ? canViewOrg : false;
    }

    (button as HTMLElement).classList.toggle('hidden', !allowed);
    (button as HTMLButtonElement).disabled = !allowed;
  });
}

function renderActiveTabPanel(): void {
  document.querySelectorAll('[data-leadership-academy-panel]').forEach((panel) => {
    const panelTab = String((panel as HTMLElement).dataset.leadershipAcademyPanel || '');
    panel.classList.toggle('hidden', panelTab !== activeTab);
  });

  document.querySelectorAll('[data-leadership-academy-tab]').forEach((button) => {
    const tab = String((button as HTMLElement).dataset.leadershipAcademyTab || '');
    button.classList.toggle('active', tab === activeTab);
  });
}

function renderFoundationSummary(input: {
  tablesReady: boolean;
  tierCount: number;
  courseCount: number;
  enrollmentCount: number;
}): void {
  const statusEl = safeGet('leadershipAcademyFoundationStatus');
  if (!statusEl) return;

  if (!input.tablesReady) {
    statusEl.innerHTML =
      '<div class="leadership-academy-empty-state">' +
      '<p><strong>Database setup pending.</strong></p>' +
      '<p class="muted">Leadership Academy tables are not available yet. Run the latest Supabase migration, then refresh.</p>' +
      '</div>';
    return;
  }

  statusEl.innerHTML =
    '<div class="leadership-academy-summary-grid">' +
    `<div class="leadership-academy-summary-card"><div class="label">Program tiers</div><div class="value">${esc(input.tierCount)}</div></div>` +
    `<div class="leadership-academy-summary-card"><div class="label">Courses</div><div class="value">${esc(input.courseCount)}</div></div>` +
    `<div class="leadership-academy-summary-card"><div class="label">Enrollments</div><div class="value">${esc(input.enrollmentCount)}</div></div>` +
    '</div>' +
    '<p class="muted leadership-academy-phase-note">Phase 1 · Slice 1 foundation is live. Catalog authoring and participant flows arrive in upcoming slices.</p>';
}

function bindLeadershipAcademyEvents(): void {
  if (bindingsReady) return;
  bindingsReady = true;

  document.getElementById('refreshLeadershipAcademyBtn')?.addEventListener('click', () => {
    void loadLeadershipAcademy(true);
  });

  document.querySelectorAll('[data-leadership-academy-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = String((button as HTMLElement).dataset.leadershipAcademyTab || '') as LeadershipAcademyTab;
      if (!tab || (button as HTMLButtonElement).disabled) return;
      activeTab = tab;
      renderActiveTabPanel();
    });
  });
}

export async function loadLeadershipAcademy(force = false): Promise<void> {
  applyLeadershipAcademyAccessUi();
  bindLeadershipAcademyEvents();

  if (moduleHydrated && !force) {
    renderActiveTabPanel();
    return;
  }

  setText('leadershipAcademyFoundationStatus', 'Loading Leadership Academy…');

  try {
    const foundation = await fetchLeadershipAcademyFoundation(force);
    renderFoundationSummary({
      tablesReady: foundation.tablesReady,
      tierCount: foundation.tiers.length,
      courseCount: foundation.courses.length,
      enrollmentCount: foundation.enrollments.length,
    });

    setText(
      'leadershipAcademyModuleVersion',
      `Module ${LEADERSHIP_ACADEMY_MODULE_VERSION}${foundation.tablesReady ? '' : ' · tables pending'}`
    );

    moduleHydrated = true;
    renderActiveTabPanel();
  } catch (err) {
    console.error('[LeadershipAcademy] Load failed:', err);
    setText('leadershipAcademyFoundationStatus', 'Could not load Leadership Academy.');
    showToast('Could not load Leadership Academy.', 'error');
  }
}

export function ensureLeadershipAcademyLoaded(force = false): void {
  applyLeadershipAcademyAccessUi();
  void loadLeadershipAcademy(force);
}

export function openLeadershipAcademyView(tab: LeadershipAcademyTab = 'dashboard'): void {
  activeTab = tab;
  switchMainView('leadershipAcademyView');
  ensureLeadershipAcademyLoaded(true);
}

const globalRef = globalThis as typeof globalThis & {
  loadLeadershipAcademy?: typeof loadLeadershipAcademy;
  ensureLeadershipAcademyLoaded?: typeof ensureLeadershipAcademyLoaded;
  openLeadershipAcademyView?: typeof openLeadershipAcademyView;
  applyLeadershipAcademyAccessUi?: typeof applyLeadershipAcademyAccessUi;
};

globalRef.loadLeadershipAcademy = loadLeadershipAcademy;
globalRef.ensureLeadershipAcademyLoaded = ensureLeadershipAcademyLoaded;
globalRef.openLeadershipAcademyView = openLeadershipAcademyView;
globalRef.applyLeadershipAcademyAccessUi = applyLeadershipAcademyAccessUi;
