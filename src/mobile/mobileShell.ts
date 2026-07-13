import { switchMainView } from '../ui/navigation';
import {
  getMobileMoreItems,
  getMobileTabsForUser,
  scrollToAttentionSection,
  sectionIdToMobileTab,
  type MobileTabId,
} from './mobileNav';
import { isMobileLayout } from './mobileLayout';
import { initMobileNavDrawer, closeMobileNavDrawer } from './mobileNavDrawer';
import { closeAllMobileOverlays, syncMobileSheetOpenClass } from './mobileOverlays';
import { initMobilePeople } from './mobilePeople';
import { initMobileHome } from './mobileHome';
import { initMobileDrawer } from './mobileDrawer';
import { initMobileTasks } from './mobileTasks';
import { initMobilePortal } from './mobilePortal';
import { applyMobileTabBadges } from './mobileBadges';
import { initMobileActivity } from './mobileActivity';
import { initMobileForms } from './mobileForms';
import { initMobileTables } from './mobileTables';
import { initMobileNotifications } from './mobileNotifications';
import { initMobileMoreModules } from './mobileMoreModules';

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

function renderTabBar(): void {
  const tabBar = document.getElementById('orbisMobileTabBar');
  if (!tabBar) return;

  const tabs = getMobileTabsForUser();
  tabBar.innerHTML = tabs
    .map(
      (tab) => `
    <button
      type="button"
      class="orbis-mobile-tab"
      data-mobile-tab="${esc(tab.id)}"
      data-nav-view="${tab.sectionId ? esc(tab.sectionId) : ''}"
      aria-label="${esc(tab.label)}"
    >
      <span class="orbis-mobile-tab-icon" aria-hidden="true">${tab.icon}</span>
      <span class="orbis-mobile-tab-label">${esc(tab.label)}</span>
    </button>`
    )
    .join('');

  applyMobileTabBadges();
}

function renderMoreMenu(): void {
  const nav = document.getElementById('orbisMobileMoreNav');
  if (!nav) return;

  const items = getMobileMoreItems();
  if (!items.length) {
    nav.innerHTML = '<p class="orbis-mobile-more-empty muted">No additional modules.</p>';
    return;
  }

  nav.innerHTML = items
    .map(
      (item) => `
    <button
      type="button"
      class="orbis-mobile-more-item"
      data-nav-view="${esc(item.sectionId)}"
    >
      ${esc(item.label)}
    </button>`
    )
    .join('');
}

