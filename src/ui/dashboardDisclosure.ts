/**
 * Progressive disclosure for dense dashboard sections — summary visible, details expandable.
 */

function setPanelState(
  card: HTMLElement,
  toggle: HTMLButtonElement,
  panel: HTMLElement,
  expanded: boolean
): void {
  card.classList.toggle('is-expanded', expanded);
  panel.hidden = !expanded;
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggle.textContent = expanded ? 'Hide details' : 'Show details';
}

/** Bind progressive-disclosure toggles under `root` (dashboard, reports, investigations, etc.). */
export function initOrbisDisclosure(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-orbis-disclosure]').forEach((card) => {
    if (card.dataset.orbisDisclosureBound === 'true') return;

    const toggle = card.querySelector<HTMLButtonElement>('[data-orbis-disclosure-toggle]');
    const panel = card.querySelector<HTMLElement>('[data-orbis-disclosure-panel]');
    if (!toggle || !panel) return;

    const startExpanded = card.dataset.orbisDisclosureStart === 'open';
    setPanelState(card, toggle, panel, startExpanded);

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      setPanelState(card, toggle, panel, expanded);
    });

    card.dataset.orbisDisclosureBound = 'true';
  });
}

export function initDashboardDisclosure(root: ParentNode = document): void {
  initOrbisDisclosure(root);
}

declare global {
  interface Window {
    initOrbisDisclosure?: typeof initOrbisDisclosure;
    initDashboardDisclosure?: typeof initDashboardDisclosure;
  }
}

window.initOrbisDisclosure = initOrbisDisclosure;
window.initDashboardDisclosure = initDashboardDisclosure;
