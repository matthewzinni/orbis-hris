// Drawer open/close UI (ported from js/ui/drawer.js)

import {
  mountDrawerIdentityHeader,
  mountLegacyDrawerHeader,
  removeDrawerIdentityHeader,
  restoreDrawerLegacyHeader,
  restoreDrawerTabPlacement,
} from './drawerIdentityHeader';
import { ensureDrawerLayout, setEmployeeDrawerCreateMode } from './drawerLayout';
import { formatBenefitsEligibilitySummary } from '../services/employeeUtils';
import { resetDrawerForms } from '../modules/drawerForms';

type DrawerUiEmployee = Record<string, unknown> & {
  id?: string;
  dbId?: string;
  employee_id?: string;
  employeeId?: string;
  first?: string;
  last?: string;
  first_name?: string;
  last_name?: string;
  dept?: string;
  department?: string;
  position?: string;
  supervisor?: string;
  status?: string;
  payType?: string;
  pay_type?: string;
  stdHours?: string | number;
  standard_hours?: string | number;
  benefitsStatus?: string;
  benefits_status?: string;
  hireDate?: string | Date | null;
  hire_date?: string;
  termination_date?: string;
  terminationDate?: string;
  nextReview?: string | Date | null;
  next_review?: string;
  next_review_date?: string;
  anniversaryDate?: string;
  anniversary_date?: string;
  tenureMonths?: string | number;
  tenure_months?: string | number;
  tenureYears?: string | number;
  tenure_years?: string | number;
  tenureBracket?: string;
  tenure_bracket?: string;
};

function domGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }

  return document.getElementById(id) as T | null;
}

let drawerTriggerElement: HTMLElement | null = null;
let drawerFocusTrapHandler: ((event: KeyboardEvent) => void) | null = null;

function getDrawerFocusableElements(drawer: HTMLElement): HTMLElement[] {
  return Array.from(
    drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.offsetParent !== null);
}

function bindDrawerFocusTrap(drawer: HTMLElement): void {
  if (drawerFocusTrapHandler) {
    drawer.removeEventListener('keydown', drawerFocusTrapHandler);
  }

  drawerFocusTrapHandler = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const focusable = getDrawerFocusableElements(drawer);
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

  drawer.addEventListener('keydown', drawerFocusTrapHandler);
}

function activateEmployeeDrawerA11y(drawer: HTMLElement, backdrop: HTMLElement | null): void {
  drawer.setAttribute('aria-hidden', 'false');
  backdrop?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('orbis-drawer-open');
  bindDrawerFocusTrap(drawer);

  const focusable = getDrawerFocusableElements(drawer);
  const closeBtn = drawer.querySelector('#employeeDrawerCloseBtn') as HTMLElement | null;

  requestAnimationFrame(() => {
    (closeBtn || focusable[0])?.focus();
  });
}

function deactivateEmployeeDrawerA11y(drawer: HTMLElement | null, backdrop: HTMLElement | null): void {
  if (drawer) {
    drawer.setAttribute('aria-hidden', 'true');

    if (drawerFocusTrapHandler) {
      drawer.removeEventListener('keydown', drawerFocusTrapHandler);
      drawerFocusTrapHandler = null;
    }
  }

  backdrop?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('orbis-drawer-open');

  if (drawerTriggerElement && typeof drawerTriggerElement.focus === 'function') {
    drawerTriggerElement.focus();
  }

  drawerTriggerElement = null;
}

function domEsc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }

  return String(value ?? '');
}

