import { isMobileLayout } from './mobileLayout';

const MOBILE_SHEET_IDS = [
  'orbisMobileMoreSheet',
  'orbisMobileNotificationsSheet',
  'orbisMobileRosterFilterSheet',
] as const;

const MODULE_DRAWER_IDS = [
  'employeeDrawer',
  'candidateDrawer',
  'investigationDrawer',
  'operationsIssueDrawer',
  'careEngagementDrawer',
  'janusAccountDrawer',
] as const;

export type ModuleDrawerId = (typeof MODULE_DRAWER_IDS)[number];

function anyMobileSheetOpen(): boolean {
  return MOBILE_SHEET_IDS.some((id) => document.getElementById(id)?.classList.contains('open'));
}

function isDrawerEffectivelyOpen(id: string): boolean {
  const drawer = document.getElementById(id);
  if (!drawer) return false;
  if (drawer.classList.contains('hidden')) return false;
  return drawer.classList.contains('open');
}

function anyDrawerOpen(): boolean {
  return MODULE_DRAWER_IDS.some((id) => isDrawerEffectivelyOpen(id));
}

/** Strip leftover fullscreen inline styles from closed drawers so they cannot block scroll. */
function clearClosedDrawerGhostStyles(): void {
  MODULE_DRAWER_IDS.forEach((id) => {
    if (isDrawerEffectivelyOpen(id)) return;
    const drawer = document.getElementById(id);
    if (!drawer) return;
    if (!drawer.getAttribute('style')) return;
    clearSharedDrawerInlineStyles(drawer);
  });
}

export function isModuleDrawerOpen(drawerId: ModuleDrawerId): boolean {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return false;
  if (drawer.classList.contains('hidden')) return false;
  return drawer.classList.contains('open') || drawer.getAttribute('aria-hidden') === 'false';
}

export function isAnySiblingModuleDrawerOpen(exceptId: ModuleDrawerId): boolean {
  return MODULE_DRAWER_IDS.some((id) => id !== exceptId && isModuleDrawerOpen(id));
}

/** Hide every module drawer except the one being opened. */
export function hideSiblingModuleDrawers(exceptId: ModuleDrawerId): void {
  MODULE_DRAWER_IDS.forEach((id) => {
    if (id === exceptId) return;
    const drawer = document.getElementById(id);
    if (!drawer) return;
    drawer.classList.remove('open', 'closing');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    clearSharedDrawerInlineStyles(drawer);
  });
}

/** Keep body.orbis-mobile-sheet-open in sync with any open mobile sheet. */
export function syncMobileSheetOpenClass(): void {
  document.body.classList.toggle('orbis-mobile-sheet-open', anyMobileSheetOpen());
}

export function closeMobileSheetById(sheetId: string): void {
  const sheet = document.getElementById(sheetId);
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  syncMobileSheetOpenClass();
}

export function closeAllMobileSheets(): void {
  MOBILE_SHEET_IDS.forEach((id) => {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.remove('orbis-mobile-sheet-open');
}

export function openMobileSheetExclusive(sheetId: string): void {
  MOBILE_SHEET_IDS.forEach((id) => {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    if (id === sheetId) {
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
      return;
    }
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  });
  syncMobileSheetOpenClass();
}

export function closeAllMobileOverlays(): void {
  closeAllMobileSheets();

  if (typeof window.closeMobileNavDrawer === 'function') {
    window.closeMobileNavDrawer();
  } else {
    const nav = document.getElementById('orbisMobileNavDrawer');
    nav?.classList.remove('open');
    document.body.classList.remove('orbis-mobile-nav-drawer-open');
  }
}

/** Clear body scroll lock only when no drawer / sheet / nav overlay remains open. */
export function unlockBodyScrollIfIdle(): void {
  clearClosedDrawerGhostStyles();

  if (anyDrawerOpen()) return;
  if (anyMobileSheetOpen()) return;
  if (document.body.classList.contains('orbis-mobile-nav-drawer-open')) return;
  if (document.body.classList.contains('orbis-modal-open')) return;

  document.body.classList.remove('orbis-drawer-open', 'orbis-mobile-employee-profile-open');
  document.body.style.removeProperty('overflow');

  const backdrop = document.getElementById('drawerBackdrop');
  if (backdrop?.classList.contains('open')) {
    backdrop.classList.remove('open');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.removeAttribute('style');
  }
}

export function lockBodyScrollForDrawer(): void {
  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';
}

/**
 * Shared open styles for module drawers. On mobile, force fullscreen so inline
 * width rules do not leave side-panel drawers on phones.
 */
export function applySharedDrawerOpenStyles(
  drawer: HTMLElement,
  backdrop: HTMLElement | null,
  options?: { desktopMaxWidth?: string; drawerId?: ModuleDrawerId }
): void {
  const drawerId = (options?.drawerId || drawer.id) as ModuleDrawerId;
  if (MODULE_DRAWER_IDS.includes(drawerId)) {
    hideSiblingModuleDrawers(drawerId);
  }

  closeAllMobileOverlays();

  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.classList.remove('hidden');
    backdrop.removeAttribute('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.setProperty('display', 'block', 'important');
    backdrop.style.setProperty('visibility', 'visible', 'important');
    backdrop.style.setProperty('opacity', '1', 'important');
    backdrop.style.setProperty('z-index', '140', 'important');
  }

  const mobile = isMobileLayout();
  const desktopMax = options?.desktopMaxWidth || 'min(760px, 92vw)';

  drawer.classList.add('open');
  drawer.classList.remove('hidden', 'closing');
  drawer.removeAttribute('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.style.setProperty('display', 'flex', 'important');
  drawer.style.setProperty('flex-direction', 'column', 'important');
  drawer.style.setProperty('visibility', 'visible', 'important');
  drawer.style.setProperty('opacity', '1', 'important');
  drawer.style.setProperty('pointer-events', 'auto', 'important');
  drawer.style.setProperty('position', 'fixed', 'important');
  drawer.style.setProperty('top', '0', 'important');
  drawer.style.setProperty('right', '0', 'important');
  drawer.style.setProperty('bottom', '0', 'important');
  if (mobile) {
    drawer.style.setProperty('left', '0', 'important');
  } else {
    drawer.style.removeProperty('left');
  }
  drawer.style.setProperty('height', '100dvh', 'important');
  drawer.style.setProperty('max-height', '100dvh', 'important');
  drawer.style.setProperty('width', mobile ? '100%' : desktopMax, 'important');
  drawer.style.setProperty('max-width', mobile ? '100%' : desktopMax, 'important');
  drawer.style.setProperty('overflow', 'hidden', 'important');
  drawer.style.setProperty('transform', 'none', 'important');
  drawer.style.setProperty('z-index', '150', 'important');

  lockBodyScrollForDrawer();
}

export function clearSharedDrawerInlineStyles(drawer: HTMLElement | null): void {
  if (!drawer) return;
  [
    'display',
    'flex-direction',
    'visibility',
    'opacity',
    'pointer-events',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'height',
    'max-height',
    'width',
    'max-width',
    'overflow',
    'transform',
    'z-index',
  ].forEach((prop) => drawer.style.removeProperty(prop));
}

window.closeAllMobileOverlays = closeAllMobileOverlays;
window.unlockBodyScrollIfIdle = unlockBodyScrollIfIdle;
window.hideSiblingModuleDrawers = hideSiblingModuleDrawers;
window.clearSharedDrawerInlineStyles = clearSharedDrawerInlineStyles;
