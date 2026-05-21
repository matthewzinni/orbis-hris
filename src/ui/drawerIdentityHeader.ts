/**
 * Shared full-width navy drawer header used by employee and candidate drawers.
 */

export type DrawerIdentityHeaderConfig = {
  drawerId: string;
  headerId: string;
  closeButtonId: string;
  name: string;
  meta: string;
  status: string;
  initial: string;
  onClose: () => void;
};

function escapeHtml(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }

  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDrawerChromeElement(drawerId: string): HTMLElement | null {
  const chromeId = drawerId === 'employeeDrawer' ? 'employeeDrawerChrome' : 'candidateDrawerChrome';
  return document.getElementById(chromeId);
}

export function hideDrawerLegacyHeader(drawer: HTMLElement): void {
  const oldDrawerHeader = drawer.querySelector('.drawer-header');

  if (!oldDrawerHeader) return;

  const header = oldDrawerHeader as HTMLElement;
  header.style.display = 'none';
  header.style.height = '0';
  header.style.minHeight = '0';
  header.style.padding = '0';
  header.style.margin = '0';
  header.style.overflow = 'hidden';
}

export function restoreDrawerLegacyHeader(drawer: HTMLElement): void {
  const oldDrawerHeader = drawer.querySelector('.drawer-header');

  if (!oldDrawerHeader) return;

  const header = oldDrawerHeader as HTMLElement;
  header.style.removeProperty('display');
  header.style.removeProperty('height');
  header.style.removeProperty('min-height');
  header.style.removeProperty('padding');
  header.style.removeProperty('margin');
  header.style.removeProperty('overflow');
}

export function removeDrawerIdentityHeader(headerId: string): void {
  document.getElementById(headerId)?.remove();
}

export function restoreDrawerTabPlacement(drawerId: string): void {
  if (typeof window.ensureDrawerLayout === 'function') {
    window.ensureDrawerLayout(drawerId);
    return;
  }

  const drawer = document.getElementById(drawerId);
  const body = drawer?.querySelector('.drawer-body');

  if (!drawer || !body) return;

  const tabs =
    drawer.querySelector(':scope > .tabs') ||
    drawer.querySelector(':scope > .drawer-tablist');

  if (tabs && tabs.parentElement === drawer) {
    body.insertBefore(tabs, body.firstChild);
  }
}

function clearDrawerChrome(drawerId: string): void {
  const chrome = getDrawerChromeElement(drawerId);
  if (chrome) {
    chrome.innerHTML = '';
  }
}

export function mountDrawerIdentityHeader(config: DrawerIdentityHeaderConfig): void {
  const drawer = document.getElementById(config.drawerId);

  if (!drawer) return;

  removeDrawerIdentityHeader(config.headerId);
  clearDrawerChrome(config.drawerId);

  const header = document.createElement('div');
  header.id = config.headerId;
  header.className = 'drawer-identity-header employee-drawer-identity-header';
  header.style.setProperty('background', 'var(--navy, #102a43)');
  header.style.setProperty('color', '#ffffff');
  header.innerHTML = `
    <div class="employee-drawer-avatar">${escapeHtml(config.initial)}</div>
    <div class="employee-drawer-title-block">
      <div class="employee-drawer-name">${escapeHtml(config.name)}</div>
      <div class="employee-drawer-meta">${escapeHtml(config.meta)}</div>
    </div>
    <div class="employee-drawer-header-actions">
      <div class="employee-drawer-status-pill">${escapeHtml(config.status)}</div>
      <button type="button" class="employee-drawer-close-btn" id="${config.closeButtonId}" aria-label="Close drawer">×</button>
    </div>
  `;

  const chrome = getDrawerChromeElement(config.drawerId);
  if (chrome) {
    chrome.appendChild(header);
  } else {
    drawer.insertBefore(header, drawer.firstChild);
  }

  hideDrawerLegacyHeader(drawer);

  const closeBtn = document.getElementById(config.closeButtonId);

  if (closeBtn) {
    closeBtn.onclick = config.onClose;
  }
}

export function mountLegacyDrawerHeader(
  drawerId: string,
  options: {
    title: string;
    subtitle: string;
    onClose: () => void;
  }
): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  const headerId =
    drawerId === 'employeeDrawer' ? 'employeeDrawerIdentityHeader' : 'candidateDrawerIdentityHeader';

  removeDrawerIdentityHeader(headerId);
  clearDrawerChrome(drawerId);
  restoreDrawerLegacyHeader(drawer);

  const legacyHeader = drawer.querySelector('.drawer-header') as HTMLElement | null;
  if (!legacyHeader) return;

  legacyHeader.style.display = 'flex';
  legacyHeader.style.height = '';
  legacyHeader.style.minHeight = '';
  legacyHeader.style.padding = '';
  legacyHeader.style.margin = '';
  legacyHeader.style.overflow = '';

  const titleId = drawerId === 'employeeDrawer' ? 'drawerTitle' : 'candidateDrawerTitle';
  const subId = drawerId === 'employeeDrawer' ? 'drawerSub' : 'candidateDrawerSub';
  const titleEl = document.getElementById(titleId);
  const subEl = document.getElementById(subId);

  if (titleEl) titleEl.textContent = options.title;
  if (subEl) subEl.textContent = options.subtitle;

  const closeBtn =
    (drawer.querySelector('.drawer-close') as HTMLButtonElement | null) ||
    (drawer.querySelector('.drawer-header button') as HTMLButtonElement | null);

  if (closeBtn) {
    closeBtn.onclick = options.onClose;
  }
}

declare global {
  interface Window {
    esc?: (value: unknown) => string;
    mountDrawerIdentityHeader?: typeof mountDrawerIdentityHeader;
    mountLegacyDrawerHeader?: typeof mountLegacyDrawerHeader;
    hideDrawerLegacyHeader?: typeof hideDrawerLegacyHeader;
    restoreDrawerLegacyHeader?: typeof restoreDrawerLegacyHeader;
    removeDrawerIdentityHeader?: typeof removeDrawerIdentityHeader;
    restoreDrawerTabPlacement?: typeof restoreDrawerTabPlacement;
  }
}

window.mountDrawerIdentityHeader = mountDrawerIdentityHeader;
window.mountLegacyDrawerHeader = mountLegacyDrawerHeader;
window.hideDrawerLegacyHeader = hideDrawerLegacyHeader;
window.restoreDrawerLegacyHeader = restoreDrawerLegacyHeader;
window.removeDrawerIdentityHeader = removeDrawerIdentityHeader;
window.restoreDrawerTabPlacement = restoreDrawerTabPlacement;
