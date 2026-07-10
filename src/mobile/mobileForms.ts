import { isMobileLayout } from './mobileLayout';

const DRAWER_IDS = ['employeeDrawer', 'candidateDrawer'] as const;

const PANEL_SAVE_SELECTORS = [
  '#saveNoteBtn',
  '#saveDisciplineBtn',
  '#saveIncidentBtn',
  '#saveStayInterviewBtn',
  '#saveMeetingBtn',
  '#saveReviewBtn',
  '#saveECBtn',
  '#saveEmployeeBtn',
  '#saveCandidateBtn',
  '#saveCandidateNoteBtn',
].join(', ');

function escAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function panelHasFormFields(panel: HTMLElement): boolean {
  return Boolean(
    panel.querySelector('.field, textarea, select, .button-row, .file-upload-row, canvas')
  );
}

function findPanelSaveButton(panel: HTMLElement): HTMLButtonElement | null {
  const explicit = panel.querySelector<HTMLButtonElement>(PANEL_SAVE_SELECTORS);
  if (explicit && !explicit.classList.contains('hidden')) {
    return explicit;
  }

  const primaryButtons = panel.querySelectorAll<HTMLButtonElement>(
    '.card-body > .button.primary, .button-row .button.primary'
  );

  for (const button of primaryButtons) {
    if (button.classList.contains('hidden') || button.offsetParent === null) continue;
    const label = (button.textContent || '').toLowerCase();
    if (label.includes('print') || label.includes('pdf') || label.includes('invite')) continue;
    return button;
  }

  return null;
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
  footerBtn.setAttribute('aria-label', saveButton.textContent?.trim() || 'Save changes');

  if (footerBtn.dataset.bound !== '1') {
    footerBtn.dataset.bound = '1';
    footerBtn.addEventListener('click', () => {
      if (saveButton.disabled) return;
      saveButton.click();
    });
  }

  const showFooter = isMobileLayout() && panel.classList.contains('active');
  footer.classList.toggle('hidden', !showFooter);
  saveButton.classList.toggle('orbis-mobile-inline-save', showFooter);
}

function cleanupDrawerFormEnhancements(drawerId: string): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  drawer.querySelectorAll('.orbis-mobile-form-panel').forEach((panel) => {
    panel.classList.remove('orbis-mobile-form-panel');
  });

  drawer.querySelectorAll('.orbis-mobile-inline-save').forEach((button) => {
    button.classList.remove('orbis-mobile-inline-save');
  });

  drawer.querySelectorAll('.orbis-mobile-form-footer').forEach((footer) => {
    footer.remove();
  });
}

function enhanceDrawerFormPanels(drawerId: string): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  if (!isMobileLayout() || !drawer.classList.contains('open')) {
    cleanupDrawerFormEnhancements(drawerId);
    return;
  }

  drawer.querySelectorAll<HTMLElement>('.tab-panel').forEach((panel) => {
    if (!panelHasFormFields(panel)) return;

    panel.classList.add('orbis-mobile-form-panel');

    const saveButton = findPanelSaveButton(panel);
    if (saveButton) {
      ensureStickyFooter(panel, saveButton);
      return;
    }

    const footer = document.getElementById(`orbisMobileFormFooter-${panel.id}`);
    footer?.remove();
  });
}

function enhanceAllDrawerForms(): void {
  DRAWER_IDS.forEach(enhanceDrawerFormPanels);
}

function scheduleEnhanceDrawerForms(): void {
  window.setTimeout(() => enhanceAllDrawerForms(), 0);
}

function bindDrawerTabEnhancement(drawerId: string, tabSelector: string): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer || drawer.dataset.mobileFormsBound === '1') return;

  drawer.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(tabSelector);
    if (!tab) return;
    scheduleEnhanceDrawerForms();
  });

  const observer = new MutationObserver(() => {
    if (!isMobileLayout()) {
      cleanupDrawerFormEnhancements(drawerId);
      return;
    }
    scheduleEnhanceDrawerForms();
  });

  observer.observe(drawer, {
    attributes: true,
    attributeFilter: ['class'],
  });

  drawer.dataset.mobileFormsBound = '1';
}

function bindMobileFormsEvents(): void {
  if ((window as { __mobileFormsBound?: boolean }).__mobileFormsBound) return;
  (window as { __mobileFormsBound?: boolean }).__mobileFormsBound = true;

  bindDrawerTabEnhancement('employeeDrawer', '[data-tab]');
  bindDrawerTabEnhancement('candidateDrawer', '[data-candidate-tab]');

  window.addEventListener('orbis:layout-change', () => {
    if (isMobileLayout()) {
      enhanceAllDrawerForms();
      return;
    }
    DRAWER_IDS.forEach(cleanupDrawerFormEnhancements);
  });

  window.addEventListener('orbis:section-change', () => {
    scheduleEnhanceDrawerForms();
  });
}

export function initMobileForms(): void {
  bindMobileFormsEvents();
  enhanceAllDrawerForms();
}

export function refreshMobileDrawerForms(): void {
  enhanceAllDrawerForms();
}

window.refreshMobileDrawerForms = refreshMobileDrawerForms;
