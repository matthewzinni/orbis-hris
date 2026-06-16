/**
 * Keeps employee/candidate drawer DOM in a stable order:
 * chrome → legacy header → scrollable body (tabs + panels).
 */

const DRAWER_LAYOUT: Record<string, { chromeId: string; drawerId: string }> = {
  employee: { chromeId: 'employeeDrawerChrome', drawerId: 'employeeDrawer' },
  candidate: { chromeId: 'candidateDrawerChrome', drawerId: 'candidateDrawer' },
};

function getDrawerRoot(drawerId: string): HTMLElement | null {
  return document.getElementById(drawerId);
}

function getDrawerChrome(drawerId: string): HTMLElement | null {
  const key = drawerId === 'employeeDrawer' ? 'employee' : 'candidate';
  return document.getElementById(DRAWER_LAYOUT[key].chromeId);
}

export function ensureDrawerLayout(drawerId: string): void {
  const drawer = getDrawerRoot(drawerId);
  if (!drawer) return;

  const chrome = getDrawerChrome(drawerId);
  const legacyHeader = drawer.querySelector(':scope > .drawer-header') as HTMLElement | null;
  const body = drawer.querySelector(':scope > .drawer-body') as HTMLElement | null;

  const tabs =
    (drawer.querySelector(':scope > .tabs') as HTMLElement | null) ||
    (drawer.querySelector(':scope > .drawer-tablist') as HTMLElement | null) ||
    (body?.querySelector('.tabs, .drawer-tablist') as HTMLElement | null);

  if (tabs && body && tabs.parentElement !== body) {
    body.insertBefore(tabs, body.firstChild);
  }

  if (chrome && chrome.parentElement === drawer) {
    drawer.insertBefore(chrome, drawer.firstChild);
  }

  if (legacyHeader && legacyHeader.parentElement === drawer) {
    if (chrome && chrome.nextElementSibling !== legacyHeader) {
      chrome.insertAdjacentElement('afterend', legacyHeader);
    } else if (!chrome) {
      drawer.insertBefore(legacyHeader, drawer.firstChild);
    }
  }

  if (body && body.parentElement === drawer) {
    drawer.appendChild(body);
  }
}

export function setEmployeeDrawerCreateMode(active: boolean): void {
  const drawer = document.getElementById('employeeDrawer');
  if (!drawer) return;

  drawer.classList.toggle('orbis-drawer-creating', active);
  drawer.dataset.creatingEmployee = active ? 'true' : 'false';
}

window.ensureDrawerLayout = ensureDrawerLayout;
window.setEmployeeDrawerCreateMode = setEmployeeDrawerCreateMode;
