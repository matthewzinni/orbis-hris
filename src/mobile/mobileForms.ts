import { isMobileLayout } from './mobileLayout';

const DRAWER_IDS = [
  'employeeDrawer',
  'candidateDrawer',
  'investigationDrawer',
  'operationsIssueDrawer',
  'careEngagementDrawer',
  'leadershipAcademyDrawer',
  'janusAccountDrawer',
] as const;

const PANEL_SELECTORS = [
  '.tab-panel',
  '[data-investigation-panel]',
  '[data-janus-drawer-panel]',
].join(', ');

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
  '#saveJanusAccountBtn',
  '#saveJanusContactBtn',
  '#janusSaveMeetingBtn',
  '#janusSaveActivityBtn',
  '#janusUploadDocumentBtn',
].join(', ');

const DRAWER_LEVEL_FOOTERS: Record<string, string> = {
  investigationDrawer: 'saveInvestigationBtn',
  operationsIssueDrawer: 'saveOperationsIssueBtn',
  careEngagementDrawer: 'saveCareEngagementBtn',
  leadershipAcademyDrawer: 'saveLeadershipAcademyBtn',
};

function escAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function panelHasFormFields(panel: HTMLElement): boolean {
  return Boolean(
    panel.querySelector('.field, textarea, select, .button-row, .file-upload-row, canvas')
  );
}

function isPanelVisible(panel: HTMLElement): boolean {
  if (panel.classList.contains('hidden') || panel.hasAttribute('hidden')) return false;
  if (panel.classList.contains('tab-panel')) {
    return panel.classList.contains('active');
  }
  return true;
}

function findPanelSaveButton(panel: HTMLElement): HTMLButtonElement | null {
  const explicit = panel.querySelector<HTMLButtonElement>(PANEL_SAVE_SELECTORS);
  if (explicit && !explicit.classList.contains('hidden')) {
    return explicit;
  }

  // Candidate Interview tab has no local save — edits persist via profile Save Candidate.
  if (panel.id === 'candidate-tab-interview') {
    const profileSave = document.getElementById('saveCandidateBtn') as HTMLButtonElement | null;
    if (profileSave && !profileSave.classList.contains('hidden')) {
      return profileSave;
    }
  }

  const primaryButtons = panel.querySelectorAll<HTMLButtonElement>(
    '.card-body > .button.primary, .button-row .button.primary'
  );

  for (const button of primaryButtons) {
    if (button.classList.contains('hidden') || button.offsetParent === null) continue;
    const label = (button.textContent || '').toLowerCase();
    if (label.includes('print') || label.includes('pdf') || label.includes('invite')) continue;
    if (label.includes('email')) continue;
    return button;
  }

  return null;
}

function clearPinnedDrawerSaveFooter(drawer: HTMLElement): void {
  drawer.querySelector('.orbis-mobile-pinned-save-footer')?.remove();
  drawer.querySelectorAll('.orbis-mobile-inline-save').forEach((button) => {
    button.classList.remove('orbis-mobile-inline-save');
  });
}

/** Pin the active panel's primary save outside `.drawer-body` so it stays visible. */
function ensurePinnedDrawerSaveFooter(
  drawer: HTMLElement,
  saveButton: HTMLButtonElement | null
): void {
  if (!saveButton) {
    clearPinnedDrawerSaveFooter(drawer);
    return;
  }

  let footer = drawer.querySelector<HTMLElement>('.orbis-mobile-pinned-save-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.className =
      'drawer-footer orbis-mobile-pinned-save-footer orbis-mobile-drawer-footer';
    footer.innerHTML = `
      <button
        type="button"
        class="button primary orbis-mobile-form-footer-btn"
      ></button>`;
    drawer.appendChild(footer);
  }

  const footerBtn = footer.querySelector<HTMLButtonElement>('.orbis-mobile-form-footer-btn');
  if (!footerBtn) return;

  const label = saveButton.textContent?.trim() || 'Save';
  footerBtn.textContent = label;
  footerBtn.dataset.mobileFormSubmitFor = saveButton.id;
  footerBtn.setAttribute('aria-label', label);
  footerBtn.disabled = saveButton.disabled;

  footerBtn.onclick = () => {
    if (saveButton.disabled) return;
    saveButton.click();
  };

  drawer.querySelectorAll('.orbis-mobile-inline-save').forEach((button) => {
    if (button !== saveButton) button.classList.remove('orbis-mobile-inline-save');
  });
  saveButton.classList.add('orbis-mobile-inline-save');
}

function enhanceDrawerLevelFooter(drawerId: string): void {
  const saveId = DRAWER_LEVEL_FOOTERS[drawerId];
  if (!saveId) return;

  const drawer = document.getElementById(drawerId);
  const footer = drawer?.querySelector<HTMLElement>('.drawer-footer, .drawer-actions');
  if (!drawer || !footer) return;

  const mobile = isMobileLayout() && drawer.classList.contains('open');
  footer.classList.toggle('orbis-mobile-drawer-footer', mobile);
}

