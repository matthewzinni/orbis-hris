import { isMobileLayout } from './mobileLayout';

const TABLE_WRAP_SELECTOR = [
  '.table-wrap',
  '.mini-table-wrap',
  '.care-matrix-wrap',
  '.attendance-table-scroll',
  '.org-chart-tree',
  '.care-pulse-grid',
].join(', ');

const DESKTOP_ONLY_TABLE_CLASS = ['orbis-desktop-module-table', 'orbis-desktop-roster-table'];

function isDesktopOnlyTable(element: HTMLElement): boolean {
  return DESKTOP_ONLY_TABLE_CLASS.some((className) => element.classList.contains(className));
}

function regionNeedsScrollHint(wrap: HTMLElement): boolean {
  if (wrap.scrollWidth > wrap.clientWidth + 4) return true;
  const table = wrap.querySelector('table');
  if (table) return table.scrollWidth > wrap.clientWidth + 4;
  return false;
}

function clearScrollRegion(wrap: HTMLElement): void {
  wrap.classList.remove('orbis-table-scroll-region');
  wrap.removeAttribute('data-scroll-hint');
  wrap.removeAttribute('role');
  wrap.removeAttribute('tabindex');
  wrap.removeAttribute('aria-label');
}

export function enhanceMobileTables(): void {
  document.querySelectorAll<HTMLElement>(TABLE_WRAP_SELECTOR).forEach((wrap) => {
    if (isDesktopOnlyTable(wrap)) {
      clearScrollRegion(wrap);
      return;
    }

    if (!isMobileLayout()) {
      clearScrollRegion(wrap);
      return;
    }

    const hasScrollableContent =
      Boolean(wrap.querySelector('table')) ||
      wrap.classList.contains('org-chart-tree') ||
      wrap.classList.contains('care-pulse-grid') ||
      wrap.classList.contains('care-matrix-wrap');

    if (!hasScrollableContent) {
      clearScrollRegion(wrap);
      return;
    }

    wrap.classList.add('orbis-table-scroll-region');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute(
      'aria-label',
      wrap.classList.contains('org-chart-tree')
        ? 'Scrollable organization chart'
        : wrap.classList.contains('care-pulse-grid')
          ? 'Scrollable care pulse cards'
          : 'Scrollable data table'
    );
    wrap.setAttribute('tabindex', '0');

    if (regionNeedsScrollHint(wrap)) {
      wrap.setAttribute('data-scroll-hint', 'true');
    } else {
      wrap.removeAttribute('data-scroll-hint');
    }
  });
}

function scheduleEnhanceMobileTables(delayMs = 50): void {
  window.setTimeout(() => enhanceMobileTables(), delayMs);
}

function bindMobileTableEvents(): void {
  if ((window as { __mobileTablesBound?: boolean }).__mobileTablesBound) return;
  (window as { __mobileTablesBound?: boolean }).__mobileTablesBound = true;

  window.addEventListener('orbis:layout-change', () => {
    enhanceMobileTables();
  });

  window.addEventListener('orbis:section-change', () => {
    scheduleEnhanceMobileTables(50);
    scheduleEnhanceMobileTables(300);
  });

  window.addEventListener('resize', () => {
    if (!isMobileLayout()) return;
    enhanceMobileTables();
  });
}

export function initMobileTables(): void {
  bindMobileTableEvents();
  enhanceMobileTables();
}

window.refreshMobileTables = enhanceMobileTables;
