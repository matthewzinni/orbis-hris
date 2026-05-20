// Drawer open/close UI (ported from js/ui/drawer.js)

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

declare global {
  interface Window {
    EMPLOYEES?: DrawerUiEmployee[];
    currentEmployee?: DrawerUiEmployee | null;
    isCreatingEmployee?: boolean;
    safeGet?: (id: string) => HTMLElement | null;
    esc?: (value: unknown) => string;
    switchTab?: (tabName: string) => void;
    setText?: (id: string, value: unknown) => void;
    resetDrawerForms?: () => void;
    setCurrentEmployeeForOrbis?: (employee: DrawerUiEmployee | null) => void;
    populateEmployeeForm?: (employee: DrawerUiEmployee) => void;
    ensureDeleteEmployeeButton?: () => void;
    runTerminateEmployee?: () => void;
    applyRolePermissions?: () => void;
    loadEmployeeNotes?: (employeeId: string) => void;
    loadEmployeeDiscipline?: (employeeId: string) => void;
    loadEmployeeMeetings?: (employeeId: string) => void;
    loadEmergencyContacts?: (employeeId: string) => void;
    loadEmployeeDocuments?: (employeeId: string) => void;
    loadEmployeeReviews?: (employeeId: string) => void;
    loadEmployeeIncidents?: (employeeId: string) => void;
    loadStayInterviews?: (employeeId: string) => void;
    loadEmployeeOnboarding?: (employeeId: string) => void;
    loadEmployeeManualAtRisk?: (employeeId: string) => void;
    loadEmployeeManualImpactPlayer?: (employeeId: string) => void;
    loadEmployeeHistory?: (employeeId: string) => void;
    markEmployeeAtRisk?: () => void;
    clearAtRiskStatus?: () => void;
    markImpactPlayer?: () => void;
    clearImpactPlayerStatus?: () => void;
    openDrawer?: (employee: DrawerUiEmployee) => void;
    closeDrawer?: () => void;
    switchDrawerTab?: (tabName: string) => void;
    bindDrawerEvents?: () => void;
    forcePopulateEmployeeAdminPanel?: (employee: DrawerUiEmployee | null | undefined) => void;
    drawerEscapeKeyBound?: boolean;
    getResolvedDrawerEmployeeId?: (employee?: DrawerUiEmployee | null) => string | null;
    getDrawerHeaderEmployeeId?: () => string;
    formatDrawerDateForDisplay?: (value: unknown) => string;
    getNextUpcomingAnniversaryDate?: (value: unknown) => string;
  }
}

function domGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }

  return document.getElementById(id) as T | null;
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
    const drawer = domGet('employeeDrawer');

    if (!drawer) return;

    const normalizedTarget = normalizeDrawerLabelText(labelText);
    const possibleLabels = Array.from(drawer.querySelectorAll('label, .field-label, .form-label, .detail-label, [class*="label"], div, span'));

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
    const nextReview = formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || '');
    const anniversaryDate = getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || '');

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
    setDrawerAdminFieldByLabel('Hire Date', hireDate);
    setDrawerAdminFieldByLabel('Next Review Date', nextReview);
    setDrawerAdminFieldByLabel('Anniversary Date', anniversaryDate);
}

