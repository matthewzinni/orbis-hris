import { isMobileLayout } from './mobileLayout';

const TABLE_WRAP_SELECTOR =
  '.table-wrap, .mini-table-wrap, .care-matrix-wrap, .attendance-table-scroll';
const DESKTOP_ONLY_TABLE_CLASS = ['orbis-desktop-module-table', 'orbis-desktop-roster-table'];

function isDesktopOnlyTable(element: HTMLElement): boolean {
  return DESKTOP_ONLY_TABLE_CLASS.some((className) => element.classList.contains(className));
}

function tableNeedsScrollHint(wrap: HTMLElement): boolean {
  const table = wrap.querySelector('table');
  if (!table) return false;
  return table.scrollWidth > wrap.clientWidth + 4;
}

export function enhanceMobileTables(): void {
  document.querySelectorAll<HTMLElement>(TABLE_WRAP_SELECTOR).forEach((wrap) => {
    if (isDesktopOnlyTable(wrap)) {
      wrap.classList.remove('orbis-table-scroll-region');
      wrap.removeAttribute('data-scroll-hint');
      wrap.removeAttribute('role');
      wrap.removeAttribute('tabindex');
      wrap.removeAttribute('aria-label');
      return;
    }

    if (!isMobileLayout()) {
      wrap.classList.remove('orbis-table-scroll-region');
      wrap.removeAttribute('data-scroll-hint');
      wrap.removeAttribute('role');
      wrap.removeAttribute('tabindex');
      wrap.removeAttribute('aria-label');
      return;
    }

    if (!wrap.querySelector('table')) {
      wrap.classList.remove('orbis-table-scroll-region');
      return;
    }

    wrap.classList.add('orbis-table-scroll-region');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Scrollable data table');
    wrap.setAttribute('tabindex', '0');

    const showHint = tableNeedsScrollHint(wrap);
    if (showHint) {
      wrap.setAttribute('data-scroll-hint', 'true');
    } else {
      wrap.removeAttribute('data-scroll-hint');
    }
  });
}

function bindMobileTableEvents(): void {
  if ((window as { __mobileTablesBound?: boolean }).__mobileTablesBound) return;
  (window as { __mobileTablesBound?: boolean }).__mobileTablesBound = true;

  window.addEventListener('orbis:layout-change', () => {
    enhanceMobileTables();
  });

  window.addEventListener('orbis:section-change', () => {
    window.setTimeout(() => enhanceMobileTables(), 50);
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
