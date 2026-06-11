import { switchMainView } from '../ui/navigation';
import {
  getMobileMoreItems,
  getMobileTabsForUser,
  sectionIdToMobileTab,
  type MobileTabId,
} from './mobileNav';
import { isMobileLayout } from './mobileLayout';
import { initMobilePeople } from './mobilePeople';
import { initMobileHome } from './mobileHome';
import { initMobileDrawer } from './mobileDrawer';
import { initMobileTasks } from './mobileTasks';
import { initMobilePortal } from './mobilePortal';
import { applyMobileTabBadges } from './mobileBadges';
import { initMobileActivity } from './mobileActivity';
import { initMobileForms } from './mobileForms';
import { initMobileNotifications } from './mobileNotifications';
import { initMobileMoreModules } from './mobileMoreModules';

declare global {
  interface Window {
    refreshMobileNavigation?: () => void;
  }
}

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

function syncActiveTab(sectionId: string): void {
  const tabId = sectionIdToMobileTab(sectionId);
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
  document.body.classList.add('orbis-mobile-sheet-open');
}

function closeMoreSheet(): void {
  const sheet = document.getElementById('orbisMobileMoreSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('orbis-mobile-sheet-open');
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
    closeMoreSheet();
  }
}

function bindMobileShellEvents(): void {
  if ((window as { __mobileShellBound?: boolean }).__mobileShellBound) return;
  (window as { __mobileShellBound?: boolean }).__mobileShellBound = true;

  document.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;

    const target = event.target as HTMLElement | null;
    const tabButton = target?.closest('#orbisMobileTabBar .orbis-mobile-tab') as HTMLElement | null;
    if (tabButton) {
      event.preventDefault();
      const tabId = tabButton.dataset.mobileTab as MobileTabId | undefined;
      if (tabId === 'more') {
        openMoreSheet();
        syncActiveTab(String(window.currentMainView || ''));
        return;
      }
      const sectionId = tabButton.dataset.navView || '';
      if (sectionId) {
        closeMoreSheet();
        switchMainView(sectionId);
      }
      return;
    }

    const moreItem = target?.closest('#orbisMobileMoreNav .orbis-mobile-more-item') as HTMLElement | null;
    if (moreItem) {
      event.preventDefault();
      const sectionId = moreItem.dataset.navView || '';
      if (sectionId) {
        closeMoreSheet();
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

  window.addEventListener('orbis:section-change', (event) => {
    if (!isMobileLayout()) return;
    const detail = (event as CustomEvent<{ sectionId?: string }>).detail;
    const sectionId = String(detail?.sectionId || window.currentMainView || '');
    if (sectionId) syncActiveTab(sectionId);
  });

  window.addEventListener('orbis:layout-change', () => {
    refreshShell();
  });
}

export function initMobileShell(): void {
  bindMobileShellEvents();
  initMobilePeople();
  initMobileHome();
  initMobileDrawer();
  initMobileTasks();
  initMobilePortal();
  initMobileActivity();
  initMobileForms();
  initMobileNotifications();
  initMobileMoreModules();
  refreshShell();
}

export function refreshMobileNavigation(): void {
  refreshShell();
}

window.refreshMobileNavigation = refreshMobileNavigation;