function escText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clearInvestigationMultiPicker(select: HTMLSelectElement): void {
  const field = select.closest('.field');
  field?.querySelector('.orbis-mobile-multi-picker')?.remove();
  select.classList.remove('orbis-mobile-native-hidden', 'orbis-mobile-multi-select');

  const hint = field?.querySelector<HTMLElement>('.muted');
  if (hint?.dataset.desktopHint) {
    hint.textContent = hint.dataset.desktopHint;
  }
}

function rebuildInvestigationMultiPicker(select: HTMLSelectElement): void {
  const field = select.closest('.field');
  if (!field) return;

  const hint = field.querySelector<HTMLElement>('.muted');
  if (hint) {
    if (!hint.dataset.desktopHint) {
      hint.dataset.desktopHint = hint.textContent || '';
    }
    hint.textContent = 'Tap people to select or deselect.';
  }

  select.classList.add('orbis-mobile-native-hidden', 'orbis-mobile-multi-select');

  let picker = field.querySelector<HTMLElement>('.orbis-mobile-multi-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.className = 'orbis-mobile-multi-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute(
      'aria-label',
      select.id === 'invTargetedEmployeesInput' ? 'Targeted employees' : 'Focus employees'
    );
    select.insertAdjacentElement('afterend', picker);
  }

  const options = Array.from(select.options).filter((option) => option.value);
  picker.innerHTML = options.length
    ? options
        .map(
          (option) => `
      <label class="orbis-mobile-multi-picker-option">
        <input
          type="checkbox"
          value="${escAttr(option.value)}"
          ${option.selected ? 'checked' : ''}
        />
        <span>${escText(option.textContent || option.value)}</span>
      </label>`
        )
        .join('')
    : '<div class="muted">No employees available.</div>';

  if (picker.dataset.bound !== '1') {
    picker.dataset.bound = '1';
    picker.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement | null;
      if (!input || input.type !== 'checkbox') return;
      const option = Array.from(select.options).find((row) => row.value === input.value);
      if (!option) return;
      option.selected = input.checked;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  if (select.dataset.pickerObserved !== '1') {
    select.dataset.pickerObserved = '1';
    new MutationObserver(() => {
      if (!isMobileLayout()) {
        clearInvestigationMultiPicker(select);
        return;
      }
      rebuildInvestigationMultiPicker(select);
    }).observe(select, { childList: true });
  }
}

function enhanceInvestigationMultiSelects(drawer: HTMLElement): void {
  const selects = drawer.querySelectorAll<HTMLSelectElement>(
    '#invTargetedEmployeesInput, #invFocusEmployeesInput'
  );

  selects.forEach((select) => {
    if (!isMobileLayout()) {
      clearInvestigationMultiPicker(select);
      return;
    }
    rebuildInvestigationMultiPicker(select);
  });
}

function cleanupDrawerFormEnhancements(drawerId: string): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  drawer.querySelectorAll('.orbis-mobile-form-panel').forEach((panel) => {
    panel.classList.remove('orbis-mobile-form-panel');
  });

  clearPinnedDrawerSaveFooter(drawer);

  drawer
    .querySelector('.drawer-footer:not(.orbis-mobile-pinned-save-footer), .drawer-actions')
    ?.classList.remove('orbis-mobile-drawer-footer');
  drawer
    .querySelectorAll<HTMLSelectElement>('#invTargetedEmployeesInput, #invFocusEmployeesInput')
    .forEach((select) => clearInvestigationMultiPicker(select));
}

function enhanceDrawerFormPanels(drawerId: string): void {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  if (!isMobileLayout() || !drawer.classList.contains('open')) {
    cleanupDrawerFormEnhancements(drawerId);
    return;
  }

  enhanceDrawerLevelFooter(drawerId);

  if (drawerId === 'investigationDrawer') {
    enhanceInvestigationMultiSelects(drawer);
  }

  // Drawers with a single pinned footer don't need per-panel save proxies.
  if (DRAWER_LEVEL_FOOTERS[drawerId]) {
    clearPinnedDrawerSaveFooter(drawer);
    return;
  }

  let activeSave: HTMLButtonElement | null = null;

  drawer.querySelectorAll<HTMLElement>(PANEL_SELECTORS).forEach((panel) => {
    if (!panelHasFormFields(panel)) return;

    panel.classList.add('orbis-mobile-form-panel');

    if (!isPanelVisible(panel)) return;

    const saveButton = findPanelSaveButton(panel);
    if (saveButton) {
      activeSave = saveButton;
    }
  });

  ensurePinnedDrawerSaveFooter(drawer, activeSave);
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
  bindDrawerTabEnhancement('investigationDrawer', '[data-investigation-tab]');
  bindDrawerTabEnhancement('operationsIssueDrawer', '[data-tab], .tab-btn');
  bindDrawerTabEnhancement('careEngagementDrawer', '[data-tab], .tab-btn');
  bindDrawerTabEnhancement('janusAccountDrawer', '[data-janus-drawer-tab]');

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