function setTabBarVisible(visible: boolean): void {
  const tabBar = document.getElementById('orbisMobileTabBar');
  if (!tabBar) return;
  tabBar.classList.toggle('hidden', !visible);
  tabBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

let mobileActiveTabOverride: MobileTabId | null = null;

function syncActiveTab(sectionId: string): void {
  const tabId = mobileActiveTabOverride || sectionIdToMobileTab(sectionId);
  document.querySelectorAll('#orbisMobileTabBar .orbis-mobile-tab').forEach((button) => {
    const el = button as HTMLElement;
    const isActive = el.dataset.mobileTab === tabId;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function openMoreSheet(): void {
  const sheet = document.getElementById('orbisMobileMoreSheet');
  if (!sheet) return;
  renderMoreMenu();
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  syncMobileSheetOpenClass();
}

function closeMoreSheet(): void {
  const sheet = document.getElementById('orbisMobileMoreSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  syncMobileSheetOpenClass();
}

function clearIdleDrawerBackdrop(): void {
  const backdrop = document.getElementById('drawerBackdrop');
  if (!backdrop?.classList.contains('open')) return;

  const drawerOpen = document.querySelector(
    '#employeeDrawer.open, #candidateDrawer.open, #investigationDrawer.open, #operationsIssueDrawer.open, #careEngagementDrawer.open, #janusAccountDrawer.open, .drawer.open'
  );
  if (!drawerOpen) {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
  }
}

function handleMobileTabPress(tabButton: HTMLElement): void {
  clearIdleDrawerBackdrop();
  closeAllMobileOverlays();

  const tabId = tabButton.dataset.mobileTab as MobileTabId | undefined;
  if (tabId === 'more') {
    mobileActiveTabOverride = null;
    openMoreSheet();
    syncActiveTab(String(window.currentMainView || ''));
    return;
  }

  const sectionId = tabButton.dataset.navView || '';
  if (tabId === 'attention') {
    mobileActiveTabOverride = 'attention';
    if (sectionId) {
      switchMainView(sectionId);
      requestAnimationFrame(() => scrollToAttentionSection());
    }
    syncActiveTab(sectionId);
    return;
  }

  mobileActiveTabOverride = null;
  if (sectionId) {
    switchMainView(sectionId);
  }
}

function refreshShell(): void {
  const mobile = isMobileLayout();
  const appView = document.getElementById('appView');
  const isAppVisible = appView && !appView.classList.contains('hidden');

  setTabBarVisible(mobile && Boolean(isAppVisible));
  if (mobile) {
    renderTabBar();
    renderMoreMenu();
    const sectionId = String(window.currentMainView || '');
    if (sectionId) syncActiveTab(sectionId);
  } else {
    closeAllMobileOverlays();
  }
}

function bindMobileTabBarEvents(): void {
  const tabBar = document.getElementById('orbisMobileTabBar');
  if (!tabBar || tabBar.dataset.shellBound === '1') return;
  tabBar.dataset.shellBound = '1';

  tabBar.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;

    const tabButton = (event.target as HTMLElement | null)?.closest(
      '.orbis-mobile-tab'
    ) as HTMLElement | null;
    if (!tabButton) return;

    event.preventDefault();
    event.stopPropagation();
    handleMobileTabPress(tabButton);
  });
}

function bindMobileShellEvents(): void {
  if ((window as { __mobileShellBound?: boolean }).__mobileShellBound) return;
  (window as { __mobileShellBound?: boolean }).__mobileShellBound = true;

  bindMobileTabBarEvents();

  document.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;

    const target = event.target as HTMLElement | null;

    const moreItem = target?.closest('#orbisMobileMoreNav .orbis-mobile-more-item') as HTMLElement | null;
    if (moreItem) {
      event.preventDefault();
      const sectionId = moreItem.dataset.navView || '';
      if (sectionId) {
        mobileActiveTabOverride = null;
        clearIdleDrawerBackdrop();
        closeAllMobileOverlays();
        switchMainView(sectionId);
      }
      return;
    }

    const closeBtn = target?.closest('#orbisMobileMoreClose, #orbisMobileMoreBackdrop');
    if (closeBtn) {
      event.preventDefault();
      closeMoreSheet();
    }
  });

  const searchBtn = document.getElementById('orbisMobileSearchBtn');
  searchBtn?.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;
    event.preventDefault();
    if (typeof window.openCommandPalette === 'function') {
      window.openCommandPalette();
    }
  });

  window.addEventListener('orbis:section-change', (event) => {
    if (!isMobileLayout()) return;
    const detail = (event as CustomEvent<{ sectionId?: string }>).detail;
    const sectionId = String(detail?.sectionId || window.currentMainView || '');
    if (mobileActiveTabOverride === 'attention' && sectionIdToMobileTab(sectionId) !== 'attention') {
      mobileActiveTabOverride = null;
    }
    if (sectionId) syncActiveTab(sectionId);
  });

  window.addEventListener('orbis:layout-change', () => {
    refreshShell();
  });
}

export function initMobileShell(): void {
  bindMobileTabBarEvents();
  bindMobileShellEvents();
  initMobileNavDrawer();
  initMobilePeople();
  initMobileHome();
  initMobileDrawer();
  initMobileTasks();
  initMobilePortal();
  initMobileActivity();
  initMobileForms();
  initMobileTables();
  initMobileNotifications();
  initMobileMoreModules();
  refreshShell();
}

export function refreshMobileNavigation(): void {
  refreshShell();
}

window.refreshMobileNavigation = refreshMobileNavigation;