function cleanDrawerEmployeeNameValue(value: unknown): string {
    return String(value || '')
        .replace(/\bAt[-\s]*Risk\b/gi, '')
        .replace(/\bImpact\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanVisibleDrawerNameInputs() {
    const possibleFirstNameIds = ['empFirstName', 'firstName', 'employeeFirstName', 'firstNameInput'];
    const possibleLastNameIds = ['empLastName', 'lastName', 'employeeLastName', 'lastNameInput'];

    [...possibleFirstNameIds, ...possibleLastNameIds].forEach(id => {
        const field = domGet<HTMLInputElement>(id);

        if (!field || typeof field.value !== 'string') return;

        const cleanedValue = cleanDrawerEmployeeNameValue(field.value);

        if (field.value !== cleanedValue) {
            field.value = cleanedValue;
        }
    });
}

function getTrustedEmployeeDisplayId(employee: DrawerUiEmployee | null | undefined): string {
    if (!employee) return '';

    const possibleIds = [
        employee.employee_id,
        employee.employeeId,
        employee.employeeID,
        employee.employeeCode,
        employee.employee_code,
        employee.id
    ];

    const trustedId = possibleIds.find(value => /^BTW\d+$/i.test(String(value || '').trim()));

    return trustedId ? String(trustedId).trim().toUpperCase() : '';
}

export function getDrawerHeaderEmployeeId(): string {
    const header = document.getElementById('employeeDrawerIdentityHeader');

    if (!header) return '';

    const text = String(header.textContent || '');
    const match = text.match(/BTW\d+/i);

    return match ? match[0].toUpperCase() : '';
}

function setDrawerAdminField(possibleIds: string[], value: unknown): void {
    possibleIds.forEach(id => {
        const field = domGet<HTMLInputElement>(id);

        if (!field) return;

        if ('value' in field) {
            field.value = value || '';
        } else {
            field.textContent = value || '';
        }
    });
}

function normalizeDrawerLabelText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function setDrawerAdminFieldByLabel(labelText, value) {
    const scope =
        (typeof window.getEmployeeAdminPanel === 'function' && window.getEmployeeAdminPanel()) ||
        domGet('employeeDrawer');

    if (!scope) return;

    const normalizedTarget = normalizeDrawerLabelText(labelText);
    const possibleLabels = Array.from(
        scope.querySelectorAll('label, .field-label, .form-label, .detail-label')
    );

    const label = possibleLabels.find(el => normalizeDrawerLabelText(el.textContent) === normalizedTarget);

    if (!label) return;

    const wrapper = label.closest('.field, .form-field, .form-group, .input-group, .detail-card, .admin-field, .control-group') || label.parentElement;

    if (!wrapper) return;

    const field = wrapper.querySelector('input, select, textarea');

    if (!field) return;

    field.value = value || '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
}

function forcePopulateEmployeeAdminFieldsByLabels(employee) {
    if (!employee) return;

    const employeeId = getDrawerHeaderEmployeeId() || getTrustedEmployeeDisplayId(employee);
    const firstName = cleanDrawerEmployeeNameValue(employee.first || employee.first_name || '');
    const lastName = cleanDrawerEmployeeNameValue(employee.last || employee.last_name || '');
    const department = employee.dept || employee.department || '';
    const position = employee.position || '';
    const supervisor = employee.supervisor || '';
    const payType = employee.payType || employee.pay_type || '';
    const standardHours = employee.stdHours || employee.standard_hours || '';
    const status = employee.status || 'Active';
    const benefitsStatus = employee.benefitsStatus || employee.benefits_status || '';
    const hireDate = formatDrawerDateForInput(employee.hireDate || employee.hire_date || '');
    const terminationDate = formatDrawerDateForInput(
        employee.termination_date || employee.terminationDate || ''
    );
    const nextReview = formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || '');
    const anniversaryDate = getNextUpcomingAnniversaryDate(getEmployeeAnniversarySource(employee));

    setDrawerAdminFieldByLabel('Employee ID', employeeId);
    setDrawerAdminFieldByLabel('First Name', firstName);
    setDrawerAdminFieldByLabel('Last Name', lastName);
    setDrawerAdminFieldByLabel('Department', department);
    setDrawerAdminFieldByLabel('Position', position);
    setDrawerAdminFieldByLabel('Supervisor', supervisor);
    setDrawerAdminFieldByLabel('Pay Type', payType);
    setDrawerAdminFieldByLabel('Standard Hours', standardHours);
    setDrawerAdminFieldByLabel('Status', status);
    setDrawerAdminFieldByLabel('Benefits Status', benefitsStatus);
    if (typeof window.updateBenefitsEligibilityHint === 'function') {
      window.updateBenefitsEligibilityHint(employee);
    }
    setDrawerAdminFieldByLabel('Hire Date', hireDate);
    setDrawerAdminFieldByLabel('Termination Date', terminationDate);
    setDrawerAdminFieldByLabel('Next Stay Interview Date', nextReview);
    setDrawerAdminFieldByLabel('Anniversary Date', anniversaryDate);
}

export function forcePopulateEmployeeAdminPanel(employee: DrawerUiEmployee | null | undefined): void {
    if (window.isCreatingEmployee || !employee) {
        return;
    }

    forcePopulateEmployeeAdminFields(employee);

    forcePopulateEmployeeAdminFieldsByLabels(employee);

    forcePopulateVisibleEmployeeAdminPanel(employee);

    setDrawerAdminField(
        ['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'],
        getNextUpcomingAnniversaryDate(getEmployeeAnniversarySource(employee))
    );

    cleanVisibleDrawerNameInputs();

}

function getVisibleEmployeeAdminPanel() {
    const drawer = domGet('employeeDrawer');

    if (!drawer) return null;

    const panels = Array.from(drawer.querySelectorAll('.tab-panel, .panel, .card, section, form, div'));

    return panels.find(panel => {
        const text = String(panel.textContent || '').toLowerCase();
        const isVisible = panel.offsetParent !== null;
        return isVisible && text.includes('employee record management');
    }) || null;
}

function formatDrawerDateForInput(value) {

    if (!value) return '';

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {

        return raw.slice(0, 10);

    }

    const parsedDate = new Date(raw);

    if (!Number.isNaN(parsedDate.getTime())) {

        const year = parsedDate.getFullYear();

        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');

        const day = String(parsedDate.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;

    }

    return '';

}

export function formatDrawerDateForDisplay(value: unknown): string {
    const inputValue = formatDrawerDateForInput(value);

    if (!inputValue) return '';

    const [year, month, day] = inputValue.split('-').map(Number);

    if (!year || !month || !day) return inputValue;

    const localDate = new Date(year, month - 1, day);

    return localDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function getEmployeeAnniversarySource(employee: DrawerUiEmployee | null | undefined): string {
  if (!employee) {
    return '';
  }

  return String(
    employee.anniversaryDate ||
      employee.anniversary_date ||
      employee.hireDate ||
      employee.hire_date ||
      ''
  );
}

function scheduleEmployeeAdminPopulate(delayMs: number): void {
  window.setTimeout(() => {
    if (window.isCreatingEmployee || !window.currentEmployee) {
      return;
    }

    forcePopulateEmployeeAdminPanel(window.currentEmployee);
  }, delayMs);
}

export function getNextUpcomingAnniversaryDate(value: unknown): string {
    const inputValue = formatDrawerDateForInput(value);

    if (!inputValue) return '';

    const [year, month, day] = inputValue.split('-').map(Number);

    if (!year || !month || !day) return inputValue;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let anniversary = new Date(today.getFullYear(), month - 1, day);

    if (anniversary < today) {
        anniversary = new Date(today.getFullYear() + 1, month - 1, day);
    }

    const nextYear = anniversary.getFullYear();
    const nextMonth = String(anniversary.getMonth() + 1).padStart(2, '0');
    const nextDay = String(anniversary.getDate()).padStart(2, '0');

    return `${nextYear}-${nextMonth}-${nextDay}`;
}

function forcePopulateVisibleEmployeeAdminPanel(employee) {
    if (!employee) return;

    const panel = getVisibleEmployeeAdminPanel();

    if (!panel) return;

    // Field-by-id/label population runs in forcePopulateEmployeeAdminFields above.
    // Avoid index-based assignment here — extra date/checkbox fields caused invalid values.
}

function forcePopulateEmployeeAdminFields(employee) {
    if (!employee) return;

    const employeeId = getDrawerHeaderEmployeeId() || getTrustedEmployeeDisplayId(employee);
    const firstName = cleanDrawerEmployeeNameValue(employee.first || employee.first_name || '');
    const lastName = cleanDrawerEmployeeNameValue(employee.last || employee.last_name || '');
    const department = employee.dept || employee.department || '';
    const position = employee.position || '';
    const supervisor = employee.supervisor || '';
    const payType = employee.payType || employee.pay_type || '';
    const standardHours = employee.stdHours || employee.standard_hours || '';
    const status = employee.status || 'Active';
    const benefitsStatus = employee.benefitsStatus || employee.benefits_status || '';
    const hireDate = formatDrawerDateForInput(employee.hireDate || employee.hire_date || '');
    const terminationDate = formatDrawerDateForInput(
        employee.termination_date || employee.terminationDate || ''
    );
    const nextReview = formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || '');
    const anniversaryDate = getNextUpcomingAnniversaryDate(getEmployeeAnniversarySource(employee));

    setDrawerAdminField(['empId', 'employeeId', 'employeeID', 'employee_id', 'adminEmployeeId'], employeeId);
    setDrawerAdminField(['empFirstName', 'firstName', 'employeeFirstName', 'firstNameInput', 'adminFirstName'], firstName);
    setDrawerAdminField(['empLastName', 'lastName', 'employeeLastName', 'lastNameInput', 'adminLastName'], lastName);
    setDrawerAdminField(['empDepartment', 'department', 'employeeDepartment', 'departmentInput', 'adminDepartment'], department);
    setDrawerAdminField(['empPosition', 'position', 'employeePosition', 'positionInput', 'adminPosition'], position);
    setDrawerAdminField(['empSupervisor', 'supervisor', 'employeeSupervisor', 'supervisorInput', 'adminSupervisor'], supervisor);
    setDrawerAdminField(['empPayType', 'payType', 'employeePayType', 'payTypeInput', 'adminPayType'], payType);
    setDrawerAdminField(['empStandardHours', 'standardHours', 'stdHours', 'employeeStandardHours', 'standardHoursInput', 'adminStandardHours'], standardHours);
    setDrawerAdminField(['empStatus', 'status', 'employeeStatus', 'statusInput', 'adminStatus'], status);
    setDrawerAdminField(['empBenefitsStatus', 'benefitsStatus', 'employeeBenefitsStatus', 'benefitsStatusInput', 'adminBenefitsStatus'], benefitsStatus);
    setDrawerAdminField(['empHireDate', 'hireDate', 'employeeHireDate', 'hireDateInput', 'adminHireDate'], hireDate);
    setDrawerAdminField(
        ['employeeTerminationDateInput', 'employeeTerminationDate', 'empTerminationDate', 'terminationDate', 'adminTerminationDate'],
        terminationDate
    );
    setDrawerAdminField(['empNextReviewDate', 'nextReviewDate', 'nextReview', 'employeeNextReview', 'nextReviewInput', 'adminNextReview'], nextReview);

    if (typeof window.syncEmployeeTerminationDateFieldVisibility === 'function') {
        window.syncEmployeeTerminationDateFieldVisibility(status);
    }
    setDrawerAdminField(['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'], anniversaryDate);
    setDrawerAdminField(
        ['employeeWorkEmailInput', 'empWorkEmail', 'workEmail'],
        employee.work_email || employee.workEmail || ''
    );
    setDrawerAdminField(
        ['employeePersonalEmailInput', 'empPersonalEmail', 'personalEmail'],
        employee.personal_email || employee.personalEmail || employee.email || ''
    );
}

export function ensureEmployeeDrawerVisible(): HTMLElement | null {
  const backdrop = domGet('drawerBackdrop');
  const drawer = domGet('employeeDrawer');
  const candidateDrawer = domGet('candidateDrawer');

  candidateDrawer?.classList.remove('open', 'closing');

  if (backdrop) {
    backdrop.classList.remove('hidden');
    backdrop.removeAttribute('style');
  }

  if (!drawer) {
    return null;
  }

  drawer.classList.remove('hidden', 'closing');
  drawer.style.removeProperty('display');
  drawer.removeAttribute('aria-hidden');

  return drawer;
}

export function openNewEmployeeDrawer(): void {
  const backdrop = domGet('drawerBackdrop');
  const drawer = ensureEmployeeDrawerVisible();

  if (!drawer) {
    return;
  }

  ensureDrawerLayout('employeeDrawer');
  setEmployeeDrawerCreateMode(true);
  renderEmployeeDrawerIdentityHeader(null);
  ensureDrawerLayout('employeeDrawer');

  const drawerBody = drawer.querySelector('.drawer-body') as HTMLElement | null;
  if (drawerBody) {
    drawerBody.scrollTop = 0;
  }
  drawer.scrollTop = 0;

  backdrop?.classList.add('open');

  drawer.classList.remove('closing');
  requestAnimationFrame(() => {
    drawer.classList.add('open');
    activateEmployeeDrawerA11y(drawer, backdrop);
  });

  if (typeof window.activateDrawerTab === 'function') {
    window.activateDrawerTab('employee', 'employee', false);
  } else if (typeof window.switchTab === 'function') {
    window.switchTab('employee');
  }
}

export function renderEmployeeDrawerIdentityHeader(
  employee: DrawerUiEmployee | null | undefined
): void {
  const isNew = !employee || Boolean(window.isCreatingEmployee);

  if (isNew) {
    mountLegacyDrawerHeader('employeeDrawer', {
      title: 'New Employee',
      subtitle: 'Create employee record',
      onClose: () => closeDrawer(),
    });

    if (typeof window.setText === 'function') {
      window.setText('drawerTitle', 'New Employee');
      window.setText('drawerSub', 'Create employee record');
    }

    if (typeof window.clearEmployeeDrawerRiskSignals === 'function') {
      window.clearEmployeeDrawerRiskSignals();
    }

    return;
  }

  const firstName = cleanDrawerEmployeeNameValue(employee?.first || employee?.first_name || '');
  const lastName = cleanDrawerEmployeeNameValue(employee?.last || employee?.last_name || '');
  const employeeName =
    `${firstName} ${lastName}`.trim() || 'Employee Record';
  const displayEmployeeId =
    getTrustedEmployeeDisplayId(employee) || getResolvedDrawerEmployeeId(employee) || '—';
  const employeePosition = String(employee?.position || 'Employee');
  const employeeDepartment = String(employee?.dept || employee?.department || 'No department');
  const employeeStatus = String(employee?.status || 'Active');
  const meta = `${displayEmployeeId} • ${employeePosition} • ${employeeDepartment}`;

  mountDrawerIdentityHeader({
    drawerId: 'employeeDrawer',
    headerId: 'employeeDrawerIdentityHeader',
    closeButtonId: 'employeeDrawerCloseBtn',
    name: employeeName,
    meta,
    status: employeeStatus,
    initial: employeeName.charAt(0).toUpperCase() || 'E',
    onClose: () => closeDrawer(),
  });

  if (typeof window.setText === 'function') {
    window.setText('drawerTitle', employeeName);
    window.setText('drawerSub', meta);
  }

  if (typeof window.renderEmployeeDrawerRiskSignals === 'function') {
    window.renderEmployeeDrawerRiskSignals(employee as Record<string, unknown>);
  }
}

export function getResolvedDrawerEmployeeId(employee: DrawerUiEmployee | null = null): string | null {
    return getTrustedEmployeeDisplayId(employee) ||
        employee?.dbId ||
        window.currentEmployee?.dbId ||
        getTrustedEmployeeDisplayId(window.currentEmployee) ||
        null;
}

export function openDrawer(employee: DrawerUiEmployee | null | undefined): void {
    if (!employee) return;

    ensureEmployeeDrawerVisible();
    setEmployeeDrawerCreateMode(false);
    ensureDrawerLayout('employeeDrawer');

    drawerTriggerElement = document.activeElement as HTMLElement | null;

    employee = {
        ...employee,
        first: cleanDrawerEmployeeNameValue(employee.first || employee.first_name || ''),
        last: cleanDrawerEmployeeNameValue(employee.last || employee.last_name || ''),
        first_name: cleanDrawerEmployeeNameValue(employee.first_name || employee.first || ''),
        last_name: cleanDrawerEmployeeNameValue(employee.last_name || employee.last || '')
    };

    if (typeof resetDrawerForms === 'function') {
        resetDrawerForms();
    }

    window.currentEmployee = employee;

    if (typeof window.setCurrentEmployeeForOrbis === 'function') {
        window.setCurrentEmployeeForOrbis(employee);
    }

    window.isCreatingEmployee = false;

    let employeeId = getResolvedDrawerEmployeeId(employee);

    const canonicalEmployee = (window.EMPLOYEES || []).find(item => {
        const sameEmployeeId = item.employee_id && employee.employee_id && String(item.employee_id) === String(employee.employee_id);
        const sameEmployeeIdAlt = item.employee_id && employee.employeeId && String(item.employee_id) === String(employee.employeeId);
        return sameEmployeeId || sameEmployeeIdAlt;
    });

    if (canonicalEmployee) {
        employee = {
            ...canonicalEmployee,
            ...employee,
            employee_id: getTrustedEmployeeDisplayId(employee) || getTrustedEmployeeDisplayId(canonicalEmployee)
        };
        window.currentEmployee = employee;
        employeeId = getResolvedDrawerEmployeeId(employee);
    }

    if (!employeeId) return;

    const displayEmployeeId = getTrustedEmployeeDisplayId(employee) || employeeId;
    const employeeName = `${employee.first || employee.first_name || ''} ${employee.last || employee.last_name || ''}`.trim() || 'Employee Record';
    const employeePosition = employee.position || 'Employee';
    const employeeDepartment = employee.dept || employee.department || 'No department';
    const employeeStatus = employee.status || 'Active';

    if (typeof window.switchTab === 'function') {
        window.switchTab('profile');
    }

    if (typeof window.setText === 'function') {
        window.setText('drawerTitle', `${employee.first} ${employee.last}`);
        window.setText(
            'drawerSub',
            `${employee.position || 'Employee'} • ${employee.dept || employee.department || 'No department'}`
        );
    }

    if (typeof window.populateEmployeeForm === 'function') {
        window.populateEmployeeForm(employee);
    }

    forcePopulateEmployeeAdminPanel(employee);
    scheduleEmployeeAdminPopulate(50);
    scheduleEmployeeAdminPopulate(250);
    scheduleEmployeeAdminPopulate(750);
    window.setTimeout(() => {
        if (typeof window.resetDrawerEntryForms === 'function') {
            window.resetDrawerEntryForms();
        }
    }, 800);

    if (typeof window.ensureDeleteEmployeeButton === 'function') {
        window.ensureDeleteEmployeeButton();
    }

    if (typeof window.runTerminateEmployee === 'function') {
        const saveBtn = domGet('saveEmployeeBtn');
        const newBtn = domGet('newEmployeeBtn');
        const actionsRow = (newBtn && newBtn.parentElement) || (saveBtn && saveBtn.parentElement);
        let terminateBtn = domGet('terminateEmployeeBtn');

        if (actionsRow && !terminateBtn) {
            terminateBtn = document.createElement('button');
            terminateBtn.type = 'button';
            terminateBtn.id = 'terminateEmployeeBtn';
            terminateBtn.className = 'button danger';
            terminateBtn.textContent = 'Terminate Employee';
            terminateBtn.onclick = () => window.runTerminateEmployee?.();
            actionsRow.appendChild(terminateBtn);
        }
    }

    if (typeof window.applyRolePermissions === 'function') {
        window.applyRolePermissions();
    }

    const terminationDate = employee.termination_date || employee.terminationDate || '';
    const isTerminated =
        String(employee.status || '').trim().toUpperCase() === 'TERMINATED'
        && Boolean(String(terminationDate).trim());

    const detailRows = [
        ['Employee ID', displayEmployeeId],
        ['Status', employee.status],
        ['Department', employee.dept || employee.department],
        ['Position', employee.position],
        ['Supervisor', employee.supervisor],
        ['Pay Type', employee.payType || employee.pay_type],
        ['Standard Hours', employee.stdHours || employee.standard_hours],
        ['Hire Date', formatDrawerDateForDisplay(employee.hireDate || employee.hire_date)],
        ...(isTerminated
            ? [['Termination Date', formatDrawerDateForDisplay(terminationDate)]]
            : []),
        ['Phone', employee.phone || '—'],
        ['Next Stay Interview', formatDrawerDateForDisplay(employee.nextReview || employee.next_review || employee.next_review_date)],
        ['Anniversary', formatDrawerDateForDisplay(getNextUpcomingAnniversaryDate(getEmployeeAnniversarySource(employee)))],
        ['Tenure Months', employee.tenureMonths || employee.tenure_months],
        ['Tenure Years', employee.tenureYears || employee.tenure_years],
        ['Benefits Status', employee.benefitsStatus || employee.benefits_status],
        ['Benefits Eligibility', formatBenefitsEligibilitySummary(employee)],
        ['Tenure Bracket', employee.tenureBracket || employee.tenure_bracket]
    ];

    const details = domGet('drawerDetails');

    if (details) {
        details.innerHTML = detailRows.map(([label, value]) => `
      <div class="detail-card">
        <div class="detail-label">${domEsc(label)}</div>
        <div class="detail-value">${domEsc(value)}</div>
      </div>
    `).join('');
    }

    const setLoading = (id, text) => {
        const el = domGet(id);
        if (el) el.innerHTML = `<div class="empty">${text}</div>`;
    };

    setLoading('notesHistory', 'Loading notes...');
    setLoading('disciplineHistory', 'Loading discipline history...');
    setLoading('meetingsHistory', 'Loading meetings...');
    setLoading('incidentsHistory', 'Loading incidents...');
    setLoading('ecHistory', 'Loading emergency contact...');
    setLoading('docHistory', 'Loading documents...');
    const canLoadReviews =
        typeof window.canAccessPerformanceReviews !== 'function' ||
        window.canAccessPerformanceReviews(employee);

    if (canLoadReviews) {
        setLoading('reviewsHistory', 'Loading reviews...');
    }
    setLoading('stayInterviewHistory', 'Loading stay interviews...');
    setLoading('onboardingHistory', 'Loading onboarding...');

    const backdrop = domGet('drawerBackdrop');
    const drawer = domGet('employeeDrawer');

    if (drawer) {
        renderEmployeeDrawerIdentityHeader(employee);
    }

    backdrop?.classList.add('open');

    if (drawer) {
        drawer.classList.remove('closing');
        requestAnimationFrame(() => {
            drawer.classList.add('open');
            activateEmployeeDrawerA11y(drawer, backdrop);
        });
    }

    const markAtRiskBtn = domGet('markAtRiskBtn');
    const clearAtRiskBtn = domGet('clearAtRiskBtn');
    const markImpactPlayerBtn = domGet('markImpactPlayerBtn');
    const clearImpactPlayerBtn = domGet('clearImpactPlayerBtn');

    if (markAtRiskBtn && typeof window.markEmployeeAtRisk === 'function') {
        markAtRiskBtn.onclick = window.markEmployeeAtRisk;
    }
    if (clearAtRiskBtn && typeof window.clearAtRiskStatus === 'function') {
        clearAtRiskBtn.onclick = window.clearAtRiskStatus;
    }
    if (markImpactPlayerBtn && typeof window.markImpactPlayer === 'function') {
        markImpactPlayerBtn.onclick = window.markImpactPlayer;
    }
    if (clearImpactPlayerBtn && typeof window.clearImpactPlayerStatus === 'function') {
        clearImpactPlayerBtn.onclick = window.clearImpactPlayerStatus;
    }

    cleanVisibleDrawerNameInputs();
}

/** Closes the employee drawer only (used internally — use closeActiveDrawer for shared backdrop). */
export function closeDrawer(): void {
    const backdrop = domGet('drawerBackdrop');
    const drawer = domGet('employeeDrawer');

    backdrop?.classList.remove('open');
    deactivateEmployeeDrawerA11y(drawer, backdrop);

    if (drawer) {
        drawer.classList.add('closing');
        drawer.classList.remove('open');

        setTimeout(() => {
            drawer.classList.remove('closing');
        }, 250);
    }

    removeDrawerIdentityHeader('employeeDrawerIdentityHeader');
    document.getElementById('employeeDrawerChrome')?.replaceChildren();
    if (typeof window.clearEmployeeDrawerRiskSignals === 'function') {
      window.clearEmployeeDrawerRiskSignals();
    }
    setEmployeeDrawerCreateMode(false);
    ensureDrawerLayout('employeeDrawer');

    if (drawer) {
        restoreDrawerLegacyHeader(drawer);
    }

    window.currentEmployee = null;

    if (typeof window.setCurrentEmployeeForOrbis === 'function') {
        window.setCurrentEmployeeForOrbis(null);
    }

    if (typeof resetDrawerForms === 'function') {
        resetDrawerForms();
    }
}

export function switchDrawerTab(tabName: string): void {
    if (typeof window.switchTab === 'function') {
        window.switchTab(tabName);
        if (
            !window.isCreatingEmployee &&
            (tabName === 'admin' ||
            tabName === 'employee' ||
            tabName === 'employeeAdmin' ||
            tabName === 'employee-admin')
        ) {
            scheduleEmployeeAdminPopulate(25);
            scheduleEmployeeAdminPopulate(150);
        }
        return;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

export function bindDrawerEvents(): void {
    const closeBtn = document.getElementById('drawerClose');

    if (closeBtn) {
        closeBtn.onclick = closeDrawer;
    }

    const addEmployeeBtn = document.getElementById('addEmployeeBtn');
    if (addEmployeeBtn && !(addEmployeeBtn as HTMLElement & { __orbisAddBound?: boolean }).__orbisAddBound) {
        (addEmployeeBtn as HTMLElement & { __orbisAddBound?: boolean }).__orbisAddBound = true;
        addEmployeeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            if (typeof window.openNewEmployeeForm === 'function') {
                window.openNewEmployeeForm();
            }
        });
    }

    document.querySelectorAll("button[onclick='openNewEmployeeForm()']").forEach((btn) => {
        const el = btn as HTMLButtonElement;
        if ((el as HTMLElement & { __orbisAddBound?: boolean }).__orbisAddBound) return;
        (el as HTMLElement & { __orbisAddBound?: boolean }).__orbisAddBound = true;
        el.removeAttribute('onclick');
        el.addEventListener('click', (event) => {
            event.preventDefault();
            if (typeof window.openNewEmployeeForm === 'function') {
                window.openNewEmployeeForm();
            }
        });
    });

    const backdrop = document.getElementById('drawerBackdrop');

    if (backdrop) {
        backdrop.onclick = (event) => {
            if (event.target === backdrop) {
                closeDrawer();
            }
        };
    }

    if (!window.drawerEscapeKeyBound) {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const drawer = document.getElementById('employeeDrawer');
                if (drawer?.classList.contains('open')) {
                    closeDrawer();
                }
            }
        });

        window.drawerEscapeKeyBound = true;
    }

    if (typeof window.initAccessibleDrawerTabs === 'function') {
        window.initAccessibleDrawerTabs();
    }
}

