// Employee admin form population, update, delete, terminate

import { supabaseClient } from '../services/supabaseClient';
import { recordAuditEvent } from '../services/auditTrail';
import { cleanEmployeeNameValue } from '../services/employeeUtils';
import { showOrbisConfirm } from '../ui/confirmModal';
import { resetDrawerForms } from './drawerForms';
import { generateAvailableEmployeeId } from '../services/employeeIds';
import { openNewEmployeeDrawer } from '../ui/drawerUi';

type EmployeeRow = Record<string, unknown>;

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function getCurrentEmployee(): EmployeeRow | null {
  return (window.currentEmployee as EmployeeRow | null) || null;
}

async function refreshDashboardAfterEmployeeChange(): Promise<void> {
  if (typeof window.loadAllDashboardData === 'function') {
    await window.loadAllDashboardData();
    return;
  }
  if (typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
  }
  if (typeof window.loadReviewDashboardFallback === 'function') {
    await window.loadReviewDashboardFallback();
  }
  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export async function deleteEmployeeById(
  employeeId: string
): Promise<{ error: Error | null }> {
  const targetId = String(employeeId || '').trim();
  if (!targetId) {
    return { error: new Error('No employee ID provided') };
  }

  const relatedTables = [
    'onboarding_tasks',
    'employee_notes',
    'employee_meetings',
    'employee_reviews',
    'discipline_reports',
    'incident_reports',
    'stay_interviews',
    'emergency_contacts',
    'employee_audit_log',
  ];

  for (const table of relatedTables) {
    const { error } = await supabaseClient.from(table).delete().eq('employee_id', targetId);
    if (error) {
      console.warn(`Could not delete related rows from ${table}:`, error);
    }
  }

  const { error } = await supabaseClient.from('employees').delete().eq('id', targetId);
  if (error) {
    console.error('Employee delete failed:', error);
    return { error };
  }

  return { error: null };
}

export async function runDeleteEmployee(): Promise<void> {
  const currentEmployee = getCurrentEmployee();
  if (!currentEmployee) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const employeeName =
    `${currentEmployee.first || currentEmployee.first_name || ''} ${currentEmployee.last || currentEmployee.last_name || ''}`.trim() ||
    'this employee';

  const confirmed = await showOrbisConfirm(
    `Permanently delete ${employeeName}'s employee file? This removes the record completely and cannot be undone.`,
    {
      title: 'Delete employee',
      confirmLabel: 'Delete permanently',
      danger: true,
    }
  );

  if (!confirmed) return;

  const employeeId = String(
    currentEmployee.id || currentEmployee.employee_id || currentEmployee.dbId || ''
  );
  const { error } = await deleteEmployeeById(employeeId);

  if (error) {
    showToast(error.message || 'Could not delete employee.', 'error');
    return;
  }

  recordAuditEvent('Deleted Employee', currentEmployee, 'Employee record permanently deleted.');
  showToast('Employee deleted permanently.', 'success');
  await refreshDashboardAfterEmployeeChange();

  if (typeof window.closeDrawer === 'function') {
    window.closeDrawer();
  }
}

export async function runTerminateEmployee(): Promise<void> {
  const currentEmployee = getCurrentEmployee();
  if (!currentEmployee) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const employeeName =
    `${currentEmployee.first || currentEmployee.first_name || ''} ${currentEmployee.last || currentEmployee.last_name || ''}`.trim() ||
    'this employee';

  const confirmed = await showOrbisConfirm(
    `Terminate ${employeeName}? This will mark them as TERMINATED but keep their file.`,
    {
      title: 'Terminate employee',
      confirmLabel: 'Terminate',
      danger: true,
    }
  );

  if (!confirmed) return;

  const targetId = String(
    currentEmployee.id || currentEmployee.employee_id || currentEmployee.dbId || ''
  ).trim();

  const { error } = await supabaseClient
    .from('employees')
    .update({
      status: 'TERMINATED',
      termination_date: new Date().toISOString().slice(0, 10),
      termination_reason: 'Not specified',
      notes: currentEmployee.notes
        ? `${currentEmployee.notes}\n\nTerminated employee file retained for turnover history.`
        : 'Terminated employee file retained for turnover history.',
    })
    .eq('id', targetId);

  if (error) {
    console.error(error);
    showToast('Could not terminate employee.', 'error');
    return;
  }

  recordAuditEvent(
    'Terminated Employee',
    currentEmployee,
    'Employee marked terminated with file retained for turnover reporting.'
  );
  showToast('Employee terminated. File retained for turnover reporting.', 'success');
  await refreshDashboardAfterEmployeeChange();

  if (typeof window.closeDrawer === 'function') {
    window.closeDrawer();
  }
}

export async function updateEmployeeById(
  employeeId: string,
  payload: EmployeeRow
): Promise<{ data: EmployeeRow | null; error: Error | null }> {
  const targetId = String(
    employeeId || payload?.id || payload?.employee_id || payload?.dbId || ''
  ).trim();

  if (!targetId) {
    return { data: null, error: new Error('No employee ID provided') };
  }

  const cleanPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'nextReviewDate')) {
    cleanPayload.next_review_date = cleanPayload.nextReviewDate || null;
  }
  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'nextReview')) {
    cleanPayload.next_review_date = cleanPayload.nextReview || null;
  }
  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'next_review')) {
    cleanPayload.next_review_date = cleanPayload.next_review || null;
  }

  const stripKeys = [
    'nextReviewDate',
    'nextReview',
    'next_review',
    'dbId',
    'employee_id',
    'employeeId',
    'displayId',
    'displayName',
    'displayStatus',
    'displayStatusLabel',
    'displayDepartment',
    'displayPosition',
    'displaySupervisor',
    'hireDate',
    'terminationDate',
    'tenureMonths',
    'tenureYears',
    'payType',
    'benefitsStatus',
    'first',
    'last',
    'dept',
  ];
  stripKeys.forEach((key) => delete cleanPayload[key]);

  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'first_name')) {
    cleanPayload.first_name = cleanEmployeeNameValue(cleanPayload.first_name);
  }
  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'last_name')) {
    cleanPayload.last_name = cleanEmployeeNameValue(cleanPayload.last_name);
  }

  const { data, error } = await supabaseClient
    .from('employees')
    .update(cleanPayload)
    .eq('id', targetId)
    .select();

  if (error) {
    console.error('Employee update failed:', error);
    return { data: null, error };
  }

  return { data: (Array.isArray(data) ? data[0] : data) as EmployeeRow, error: null };
}

