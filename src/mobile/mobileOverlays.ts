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

function anyMobileSheetOpen(): boolean {
  return MOBILE_SHEET_IDS.some((id) => document.getElementById(id)?.classList.contains('open'));
}

function anyDrawerOpen(): boolean {
  return MODULE_DRAWER_IDS.some((id) => document.getElementById(id)?.classList.contains('open'));
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
  if (anyDrawerOpen()) return;
  if (anyMobileSheetOpen()) return;
  if (document.body.classList.contains('orbis-mobile-nav-drawer-open')) return;
  if (document.body.classList.contains('orbis-modal-open')) return;

  document.body.classList.remove('orbis-drawer-open', 'orbis-mobile-employee-profile-open');
  document.body.style.removeProperty('overflow');
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
  options?: { desktopMaxWidth?: string }
): void {
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