export function forcePopulateEmployeeAdminPanel(employee: DrawerUiEmployee | null | undefined): void {

    forcePopulateEmployeeAdminFields(employee);

    forcePopulateEmployeeAdminFieldsByLabels(employee);

    forcePopulateVisibleEmployeeAdminPanel(employee);

    setDrawerAdminField(['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'], getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || ''));

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

    const fields = Array.from(panel.querySelectorAll('input, select, textarea'));

    const values = [
        getDrawerHeaderEmployeeId() || getTrustedEmployeeDisplayId(employee),
        employee.status || 'Active',
        cleanDrawerEmployeeNameValue(employee.first || employee.first_name || ''),
        cleanDrawerEmployeeNameValue(employee.last || employee.last_name || ''),
        employee.dept || employee.department || '',
        employee.position || '',
        employee.supervisor || '',
        employee.payType || employee.pay_type || '',
        employee.stdHours || employee.standard_hours || '',
        employee.benefitsStatus || employee.benefits_status || '',
        formatDrawerDateForInput(employee.hireDate || employee.hire_date || ''),
        formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || ''),
        getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || ''),
        employee.tenureBracket || employee.tenure_bracket || ''
    ];

    fields.forEach((field, index) => {
        if (index >= values.length) return;

        field.value = values[index] || '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    });
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
    const nextReview = formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || '');
    const anniversaryDate = getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || '');

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
    setDrawerAdminField(['empNextReviewDate', 'nextReviewDate', 'nextReview', 'employeeNextReview', 'nextReviewInput', 'adminNextReview'], nextReview);
    setDrawerAdminField(['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'], anniversaryDate);
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

    const existingHeader = document.getElementById('employeeDrawerIdentityHeader');

    if (existingHeader) {
        existingHeader.remove();
    }

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
    setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 50);
    setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 250);
    setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 750);

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

    const detailRows = [
        ['Employee ID', displayEmployeeId],
        ['Status', employee.status],
        ['Department', employee.dept || employee.department],
        ['Position', employee.position],
        ['Supervisor', employee.supervisor],
        ['Pay Type', employee.payType || employee.pay_type],
        ['Standard Hours', employee.stdHours || employee.standard_hours],
        ['Hire Date', formatDrawerDateForDisplay(employee.hireDate || employee.hire_date)],
        ['Next Review', formatDrawerDateForDisplay(employee.nextReview || employee.next_review || employee.next_review_date)],
        ['Anniversary', formatDrawerDateForDisplay(getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date))],
        ['Tenure Months', employee.tenureMonths || employee.tenure_months],
        ['Tenure Years', employee.tenureYears || employee.tenure_years],
        ['Benefits Status', employee.benefitsStatus || employee.benefits_status],
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
    setLoading('reviewsHistory', 'Loading reviews...');
    setLoading('stayInterviewHistory', 'Loading stay interviews...');
    setLoading('onboardingHistory', 'Loading onboarding...');

    const backdrop = domGet('drawerBackdrop');
    const drawer = domGet('employeeDrawer');

    if (drawer) {
        const drawerIdentityHeader = document.createElement('div');

        drawerIdentityHeader.id = 'employeeDrawerIdentityHeader';
        drawerIdentityHeader.className = 'employee-drawer-identity-header';

        drawerIdentityHeader.innerHTML = `
            <div class="employee-drawer-avatar">${domEsc(employeeName.charAt(0).toUpperCase())}</div>
            <div class="employee-drawer-title-block">
                <div class="employee-drawer-name">${domEsc(employeeName)}</div>
                <div class="employee-drawer-meta">${domEsc(displayEmployeeId)} • ${domEsc(employeePosition)} • ${domEsc(employeeDepartment)}</div>
            </div>
            <div class="employee-drawer-header-actions">
                <div class="employee-drawer-status-pill">${domEsc(employeeStatus)}</div>
                <button type="button" class="employee-drawer-close-btn" id="employeeDrawerCloseBtn">×</button>
            </div>
        `;

        drawer.prepend(drawerIdentityHeader);

        const tabRow = drawer.querySelector('.tab-btn')?.parentElement ||
            drawer.querySelector('.drawer-tabs') ||
            drawer.querySelector('.tab-bar') ||
            drawer.querySelector('.tabs') ||
            drawer.querySelector('.tab-nav') ||
            drawer.querySelector('.tab-buttons') ||
            drawer.querySelector('.drawer-tab-row');

        if (tabRow && tabRow.parentElement !== drawer) {
            drawerIdentityHeader.after(tabRow);
        } else if (tabRow) {
            drawerIdentityHeader.after(tabRow);
        }

        const customCloseBtn = drawer.querySelector('#employeeDrawerCloseBtn');

        if (customCloseBtn) {
            customCloseBtn.onclick = () => closeDrawer();
        }

        const oldDrawerHeader = drawer.querySelector('.drawer-header');

        if (oldDrawerHeader) {
            oldDrawerHeader.style.display = 'none';
            oldDrawerHeader.style.height = '0';
            oldDrawerHeader.style.minHeight = '0';
            oldDrawerHeader.style.padding = '0';
            oldDrawerHeader.style.margin = '0';
            oldDrawerHeader.style.overflow = 'hidden';
        }

        const drawerContent = drawer.querySelector('.drawer-content') || drawer.querySelector('.drawer-body');

        if (drawerContent) {
            drawerContent.style.paddingTop = '0';
            drawerContent.style.marginTop = '0';
        }
    }

    backdrop?.classList.add('open');

    if (drawer) {
        drawer.classList.remove('closing');
        requestAnimationFrame(() => {
            drawer.classList.add('open');
        });
    }

    if (typeof window.loadEmployeeNotes === 'function') window.loadEmployeeNotes(employeeId);
    if (typeof window.loadEmployeeDiscipline === 'function') window.loadEmployeeDiscipline(employeeId);
    if (typeof window.loadEmployeeMeetings === 'function') window.loadEmployeeMeetings(employeeId);
    if (typeof window.loadEmergencyContacts === 'function') window.loadEmergencyContacts(employeeId);
    if (typeof window.loadEmployeeDocuments === 'function') window.loadEmployeeDocuments(employeeId);
    if (typeof window.loadEmployeeReviews === 'function') window.loadEmployeeReviews(employeeId);
    if (typeof window.loadEmployeeIncidents === 'function') window.loadEmployeeIncidents(employeeId);
    if (typeof window.loadStayInterviews === 'function') window.loadStayInterviews(employeeId);
    if (typeof window.loadEmployeeOnboarding === 'function') window.loadEmployeeOnboarding(employeeId);
    if (typeof window.loadEmployeeManualAtRisk === 'function') window.loadEmployeeManualAtRisk(employeeId);
    if (typeof window.loadEmployeeManualImpactPlayer === 'function') {
        window.loadEmployeeManualImpactPlayer(employeeId);
    }
    if (typeof window.loadEmployeeHistory === 'function') window.loadEmployeeHistory(employeeId);

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

    if (drawer) {
        drawer.classList.add('closing');
        drawer.classList.remove('open');

        setTimeout(() => {
            drawer.classList.remove('closing');
        }, 250);
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
            tabName === 'admin' ||
            tabName === 'employee' ||
            tabName === 'employeeAdmin' ||
            tabName === 'employee-admin'
        ) {
            setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 25);
            setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 150);
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

    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.dataset.tab;
            if (tabName) {
                if (typeof window.switchDrawerTab === 'function') {
                    window.switchDrawerTab(tabName);
                } else {
                    switchDrawerTab(tabName);
                }
            }

            const tabText = String(tab.textContent || '').trim().toLowerCase();
            const isEmployeeAdminTab = tabText.includes('employee admin') ||
                tabName === 'admin' ||
                tabName === 'employee' ||
                tabName === 'employeeAdmin' ||
                tabName === 'employee-admin';

            if (isEmployeeAdminTab) {
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 25);
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 150);
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 500);
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 1000);
            }
        };
    });
}


window.getResolvedDrawerEmployeeId = getResolvedDrawerEmployeeId;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.bindDrawerEvents = bindDrawerEvents;
window.forcePopulateEmployeeAdminPanel = forcePopulateEmployeeAdminPanel;
window.drawerEscapeKeyBound = window.drawerEscapeKeyBound || false;
window.getDrawerHeaderEmployeeId = getDrawerHeaderEmployeeId;
window.formatDrawerDateForDisplay = formatDrawerDateForDisplay;
window.getNextUpcomingAnniversaryDate = getNextUpcomingAnniversaryDate;

bindDrawerEvents();

setInterval(() => {
    const drawer = domGet('employeeDrawer');
    const adminPanel = getVisibleEmployeeAdminPanel();

    if (!drawer?.classList.contains('open') || !adminPanel || !window.currentEmployee) return;

    const nextAnniversary = getNextUpcomingAnniversaryDate(
        window.currentEmployee.anniversaryDate ||
        window.currentEmployee.anniversary_date ||
        window.currentEmployee.hireDate ||
        window.currentEmployee.hire_date ||
        ''
    );

    setDrawerAdminField(
        ['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'],
        nextAnniversary
    );
}, 1000);