export function populateEmployeeAdminForm(employee: EmployeeRow | null | undefined): void {
  if (!employee) return;

  let normalized = employee;
  if (typeof window.normalizeEmployee === 'function') {
    normalized = window.normalizeEmployee(employee) as EmployeeRow;
  }
  if (!normalized) return;

  const drawerTitleName = String(safeGet('drawerTitle')?.textContent || '').trim();
  const drawerSubParts = String(safeGet('drawerSub')?.textContent || '')
    .split('•')
    .map((part) => part.trim());
  const fallbackName =
    `${normalized.first_name || ''} ${normalized.last_name || ''}`.trim() || drawerTitleName;
  const nameParts = String(fallbackName).trim().split(/\s+/).filter(Boolean);

  const values = {
    employeeId: normalized.employee_id || normalized.id || normalized.dbId || '',
    status: normalized.status || 'Active',
    firstName: cleanEmployeeNameValue(normalized.first_name || nameParts[0] || ''),
    lastName: cleanEmployeeNameValue(
      normalized.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '')
    ),
    department: normalized.department || drawerSubParts[1] || '',
    position: normalized.position || drawerSubParts[0] || '',
    supervisor: normalized.supervisor || '',
    payType: normalized.pay_type || '',
    standardHours: normalized.standard_hours || '',
    benefitsStatus: normalized.benefits_status || '',
    hireDate: normalized.hire_date || '',
    terminationDate: normalized.termination_date || '',
    nextReviewDate: normalized.next_review_date || '',
    anniversaryDate: normalized.anniversary_date || '',
    tenureBracket: normalized.tenure_bracket || '',
    workEmail: normalized.work_email || '',
    personalEmail: normalized.personal_email || '',
    phone: normalized.phone || '',
    notes: normalized.notes || '',
  };

  const employeeAdminRoot =
    safeGet('tab-employee') ||
    safeGet('tab-profile') ||
    document.querySelector('#tab-employee, #tab-profile');

  const findEmployeeAdminField = (id: string): HTMLElement | null => {
    if (!employeeAdminRoot) return null;
    try {
      return employeeAdminRoot.querySelector(`#${CSS.escape(id)}`);
    } catch {
      return employeeAdminRoot.querySelector(`#${id}`);
    }
  };

  const setField = (id: string, value: unknown) => {
    const el = findEmployeeAdminField(id) as HTMLInputElement | null;
    if (!el) return;
    el.value = String(value ?? '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const setByPlaceholder = (placeholder: string, value: unknown) => {
    if (!employeeAdminRoot) return;
    const el = employeeAdminRoot.querySelector(
      `input[placeholder="${placeholder}"], select[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`
    ) as HTMLInputElement | null;
    if (!el) return;
    el.value = String(value ?? '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setField('empId', values.employeeId);
  setField('employeeId', values.employeeId);
  setField('empEmployeeId', values.employeeId);
  setByPlaceholder('Employee ID', values.employeeId);
  setField('empStatus', values.status);
  setField('status', values.status);
  setField('empFirstName', values.firstName);
  setField('firstName', values.firstName);
  setField('employeeFirstName', values.firstName);
  setByPlaceholder('First name', values.firstName);
  setField('empLastName', values.lastName);
  setField('lastName', values.lastName);
  setField('employeeLastName', values.lastName);
  setByPlaceholder('Last name', values.lastName);
  setField('empDepartment', values.department);
  setField('department', values.department);
  setField('employeeDepartment', values.department);
  setByPlaceholder('Department', values.department);
  setField('empPosition', values.position);
  setField('position', values.position);
  setField('employeePosition', values.position);
  setByPlaceholder('Position', values.position);
  setField('empSupervisor', values.supervisor);
  setField('supervisor', values.supervisor);
  setByPlaceholder('Supervisor', values.supervisor);
  setField('empPayType', values.payType);
  setField('payType', values.payType);
  setByPlaceholder('Hourly, Salary, etc.', values.payType);
  setField('empStandardHours', values.standardHours);
  setField('standardHours', values.standardHours);
  setByPlaceholder('40', values.standardHours);
  setField('empBenefitsStatus', values.benefitsStatus);
  setField('benefitsStatus', values.benefitsStatus);
  setByPlaceholder('Benefits status', values.benefitsStatus);
  setField('empHireDate', values.hireDate);
  setField('hireDate', values.hireDate);
  setField('employeeHireDateInput', values.hireDate);
  setField('employeeTerminationDateInput', values.terminationDate);
  setField('empTerminationDate', values.terminationDate);
  setField('terminationDate', values.terminationDate);
  setField('empNextReviewDate', values.nextReviewDate);
  setField('nextReviewDate', values.nextReviewDate);
  setField('employeeNextReviewInput', values.nextReviewDate);
  setField('empAnniversaryDate', values.anniversaryDate);
  setField('anniversaryDate', values.anniversaryDate);
  setField('empTenureBracket', values.tenureBracket);
  setField('tenureBracket', values.tenureBracket);
  setField('empWorkEmail', values.workEmail);
  setField('workEmail', values.workEmail);
  setField('empPersonalEmail', values.personalEmail);
  setField('personalEmail', values.personalEmail);
  setField('empPhone', values.phone);
  setField('phone', values.phone);
  setField('empNotes', values.notes);
  setField('notes', values.notes);

  const drawer = safeGet('employeeDrawer') || document.querySelector('#employeeDrawer');
  const statusSelect =
    (safeGet('empStatus') as HTMLSelectElement | null) ||
    (safeGet('status') as HTMLSelectElement | null) ||
    (drawer?.querySelector('select#empStatus') as HTMLSelectElement | null) ||
    (drawer?.querySelector('select#status') as HTMLSelectElement | null) ||
    (Array.from(drawer?.querySelectorAll('select') || []).find((select) =>
      Array.from(select.options || []).some((option) => {
        const optionText = option.textContent?.trim().toLowerCase() || '';
        return (
          optionText === 'active' ||
          optionText === 'inactive' ||
          optionText === 'leave' ||
          optionText === 'terminated'
        );
      })
    ) as HTMLSelectElement | undefined);

  if (statusSelect) {
    const requiredStatuses = [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
      { value: 'LEAVE', label: 'Leave' },
      { value: 'TERMINATED', label: 'Terminated' },
    ];
    const existingStatuses = Array.from(statusSelect.options || []).map((option) =>
      String(option.value || option.textContent || '')
        .trim()
        .toUpperCase()
    );
    requiredStatuses.forEach((statusOption) => {
      if (!existingStatuses.includes(statusOption.value)) {
        const option = document.createElement('option');
        option.value = statusOption.value;
        option.textContent = statusOption.label;
        statusSelect.appendChild(option);
      }
    });
    const normalizedStatus = String(values.status || '')
      .trim()
      .toUpperCase();
    const matchingOption = Array.from(statusSelect.options || []).find((option) => {
      return (
        String(option.value || '')
          .trim()
          .toUpperCase() === normalizedStatus ||
        String(option.textContent || '')
          .trim()
          .toUpperCase() === normalizedStatus
      );
    });
    statusSelect.value = matchingOption ? matchingOption.value : 'ACTIVE';
    statusSelect.dispatchEvent(new Event('input', { bubbles: true }));
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  syncEmployeeTerminationDateFieldVisibility(values.status);
}

function unlockEmployeeIdFields(): void {
  const drawer = safeGet('employeeDrawer') || document.querySelector('#employeeDrawer');
  const fields = drawer
    ? Array.from(
        drawer.querySelectorAll<HTMLInputElement>(
          'input.locked-field, #employeeIdInput, #empId, #employeeId, #empEmployeeId'
        )
      )
    : [];

  fields.forEach((field) => {
    field.readOnly = false;
    field.removeAttribute('readonly');
    field.removeAttribute('aria-readonly');
    field.classList.remove('locked-field');
    field.title = '';
  });
}

export function clearEmployeeAdminForm(): void {
  const fieldIds = [
    'employeeIdInput',
    'empId',
    'employeeId',
    'empEmployeeId',
    'employeeStatusInput',
    'empStatus',
    'status',
    'employeeFirstNameInput',
    'empFirstName',
    'firstName',
    'employeeFirstName',
    'employeeLastNameInput',
    'empLastName',
    'lastName',
    'employeeLastName',
    'employeeDepartmentInput',
    'empDepartment',
    'department',
    'employeeDepartment',
    'employeePositionInput',
    'empPosition',
    'position',
    'employeePosition',
    'employeeSupervisorInput',
    'empSupervisor',
    'supervisor',
    'employeePayTypeInput',
    'empPayType',
    'payType',
    'employeeStandardHoursInput',
    'empStandardHours',
    'standardHours',
    'employeeBenefitsStatusInput',
    'empBenefitsStatus',
    'benefitsStatus',
    'employeeHireDateInput',
    'empHireDate',
    'hireDate',
    'employeeTerminationDateInput',
    'empTerminationDate',
    'terminationDate',
    'employeeNextReviewInput',
    'empNextReviewDate',
    'nextReviewDate',
    'employeeAnniversaryDateInput',
    'empAnniversaryDate',
    'anniversaryDate',
    'employeeTenureBracketInput',
    'empTenureBracket',
    'tenureBracket',
    'employeeWorkEmailInput',
    'empWorkEmail',
    'workEmail',
    'employeePersonalEmailInput',
    'empPersonalEmail',
    'personalEmail',
    'employeePhoneInput',
    'empPhone',
    'phone',
    'employeeNotesInput',
    'empNotes',
    'notes',
  ];

  fieldIds.forEach((id) => {
    const el = safeGet(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!el) return;
    if (el instanceof HTMLSelectElement) {
      const activeOption = Array.from(el.options).find(
        (option) => String(option.value || option.textContent || '').trim().toUpperCase() === 'ACTIVE'
      );
      el.value = activeOption?.value || 'ACTIVE';
    } else {
      el.value = '';
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const remoteInput = safeGet('employeeIsRemoteInput') as HTMLInputElement | null;
  if (remoteInput) {
    remoteInput.checked = false;
    remoteInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  unlockEmployeeIdFields();
  syncEmployeeTerminationDateFieldVisibility('ACTIVE');
}

export function syncEmployeeTerminationDateFieldVisibility(status?: unknown): void {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();

  const resolvedStatus =
    normalized ||
    String(
      (safeGet('employeeStatusInput') as HTMLSelectElement | null)?.value ||
        (safeGet('empStatus') as HTMLSelectElement | null)?.value ||
        (safeGet('status') as HTMLSelectElement | null)?.value ||
        ''
    )
      .trim()
      .toUpperCase();

  const showField = resolvedStatus === 'TERMINATED';
  const fieldWrap = safeGet('employeeTerminationDateField');

  if (fieldWrap) {
    fieldWrap.hidden = !showField;
  }

  const terminationInput = safeGet('employeeTerminationDateInput') as HTMLInputElement | null;

  if (terminationInput) {
    terminationInput.disabled = !showField;
    if (!showField) {
      terminationInput.value = '';
    }
  }
}

function bindEmployeeTerminationDateVisibility(): void {
  if ((window as { __employeeTerminationDateBind?: boolean }).__employeeTerminationDateBind) {
    return;
  }

  (window as { __employeeTerminationDateBind?: boolean }).__employeeTerminationDateBind = true;

  const statusSelectors = ['employeeStatusInput', 'empStatus', 'status'];

  statusSelectors.forEach((id) => {
    const select = safeGet(id) as HTMLSelectElement | null;

    if (!select) return;

    select.addEventListener('change', () => {
      syncEmployeeTerminationDateFieldVisibility(select.value);
    });
  });
}

bindEmployeeTerminationDateVisibility();

function setText(id: string, value: unknown): void {
  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }
  const el = safeGet(id);
  if (el) el.textContent = String(value ?? '');
}

export function sanitizeVisibleEmployeeNameFields(): void {
  const ids = [
    'empFirstName',
    'firstName',
    'employeeFirstName',
    'empLastName',
    'lastName',
    'employeeLastName',
  ];
  ids.forEach((id) => {
    const field = safeGet(id) as HTMLInputElement | null;
    if (!field || typeof field.value !== 'string') return;
    const cleaned = cleanEmployeeNameValue(field.value);
    if (field.value !== cleaned) {
      field.value = cleaned;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

export function openNewEmployeeForm(): void {
  window.currentEmployee = null;
  window.selectedEmployeeId = null;
  window.isCreatingEmployee = true;

  if (typeof window.setCurrentEmployeeForOrbis === 'function') {
    window.setCurrentEmployeeForOrbis(null);
  }

  resetDrawerForms();
  window.isCreatingEmployee = true;

  clearEmployeeAdminForm();

  void (async () => {
    try {
      const nextEmployeeId = await generateAvailableEmployeeId();

      ['employeeIdInput', 'employeeId', 'empId', 'empEmployeeId'].forEach((fieldId) => {
        const field = safeGet(fieldId) as HTMLInputElement | null;

        if (!field) {
          return;
        }

        field.value = nextEmployeeId;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } catch (error) {
      console.warn('[EmployeeAdmin] Could not assign next employee ID:', error);
    }
  })();

  setText('drawerTitle', 'New Employee');
  setText('drawerSub', 'Create employee record');

  const details = safeGet('drawerDetails');
  if (details) {
    details.innerHTML =
      '<div class="detail-card"><div class="detail-label">New Record</div><div class="detail-value">Complete the Employee Admin tab to create a new employee.</div></div>';
  }

  if (typeof window.resetEmployeeForm === 'function') {
    window.resetEmployeeForm();
  }

  const saveBtn = safeGet('saveEmployeeBtn');
  if (saveBtn) saveBtn.textContent = 'Save Employee';

  const emptyPanels: [string, string][] = [
    ['notesHistory', 'Save the employee before adding notes.'],
    ['disciplineHistory', 'Save the employee before adding discipline records.'],
    ['meetingsHistory', 'Save the employee before adding meetings.'],
    ['ecHistory', 'Save the employee before adding an emergency contact.'],
    ['reviewsHistory', 'Save the employee before adding reviews.'],
    ['incidentsHistory', 'Save the employee before adding incident reports.'],
    ['stayInterviewHistory', 'Save the employee before adding stay interviews.'],
    ['docHistory', 'Save the employee before uploading documents.'],
    ['onboardingChecklist', 'Save the employee before loading onboarding tasks.'],
  ];
  emptyPanels.forEach(([id, message]) => {
    const el = safeGet(id);
    if (el) el.innerHTML = `<div class="empty">${message}</div>`;
  });

  const summary = safeGet('onboardingSummary');
  if (summary) summary.textContent = '0 of 0 complete';
  const bar = safeGet('onboardingProgressBar') as HTMLElement | null;
  if (bar) bar.style.width = '0%';

  if (typeof window.ensureDrawerLayout === 'function') {
    window.ensureDrawerLayout('employeeDrawer');
  }

  openNewEmployeeDrawer();

  if (typeof window.ensureDrawerLayout === 'function') {
    window.ensureDrawerLayout('employeeDrawer');
  }

  syncEmployeeTerminationDateFieldVisibility('ACTIVE');

  if (typeof window.applyRolePermissions === 'function') {
    window.applyRolePermissions();
  }
}

export function createEmployee(): void {
  const activeEmployee = window.currentEmployee as EmployeeRow | null;
  if (activeEmployee && typeof window.saveEmployeeForm === 'function') {
    void window.saveEmployeeForm();
    return;
  }
  openNewEmployeeForm();
}

declare global {
  interface Window {
    populateEmployeeAdminForm?: (employee: EmployeeRow) => void;
    updateEmployeeById?: (
      employeeId: string,
      payload: EmployeeRow
    ) => Promise<{ data: EmployeeRow | null; error: Error | null }>;
    deleteEmployeeById?: (employeeId: string) => Promise<{ error: Error | null }>;
    runDeleteEmployee?: () => Promise<void>;
    runTerminateEmployee?: () => Promise<void>;
    openNewEmployeeForm?: () => void;
    clearEmployeeAdminForm?: () => void;
    createEmployee?: () => void;
    sanitizeVisibleEmployeeNameFields?: () => void;
    resetEmployeeForm?: () => void;
    renderEmployeeDrawerIdentityHeader?: (employee: EmployeeRow | null | undefined) => void;
    syncEmployeeTerminationDateFieldVisibility?: (status?: unknown) => void;
  }
}

window.populateEmployeeAdminForm = populateEmployeeAdminForm;
window.updateEmployeeById = updateEmployeeById;
window.deleteEmployeeById = deleteEmployeeById;
window.runDeleteEmployee = runDeleteEmployee;
window.runTerminateEmployee = runTerminateEmployee;
window.openNewEmployeeForm = openNewEmployeeForm;
window.clearEmployeeAdminForm = clearEmployeeAdminForm;
window.createEmployee = createEmployee;
window.sanitizeVisibleEmployeeNameFields = sanitizeVisibleEmployeeNameFields;
window.syncEmployeeTerminationDateFieldVisibility = syncEmployeeTerminationDateFieldVisibility;
