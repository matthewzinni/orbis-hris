import { switchMainView } from '../ui/navigation';
import { isMobileLayout } from './mobileLayout';

let drawerTriggerElement: HTMLElement | null = null;
let focusTrapHandler: ((event: KeyboardEvent) => void) | null = null;

function esc(value: string): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDrawer(): HTMLElement | null {
  return document.getElementById('orbisMobileNavDrawer');
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.offsetParent !== null);
}

function bindFocusTrap(drawer: HTMLElement): void {
  if (focusTrapHandler) {
    drawer.removeEventListener('keydown', focusTrapHandler);
  }

  focusTrapHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMobileNavDrawer();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(drawer);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  drawer.addEventListener('keydown', focusTrapHandler);
}

function unbindFocusTrap(drawer: HTMLElement | null): void {
  if (!drawer || !focusTrapHandler) return;
  drawer.removeEventListener('keydown', focusTrapHandler);
  focusTrapHandler = null;
}

function setMenuButtonExpanded(expanded: boolean): void {
  const menuBtn = document.getElementById('orbisMobileMenuBtn');
  if (!menuBtn) return;
  menuBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

export function renderMobileNavDrawer(): void {
  const nav = document.getElementById('orbisMobileNavDrawerNav');
  if (!nav) return;

  const sidebarButtons = document.querySelectorAll<HTMLButtonElement>(
    '.orbis-sidebar-nav .orbis-nav-item:not(.hidden)'
  );

  if (!sidebarButtons.length) {
    nav.innerHTML = '<p class="orbis-mobile-nav-drawer-empty muted">No modules available.</p>';
    return;
  }

  const currentView = String(window.currentMainView || '');

  nav.innerHTML = Array.from(sidebarButtons)
    .map((button) => {
      const sectionId = String(button.dataset.navView || '').trim();
      if (!sectionId) return '';

      const label = (button.textContent || sectionId).trim();
      const isActive = sectionId === currentView || button.classList.contains('active');

      return `
    <button
      type="button"
      class="orbis-mobile-nav-drawer-item${isActive ? ' active' : ''}"
      data-nav-view="${esc(sectionId)}"
      aria-current="${isActive ? 'page' : 'false'}"
    >
      ${esc(label)}
    </button>`;
    })
    .filter(Boolean)
    .join('');
}

export function openMobileNavDrawer(trigger?: HTMLElement | null): void {
  if (!isMobileLayout()) return;

  const drawer = getDrawer();
  if (!drawer) return;

  drawerTriggerElement =
    trigger || (document.getElementById('orbisMobileMenuBtn') as HTMLElement | null);

  renderMobileNavDrawer();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('orbis-mobile-nav-drawer-open');
  setMenuButtonExpanded(true);
  bindFocusTrap(drawer);

  const closeBtn = drawer.querySelector('#orbisMobileNavDrawerClose') as HTMLElement | null;
  requestAnimationFrame(() => {
    (closeBtn || getFocusableElements(drawer)[0])?.focus();
  });
}

export function closeMobileNavDrawer(): void {
  const drawer = getDrawer();
  if (!drawer?.classList.contains('open')) return;

  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('orbis-mobile-nav-drawer-open');
  setMenuButtonExpanded(false);
  unbindFocusTrap(drawer);

  if (drawerTriggerElement && typeof drawerTriggerElement.focus === 'function') {
    drawerTriggerElement.focus();
  }

  drawerTriggerElement = null;
}

function handleDrawerNavClick(sectionId: string): void {
  if (!sectionId) return;
  closeMobileNavDrawer();
  switchMainView(sectionId);
}

function bindDrawerEvents(): void {
  if ((window as { __mobileNavDrawerBound?: boolean }).__mobileNavDrawerBound) return;
  (window as { __mobileNavDrawerBound?: boolean }).__mobileNavDrawerBound = true;

  document.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;

    const target = event.target as HTMLElement | null;

    const navItem = target?.closest(
      '#orbisMobileNavDrawerNav .orbis-mobile-nav-drawer-item'
    ) as HTMLElement | null;
    if (navItem) {
      event.preventDefault();
      handleDrawerNavClick(String(navItem.dataset.navView || ''));
      return;
    }

    if (target?.closest('#orbisMobileNavDrawerClose, #orbisMobileNavDrawerBackdrop')) {
      event.preventDefault();
      closeMobileNavDrawer();
      return;
    }

    if (target?.closest('#orbisMobileDrawerRefresh')) {
      event.preventDefault();
      closeMobileNavDrawer();
      if (typeof window.refreshOrbisWorkspace === 'function') {
        void window.refreshOrbisWorkspace();
      }
      return;
    }

    if (target?.closest('#orbisMobileDrawerLogout')) {
      event.preventDefault();
      closeMobileNavDrawer();
      document.getElementById('logoutBtn')?.click();
      return;
    }
  });

  const menuBtn = document.getElementById('orbisMobileMenuBtn');
  menuBtn?.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;
    event.preventDefault();

    const drawer = getDrawer();
    if (drawer?.classList.contains('open')) {
      closeMobileNavDrawer();
      return;
    }

    openMobileNavDrawer(menuBtn);
  });

  window.addEventListener('orbis:section-change', () => {
    if (!isMobileLayout()) return;
    if (!getDrawer()?.classList.contains('open')) return;
    renderMobileNavDrawer();
  });

  window.addEventListener('orbis:layout-change', (event) => {
    const detail = (event as CustomEvent<{ layout?: string }>).detail;
    if (detail?.layout === 'desktop') {
      closeMobileNavDrawer();
    }
  });
}

export function initMobileNavDrawer(): void {
  bindDrawerEvents();
}
