import { isMobileLayout } from './mobileLayout';

const MOBILE_FORM_PANEL_IDS = [
  'tab-discipline',
  'tab-incidents',
  'tab-reviews',
  'tab-meetings',
  'tab-time-off',
] as const;

function escAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function ensureStickyFooter(panel: HTMLElement, saveButton: HTMLButtonElement): void {
  const footerId = `orbisMobileFormFooter-${panel.id}`;
  let footer = document.getElementById(footerId);

  if (!footer) {
    footer = document.createElement('div');
    footer.id = footerId;
    footer.className = 'orbis-mobile-form-footer hidden';
    footer.innerHTML = `
      <button
        type="button"
        class="button primary orbis-mobile-form-footer-btn"
        data-mobile-form-submit-for="${escAttr(saveButton.id)}"
      ></button>`;
    panel.appendChild(footer);
  }

  const footerBtn = footer.querySelector<HTMLButtonElement>('.orbis-mobile-form-footer-btn');
  if (!footerBtn) return;

  footerBtn.textContent = saveButton.textContent?.trim() || 'Save';
  footerBtn.dataset.mobileFormSubmitFor = saveButton.id;

  if (footerBtn.dataset.bound !== '1') {
    footerBtn.dataset.bound = '1';
    footerBtn.addEventListener('click', () => {
      saveButton.click();
    });
  }

  footer.classList.toggle('hidden', !isMobileLayout() || !panel.classList.contains('active'));
}

function enhanceDrawerFormPanels(): void {
  if (!isMobileLayout()) return;

  const drawer = document.getElementById('employeeDrawer');
  if (!drawer?.classList.contains('open')) return;

  MOBILE_FORM_PANEL_IDS.forEach((panelId) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    panel.classList.add('orbis-mobile-form-panel');

    const panelSave = panel.querySelector<HTMLButtonElement>(
      '#saveDisciplineBtn, #saveIncidentBtn, #saveReviewBtn, #saveMeetingBtn'
    );

    if (panelSave) {
      ensureStickyFooter(panel, panelSave);
    }
  });
}

function bindMobileFormsEvents(): void {
  if ((window as { __mobileFormsBound?: boolean }).__mobileFormsBound) return;
  (window as { __mobileFormsBound?: boolean }).__mobileFormsBound = true;

  document.getElementById('employeeDrawer')?.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tab]');
    if (!tab) return;
    window.setTimeout(() => enhanceDrawerFormPanels(), 0);
  });

  const drawer = document.getElementById('employeeDrawer');
  if (drawer) {
    const observer = new MutationObserver(() => {
      if (!isMobileLayout()) return;
      enhanceDrawerFormPanels();
    });
    observer.observe(drawer, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  window.addEventListener('orbis:layout-change', () => {
    enhanceDrawerFormPanels();
  });
}

export function initMobileForms(): void {
  bindMobileFormsEvents();
  enhanceDrawerFormPanels();
}