window.getResolvedDrawerEmployeeId = getResolvedDrawerEmployeeId;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.renderEmployeeDrawerIdentityHeader = renderEmployeeDrawerIdentityHeader;
window.openNewEmployeeDrawer = openNewEmployeeDrawer;
window.ensureEmployeeDrawerVisible = ensureEmployeeDrawerVisible;
window.bindDrawerEvents = bindDrawerEvents;
window.forcePopulateEmployeeAdminPanel = forcePopulateEmployeeAdminPanel;
window.drawerEscapeKeyBound = window.drawerEscapeKeyBound || false;
window.getDrawerHeaderEmployeeId = getDrawerHeaderEmployeeId;
window.formatDrawerDateForDisplay = formatDrawerDateForDisplay;
window.getNextUpcomingAnniversaryDate = getNextUpcomingAnniversaryDate;

bindDrawerEvents();
ensureDrawerLayout('employeeDrawer');
ensureDrawerLayout('candidateDrawer');

setInterval(() => {
    const drawer = domGet('employeeDrawer');
    const adminPanel = getVisibleEmployeeAdminPanel();

    if (
        !drawer?.classList.contains('open') ||
        !adminPanel ||
        window.isCreatingEmployee ||
        !window.currentEmployee
    ) {
        return;
    }

    const nextAnniversary = getNextUpcomingAnniversaryDate(
        getEmployeeAnniversarySource(window.currentEmployee)
    );

    setDrawerAdminField(
        ['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'],
        nextAnniversary
    );
}, 1000);
