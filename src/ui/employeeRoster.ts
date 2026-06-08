// =========================
// EMPLOYEE ROSTER MODULE (TypeScript)
// =========================

import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from './confirmModal';

type RosterEmployee = Record<string, unknown> & {
  id?: string;
  dbId?: string;
  employee_id?: string;
  employeeId?: string;
  first_name?: string;
  last_name?: string;
  first?: string;
  last?: string;
  displayName?: string;
  displayId?: string;
  department?: string;
  dept?: string;
  position?: string;
  supervisor?: string;
  status?: string;
  displayStatus?: string;
  displayStatusLabel?: string;
  displayDepartment?: string;
  displayPosition?: string;
  displaySupervisor?: string;
  displayHireDate?: string;
  hire_date?: string;
  hireDate?: string;
  termination_date?: string;
  terminationDate?: string;
  displayTerminationDate?: string;
};

type OrbisRosterWindow = Window & {
  EMPLOYEES?: RosterEmployee[];
  currentSort?: { column: string; direction: string };
  currentFilteredEmployees?: RosterEmployee[];
  rosterViewMode?: string;
  currentEmployee?: RosterEmployee;
  isCreatingEmployee?: boolean;
  currentAtRiskRosterMap?: Record<string, unknown>;
  currentImpactPlayerRosterMap?: Record<string, unknown>;
  openEmployeeDrawer?: (id: string) => Promise<void>;
  syncOpenedEmployeeRecordId?: (id: string) => void;
  loadEmployees?: () => Promise<unknown>;
  renderEmployeeRoster?: () => void;
  renderRoster?: () => void;
  bindRosterEvents?: () => void;
  bindAtRiskKpiHover?: () => void;
  clearFilters?: () => void;
  safeGet?: (id: string) => HTMLElement | null;
  esc?: (value: unknown) => string;
  fmtDate?: (value: unknown) => string;
  compareText?: (a: unknown, b: unknown) => number;
  showToast?: (message: string, type?: string) => void;
  populateEmployeeAdminForm?: (employee: RosterEmployee) => void;
  updateEmployeeRowBadges?: () => void;
  OrbisServices?: { employees?: { delete: (id: string) => Promise<{ error?: { message?: string } | null }> } };
};

const win = window as OrbisRosterWindow;

function getEmployeesList(): RosterEmployee[] {
  return Array.isArray(win.EMPLOYEES) ? win.EMPLOYEES : [];
}

function safeGet(id: string): HTMLElement | null {
  if (typeof win.safeGet === 'function') {
    return win.safeGet(id);
  }

  return document.getElementById(id);
}

function esc(value: unknown): string {
  if (typeof win.esc === 'function') {
    return win.esc(value);
  }

  return String(value ?? '');
}

function fmtDate(value: unknown): string {
  if (typeof win.fmtDate === 'function') {
    return win.fmtDate(value);
  }

  return String(value ?? '');
}

function compareText(a: unknown, b: unknown): number {
  if (typeof win.compareText === 'function') {
    return win.compareText(a, b);
  }

  return String(a ?? '').localeCompare(String(b ?? ''));
}

function showToast(message: string, type = 'success'): void {
  if (typeof win.showToast === 'function') {
    win.showToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

let rosterSearchTimer: ReturnType<typeof setTimeout> | null = null;

if (!win.currentSort) {
  win.currentSort = { column: 'name', direction: 'asc' };
}
if (typeof window.rosterViewMode === 'undefined') {
    window.rosterViewMode = 'active';
}

function cleanRosterEmployeeNameValue(value) {
    return String(value || '')
        .replace(/\bAt[-\s]*Risk\b/gi, '')
        .replace(/\bImpact\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatRosterStatus(status) {
    const value = String(status || '').trim();
    if (!value) return 'Active';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function statusBadge(status) {
    const normalized = String(status || '').trim().toUpperCase();
    if (normalized === 'ACTIVE') return 'badge badge-active';
    if (normalized === 'INACTIVE') return 'badge badge-inactive';
    if (normalized === 'TERMINATED') return 'badge badge-terminated';
    if (normalized === 'LEAVE') return 'badge badge-leave';
    if (normalized === 'ABSENT') return 'badge badge-absent';
    return 'badge badge-inactive';
}

function getRosterTerminationDate(employee: RosterEmployee): string {
    return String(
        employee.termination_date
        || employee.terminationDate
        || employee.displayTerminationDate
        || ''
    ).trim();
}

function isCompletedTermination(employee: RosterEmployee): boolean {
    const status = String(employee.status || employee.displayStatus || '').trim().toUpperCase();
    return status === 'TERMINATED' && Boolean(getRosterTerminationDate(employee));
}

function matchesRosterView(employee: RosterEmployee, rosterMode: string, explicitStatusFilter: string): boolean {
    const employeeStatus = String(employee.status || employee.displayStatus || '').trim().toUpperCase();

    if (explicitStatusFilter) {
        return employeeStatus === explicitStatusFilter;
    }

    if (rosterMode === 'former') {
        return employeeStatus === 'INACTIVE' || isCompletedTermination(employee);
    }

    if (rosterMode === 'active') {
        return (
            employeeStatus === 'ACTIVE'
            || employeeStatus === 'LEAVE'
            || employeeStatus === 'ABSENT'
            || (employeeStatus === 'TERMINATED' && !getRosterTerminationDate(employee))
        );
    }

    return true;
}

function normalizeEmployeeForRoster(employee) {
    if (!employee) return null;
    const firstName = cleanRosterEmployeeNameValue(employee.first_name || employee.firstName || employee.first || '');
    const lastName = cleanRosterEmployeeNameValue(employee.last_name || employee.lastName || employee.last || '');
    const department = employee.department || employee.dept || employee.displayDepartment || '';
    const position = employee.position || employee.title || employee.displayPosition || '';
    const supervisor = employee.supervisor || employee.displaySupervisor || '';
    const hireDate = employee.hire_date || employee.hireDate || employee.displayHireDate || '';
    const terminationDate =
      employee.termination_date || employee.terminationDate || employee.displayTerminationDate || '';
    const employeeId = employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || employee.displayId || '';
    const status = employee.status || employee.displayStatus || 'ACTIVE';
    const hasTerminationDate = Boolean(String(terminationDate).trim());
    const rosterDisplayStatus =
        String(status).trim().toUpperCase() === 'TERMINATED' && !hasTerminationDate
            ? 'ACTIVE'
            : status;
    const payType = employee.pay_type || employee.payType || '';
    const standardHours = employee.standard_hours || employee.standardHours || '';
    const benefitsStatus = employee.benefits_status || employee.benefitsStatus || '';
    const nextReviewDate = employee.next_review_date || employee.nextReviewDate || '';
    const anniversaryDate = employee.anniversary_date || employee.anniversaryDate || '';
    const tenureBracket = employee.tenure_bracket || employee.tenureBracket || '';
    return {
        ...employee,
        first_name: firstName,
        last_name: lastName,
        firstName,
        lastName,
        department,
        dept: department,
        position,
        supervisor,
        hire_date: hireDate,
        hireDate,
        employee_id: employeeId,
        employeeId,
        displayId: employeeId,
        displayName:
            `${firstName} ${lastName}`.trim()
            || cleanRosterEmployeeNameValue(
                employee.displayName
                || employee.name
                || employee.full_name
                || employee.fullName
                || ''
            )
            || 'Employee',
        displayDepartment: department,
        displayPosition: position,
        displaySupervisor: supervisor,
        displayHireDate: hireDate,
        termination_date: terminationDate,
        terminationDate,
        displayTerminationDate: terminationDate,
        displayStatus: rosterDisplayStatus,
        displayStatusLabel: formatRosterStatus(rosterDisplayStatus),
        pay_type: payType,
        payType,
        standard_hours: standardHours,
        standardHours,
        benefits_status: benefitsStatus,
        benefitsStatus,
        next_review_date: nextReviewDate,
        nextReviewDate,
        anniversary_date: anniversaryDate,
        anniversaryDate,
        tenure_bracket: tenureBracket,
        tenureBracket
    };
}

function getEmployeePublicId(employee, fallbackName = '') {
    const directId = employee?.employee_id
        || employee?.employeeId
        || employee?.employee_number
        || employee?.employeeNumber
        || employee?.employee_no
        || employee?.employeeNo
        || employee?.emp_id
        || employee?.empId
        || employee?.btw_id
        || employee?.btwId
        || employee?.displayId
        || '';
    if (String(directId).trim()) return String(directId).trim();
    const targetName = String(
        fallbackName
        || employee?.displayName
        || employee?.name
        || `${employee?.first_name || employee?.firstName || employee?.first || ''} ${employee?.last_name || employee?.lastName || employee?.last || ''}`
    ).trim().toLowerCase();
    if (!targetName) return '';
    const matchedRow = Array.from(document.querySelectorAll('tr.employee-row')).find(row => {
        const rowName = row.querySelector('.link-button')?.textContent?.trim().toLowerCase() || '';
        return rowName === targetName;
    });
    const rowId = matchedRow?.querySelector('td')?.textContent?.trim() || '';
    if (rowId) return rowId;
    const matchedEmployee = getEmployeesList().find(item => {
        const itemName = `${item.first_name || item.firstName || item.first || ''} ${item.last_name || item.lastName || item.last || ''}`.trim().toLowerCase();
        return itemName === targetName;
    });
    return String(
        matchedEmployee?.employee_id
        || matchedEmployee?.employeeId
        || matchedEmployee?.employee_number
        || matchedEmployee?.employeeNumber
        || matchedEmployee?.employee_no
        || matchedEmployee?.employeeNo
        || matchedEmployee?.emp_id
        || matchedEmployee?.empId
        || matchedEmployee?.btw_id
        || matchedEmployee?.btwId
        || matchedEmployee?.displayId
        || ''
    ).trim();
}

function formatRosterDateForInput(value: unknown): string {
    if (!value) return '';
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return '';
}

function getEmployeeAdminScope(): ParentNode {
    if (typeof window.getEmployeeAdminPanel === 'function') {
        const panel = window.getEmployeeAdminPanel();
        if (panel) return panel;
    }
    return document.getElementById('employeeDrawer') || document;
}

function populateEmployeeAdminFallback(employee) {
    if (!employee) return;
    const adminScope = getEmployeeAdminScope();
    const valueFrom = (...keys) => {
        for (const key of keys) {
            if (employee[key] !== undefined && employee[key] !== null && employee[key] !== '') {
                return employee[key];
            }
        }
        return '';
    };
    const drawerTitleName = String(document.getElementById('drawerTitle')?.textContent || '').trim();
    const drawerSubParts = String(document.getElementById('drawerSub')?.textContent || '')
        .split('•')
        .map(part => part.trim());
    const nameParts = String(
        valueFrom('displayName', 'name', 'full_name', 'fullName') || drawerTitleName
    ).trim().split(/\s+/).filter(Boolean);
    const employeePublicId = getEmployeePublicId(employee, drawerTitleName);
    const fallbackFirstName = nameParts[0] || '';
    const fallbackLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const isVisibleField = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    const applyValue = (el, value) => {
        if (!el) return;
        const previousSuppress = window.__suppressAuditDirty;
        window.__suppressAuditDirty = true;
        el.value = value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        window.__suppressAuditDirty = previousSuppress;
    };
    const setBySelector = (selector, value) => {
        const fields = Array.from(adminScope.querySelectorAll(selector));
        const el = fields.find(isVisibleField) || fields[0];
        applyValue(el, value);
    };
    const setByPlaceholder = (placeholder, value) => {
        setBySelector(`input[placeholder="${placeholder}"], select[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`, value);
    };
    const setByLabelText = (labelText, value) => {
        const labels = Array.from(adminScope.querySelectorAll('label'));
        const label = labels.find(item => item.textContent.trim().toLowerCase() === labelText.toLowerCase());
        if (!label) return;
        let field = null;
        if (label.htmlFor) {
            field = document.getElementById(label.htmlFor);
        }
        if (!field) {
            const wrapper = label.closest('div') || label.parentElement;
            field = wrapper?.querySelector('input, select, textarea') || null;
        }
        if (!field) {
            field = label.nextElementSibling?.matches?.('input, select, textarea') ? label.nextElementSibling : null;
        }
        applyValue(field, value);
    };
    setByPlaceholder('Employee ID', employeePublicId);
    setByLabelText('EMPLOYEE ID', employeePublicId);
    const visibleEmployeeIdField = Array.from(adminScope.querySelectorAll('input')).find(input => {
        const label = input.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase() || '';
        return label === 'employee id' || input.placeholder?.trim().toLowerCase() === 'employee id';
    });
    lockEmployeeIdField(visibleEmployeeIdField);
    setByPlaceholder('First name', cleanRosterEmployeeNameValue(valueFrom('first_name', 'firstName', 'first') || fallbackFirstName));
    setByLabelText('FIRST NAME', cleanRosterEmployeeNameValue(valueFrom('first_name', 'firstName', 'first') || fallbackFirstName));
    setByPlaceholder('Last name', cleanRosterEmployeeNameValue(valueFrom('last_name', 'lastName', 'last') || fallbackLastName));
    setByLabelText('LAST NAME', cleanRosterEmployeeNameValue(valueFrom('last_name', 'lastName', 'last') || fallbackLastName));
    setByPlaceholder('Department', valueFrom('department', 'dept', 'displayDepartment') || drawerSubParts[1] || '');
    setByLabelText('DEPARTMENT', valueFrom('department', 'dept', 'displayDepartment') || drawerSubParts[1] || '');
    setByPlaceholder('Position', valueFrom('position', 'title', 'displayPosition') || drawerSubParts[0] || '');
    setByLabelText('POSITION', valueFrom('position', 'title', 'displayPosition') || drawerSubParts[0] || '');
    setByPlaceholder('Supervisor', valueFrom('supervisor'));
    setByLabelText('SUPERVISOR', valueFrom('supervisor', 'displaySupervisor'));
    setByPlaceholder('Hourly, Salary, etc.', valueFrom('pay_type', 'payType'));
    setByLabelText('PAY TYPE', valueFrom('pay_type', 'payType'));
    setByPlaceholder('40', valueFrom('standard_hours', 'standardHours'));
    setByLabelText('STANDARD HOURS', valueFrom('standard_hours', 'standardHours'));
    setByPlaceholder('Benefits status', valueFrom('benefits_status', 'benefitsStatus'));
    setByLabelText('BENEFITS STATUS', valueFrom('benefits_status', 'benefitsStatus'));
    const hireDateValue = formatRosterDateForInput(valueFrom('hire_date', 'hireDate'));
    const nextReviewValue = formatRosterDateForInput(valueFrom('next_review_date', 'nextReviewDate'));
    const anniversaryValue = formatRosterDateForInput(valueFrom('anniversary_date', 'anniversaryDate'));
    const terminationValue = formatRosterDateForInput(valueFrom('termination_date', 'terminationDate'));
    setBySelector('#employeeHireDateInput', hireDateValue);
    setBySelector('#employeeNextReviewInput', nextReviewValue);
    setBySelector('#employeeAnniversaryDateInput', anniversaryValue);
    setBySelector('#employeeTerminationDateInput', terminationValue);
    const statusValue = formatRosterStatus(valueFrom('status', 'displayStatus') || 'Active');
    const statusSelect = Array.from(adminScope.querySelectorAll('select')).find(select => {
        return Array.from(select.options || []).some(option => option.textContent.trim().toLowerCase() === 'active' || option.textContent.trim().toLowerCase() === 'inactive');
    });
    if (statusSelect) {
        const matchingOption = Array.from(statusSelect.options || []).find(option => {
            return option.value.toLowerCase() === statusValue.toLowerCase() || option.textContent.trim().toLowerCase() === statusValue.toLowerCase();
        });
        statusSelect.value = matchingOption ? matchingOption.value : statusValue;
        statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function populateEmployeeAdminByVisibleOrder(employee) {
    if (!employee) return;
    const adminScope = getEmployeeAdminScope();
    const drawerTitleName = String(document.getElementById('drawerTitle')?.textContent || '').trim();
    const drawerSubParts = String(document.getElementById('drawerSub')?.textContent || '')
        .split('•')
        .map(part => part.trim());
    const nameText = employee.displayName || employee.name || drawerTitleName || '';
    const nameParts = String(nameText).trim().split(/\s+/).filter(Boolean);
    const firstName = cleanRosterEmployeeNameValue(employee.first_name || employee.firstName || employee.first || nameParts[0] || '');
    const lastName = cleanRosterEmployeeNameValue(employee.last_name || employee.lastName || employee.last || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''));
    const employeeIdValue = getEmployeePublicId(employee, drawerTitleName);
    const statusValue = formatRosterStatus(employee.status || employee.displayStatus || 'Active');
    const valuesByLabel = {
        'employee id': employeeIdValue,
        'status': statusValue,
        'first name': firstName,
        'last name': lastName,
        'department': employee.department || employee.dept || employee.displayDepartment || drawerSubParts[1] || '',
        'position': employee.position || employee.title || employee.displayPosition || drawerSubParts[0] || '',
        'supervisor': employee.supervisor || employee.displaySupervisor || '',
        'pay type': employee.pay_type || employee.payType || '',
        'standard hours': employee.standard_hours || employee.standardHours || '',
        'benefits status': employee.benefits_status || employee.benefitsStatus || '',
        'hire date': formatRosterDateForInput(employee.hire_date || employee.hireDate || employee.displayHireDate || ''),
        'next review date': formatRosterDateForInput(employee.next_review_date || employee.nextReviewDate || ''),
        'next stay interview date': formatRosterDateForInput(employee.next_review_date || employee.nextReviewDate || ''),
        'anniversary date': formatRosterDateForInput(employee.anniversary_date || employee.anniversaryDate || ''),
        'tenure bracket': employee.tenure_bracket || employee.tenureBracket || ''
    };
    const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };
    const setValue = (field, value) => {
        if (!field) return;
        const previousSuppress = window.__suppressAuditDirty;
        window.__suppressAuditDirty = true;
        const nextValue = value ?? '';
        if (field.tagName === 'SELECT') {
            const match = Array.from(field.options || []).find(option => {
                return String(option.value).toLowerCase() === String(nextValue).toLowerCase()
                    || String(option.textContent).trim().toLowerCase() === String(nextValue).toLowerCase();
            });
            field.value = match ? match.value : nextValue;
        } else {
            field.value = nextValue;
        }
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        window.__suppressAuditDirty = previousSuppress;
    };
    const fields = Array.from(adminScope.querySelectorAll('input, select, textarea')).filter(isVisible);
    const labels = Array.from(adminScope.querySelectorAll('label, .field-label')).filter(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return Object.keys(valuesByLabel).includes(text) && !['input', 'select', 'textarea', 'button'].includes(el.tagName.toLowerCase());
    });
    labels.forEach(label => {
        const labelText = (label.textContent || '').trim().toLowerCase();
        const value = valuesByLabel[labelText];
        const wrapper = label.parentElement;
        const field = wrapper?.querySelector('input, select, textarea') || label.nextElementSibling?.querySelector?.('input, select, textarea') || label.nextElementSibling;
        if (field && ['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName)) {
            setValue(field, value);
        }
    });
    const fieldByLabel = (labelText) => {
        const label = Array.from(adminScope.querySelectorAll('label, .field-label')).find(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text === labelText.toLowerCase();
        });
        if (!label) return null;
        const wrapper = label.parentElement;
        return wrapper?.querySelector('input, select, textarea') || null;
    };
    setValue(fieldByLabel('EMPLOYEE ID'), valuesByLabel['employee id']);
    setValue(fieldByLabel('STATUS'), valuesByLabel['status']);
    setValue(fieldByLabel('FIRST NAME'), valuesByLabel['first name']);
    setValue(fieldByLabel('LAST NAME'), valuesByLabel['last name']);
    setValue(fieldByLabel('DEPARTMENT'), valuesByLabel['department']);
    setValue(fieldByLabel('POSITION'), valuesByLabel['position']);
    setValue(fieldByLabel('SUPERVISOR'), valuesByLabel['supervisor']);
    setValue(fieldByLabel('PAY TYPE'), valuesByLabel['pay type']);
    setValue(fieldByLabel('STANDARD HOURS'), valuesByLabel['standard hours']);
    setValue(fieldByLabel('BENEFITS STATUS'), valuesByLabel['benefits status']);
    setValue(fieldByLabel('HIRE DATE'), valuesByLabel['hire date']);
    setValue(fieldByLabel('NEXT REVIEW DATE'), valuesByLabel['next review date']);
    setValue(fieldByLabel('NEXT STAY INTERVIEW DATE'), valuesByLabel['next stay interview date']);
    setValue(fieldByLabel('ANNIVERSARY DATE'), valuesByLabel['anniversary date']);
    setValue(fieldByLabel('TENURE BRACKET'), valuesByLabel['tenure bracket']);
}

function lockEmployeeIdField(field) {
    if (!field) return;
    field.readOnly = true;
    field.setAttribute('readonly', 'readonly');
    field.setAttribute('aria-readonly', 'true');
    field.classList.add('locked-field');
    field.title = 'Employee ID is locked and cannot be edited.';
}

// === AUDIT LOG HELPERS ===
async function writeEmployeeAuditLogToSupabase(auditEntry) {
    if (!auditEntry) return { error: new Error('Missing audit entry') };
    const payload = {
        employee_id: auditEntry.employee_id || '',
        employee_name: auditEntry.name || '',
        action_type: auditEntry.action_type || 'employee_update',
        fields_changed: auditEntry.fields_changed || [],
        changed_at: auditEntry.timestamp || new Date().toISOString(),
        changed_by: auditEntry.changed_by || 'Current user',
        metadata: auditEntry
    };
    try {
        if (supabaseClient?.from) {
            return await supabaseClient.from('employee_audit_logs').insert([payload]);
        }
        return { error: new Error('Supabase client not available') };
    } catch (error) {
        console.error('Audit log Supabase insert failed:', error);
        return { error };
    }
}

// === Employee Audit Log Viewer & Fetchers ===
function bindEmployeeUpdateToast() {
    if (window.__employeeUpdateToastBind) return;
    window.__employeeUpdateToastBind = true;
    console.log('[Orbis Audit] Employee update audit listener bound.');
    bindEmployeeAdminDirtyTracking();

    window.addEventListener('orbis:employee-record-saved', () => {
        window.__employeeUpdateToastPending = false;
    });

    document.addEventListener('click', (e) => {
        const clickedButton = e.target.closest('button');
        const saveButton = e.target.closest('#saveEmployeeBtn') || clickedButton;
        const buttonText = (saveButton?.textContent || '').trim().toLowerCase();
        const isUpdateButton = !!saveButton && (saveButton.id === 'saveEmployeeBtn' || buttonText.includes('update employee')); if (!isUpdateButton) return; const isExistingEmployee = !!window.currentEmployee && !window.isCreatingEmployee;
        if (!isExistingEmployee) return; console.log('[Orbis Audit] Update Employee click detected. Preparing audit log.'); window.__employeeUpdateToastPending = true;
        window.__employeeBeforeUpdate = getEmployeeAdminAuditBaseline(); setTimeout(async () => {
            if (!window.__employeeUpdateToastPending) return;
            window.__employeeUpdateToastPending = false; const before = window.__employeeBeforeUpdate || {};
            const after = getEmployeeAdminFormSnapshot(); const dirtyChanges = Array.from(window.__employeeDirtyFields || []);
            const snapshotChanges = getMeaningfulEmployeeAuditChanges(before, after);
            const changes = dirtyChanges.length ? dirtyChanges : snapshotChanges; const auditEntry = {
                id: `audit-${Date.now()}`,
                employee_id: after.employee_id || before.employee_id || before.employeeId || '',
                name: `${after.first_name || before.first_name || ''} ${after.last_name || before.last_name || ''}`.trim(),
                timestamp: new Date().toISOString(),
                action_type: 'employee_update',
                changed_by: window.currentUser?.email || window.currentUser?.name || 'Current user',
                fields_changed: changes,
                before,
                after
            }; console.log('[Orbis Audit] Audit entry created:', auditEntry); const { error } = await writeEmployeeAuditLogToSupabase(auditEntry); if (error) {
                writeEmployeeAuditLogLocal(auditEntry);
                console.warn('[Orbis Audit] Supabase insert failed. Saved locally instead:', error);
            } else {
                console.log('[Orbis Audit] Audit log saved to Supabase.');
                if (document.getElementById('employeeAuditLogViewer')) {
                    renderEmployeeAuditLogViewer(window.currentEmployee);
                }
            }
            setEmployeeAdminAuditBaseline(after);
            window.__employeeDirtyFields = new Set();
        }, 750);
    });
    window.addEventListener('error', () => {
        if (!window.__employeeUpdateToastPending) return;
        window.__employeeUpdateToastPending = false;
        if (typeof showToast === 'function') {
            showToast('Employee update failed. Please check the form and try again.', 'error');
        }
    });
    window.addEventListener('unhandledrejection', () => {
        if (!window.__employeeUpdateToastPending) return;
        window.__employeeUpdateToastPending = false;
        if (typeof showToast === 'function') {
            showToast('Employee update failed. Please check the form and try again.', 'error');
        }
    });
}

function getEmployeeSnapshotFromRosterRow(employeeId) {
    const row = document.querySelector(`tr.employee-row[data-id="${employeeId}"]`);
    if (!row) return {};
    const cells = Array.from(row.querySelectorAll('td'));
    const nameText = cleanRosterEmployeeNameValue(cells[1]?.querySelector('.link-button')?.textContent?.trim() || cells[1]?.textContent?.trim() || '');
    const nameParts = nameText.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''; return {
        employee_id: cells[0]?.textContent?.trim() || employeeId || '',
        employeeId: cells[0]?.textContent?.trim() || employeeId || '',
        displayId: cells[0]?.textContent?.trim() || employeeId || '',
        employee_number: cells[0]?.textContent?.trim() || employeeId || '',
        employeeNumber: cells[0]?.textContent?.trim() || employeeId || '',
        first_name: firstName,
        firstName,
        last_name: lastName,
        lastName,
        displayName: nameText,
        department: cells[2]?.textContent?.trim() || '',
        dept: cells[2]?.textContent?.trim() || '',
        displayDepartment: cells[2]?.textContent?.trim() || '',
        position: cells[3]?.textContent?.trim() || '',
        displayPosition: cells[3]?.textContent?.trim() || '',
        supervisor: cells[4]?.textContent?.trim() || '',
        displaySupervisor: cells[4]?.textContent?.trim() || '',
        displayHireDate: cells[5]?.textContent?.trim() || '',
        displayTerminationDate: cells[6]?.textContent?.trim() || '',
        status: cells[7]?.textContent?.trim() || '',
        displayStatus: cells[7]?.textContent?.trim() || ''
    };
}

function getFilteredRosterEmployees() {
    const searchTerm = safeGet('globalSearch')?.value?.toLowerCase().trim() || '';
    const departmentFilter = String(safeGet('deptFilter')?.value || '').trim();
    const explicitStatusFilter = String(safeGet('statusFilter')?.value || '').trim().toUpperCase();
    const rosterMode = String(window.rosterViewMode || 'active').trim().toLowerCase();
    const employees = getEmployeesList();
    return employees
        .map(normalizeEmployeeForRoster)
        .filter(Boolean)
        .filter(employee => {
            const searchableText = [
                employee.displayId,
                employee.displayName,
                employee.displayDepartment,
                employee.displayPosition,
                employee.displaySupervisor,
                employee.displayStatus
            ].join(' ').toLowerCase(); const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
            const matchesDepartment = !departmentFilter || employee.displayDepartment === departmentFilter;
            const matchesStatus = matchesRosterView(employee, rosterMode, explicitStatusFilter);
            return matchesSearch && matchesDepartment && matchesStatus;
        })
        .sort((a, b) => {
            let valA;
            let valB; switch (win.currentSort?.column) {
                case 'id':
                    valA = a.displayId || '';
                    valB = b.displayId || '';
                    break;
                case 'name':
                    valA = `${(a.last || a.last_name || '').toLowerCase()} ${(a.first || a.first_name || '').toLowerCase()}`;
                    valB = `${(b.last || b.last_name || '').toLowerCase()} ${(b.first || b.first_name || '').toLowerCase()}`;
                    break;
                case 'dept':
                    valA = a.displayDepartment || '';
                    valB = b.displayDepartment || '';
                    break;
                case 'position':
                    valA = a.displayPosition || '';
                    valB = b.displayPosition || '';
                    break;
                case 'supervisor':
                    valA = a.displaySupervisor || '';
                    valB = b.displaySupervisor || '';
                    break;
                case 'hireDate': {
                    const timeA = a.displayHireDate ? new Date(a.displayHireDate).getTime() : 0;
                    const timeB = b.displayHireDate ? new Date(b.displayHireDate).getTime() : 0;
                    return win.currentSort?.direction === 'desc' ? timeB - timeA : timeA - timeB;
                }
                case 'terminationDate': {
                    const timeA = a.displayTerminationDate ? new Date(a.displayTerminationDate).getTime() : 0;
                    const timeB = b.displayTerminationDate ? new Date(b.displayTerminationDate).getTime() : 0;
                    return win.currentSort?.direction === 'desc' ? timeB - timeA : timeA - timeB;
                }
                case 'status':
                    valA = a.displayStatus || '';
                    valB = b.displayStatus || '';
                    break;
                default:
                    valA = a.displayName || '';
                    valB = b.displayName || '';
            }            const result = compareText(valA, valB);
            return win.currentSort?.direction === 'desc' ? -result : result;
        });
}

function renderEmployeeRoster() {
    const tbody =
        safeGet('employeeRosterBody')
        || safeGet('empBody')
        || safeGet('employeeTableBody')
        || safeGet('rosterBody');
    if (!tbody) return;
    const employees = getFilteredRosterEmployees();
    win.currentFilteredEmployees = employees;

    const rosterMode = String(window.rosterViewMode || 'active').trim().toLowerCase();
    const rosterTable = tbody.closest('table');

    if (rosterTable) {
        rosterTable.classList.remove('roster-view-active', 'roster-view-former');
        rosterTable.classList.add(
            rosterMode === 'former' ? 'roster-view-former' : 'roster-view-active'
        );
        rosterTable.classList.add('employee-roster-table');
    }

    if (safeGet('empCount')) {
        const total = getEmployeesList().length || employees.length;
        safeGet('empCount').textContent = `Showing ${employees.length} of ${total} employee${total === 1 ? '' : 's'}`;
    }
    if (!employees.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty">
                    <div style="padding:20px; text-align:center;">
                        <strong>No employees found</strong><br>
                        <span style="color:#6b7280; font-size:13px;">
                            Try adjusting your filters or search.
                        </span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    tbody.innerHTML = employees.map(employee => {
        const drawerId = esc(employee.dbId || employee.id || employee.employee_id || '');
        const hireDateCell = employee.displayHireDate ? fmtDate(employee.displayHireDate) : '—';
        const terminationDateCell =
            isCompletedTermination(employee) && employee.displayTerminationDate
                ? fmtDate(employee.displayTerminationDate)
                : '—';
        return `
            <tr class="employee-row" data-id="${drawerId}" title="Open ${esc(employee.displayName)}" style="cursor:pointer;" onclick="openDrawerByEmployeeId('${drawerId}')">
                <td>${esc(employee.displayId)}</td>
                <td class="roster-name-cell">
                    <div class="roster-name-cell-inner">
                        <div class="roster-name-main">
                            <button type="button" class="link-button" onclick="event.stopPropagation(); openDrawerByEmployeeId('${drawerId}')">
                                ${esc(employee.displayName)}
                            </button>
                        </div>
                        <div class="row-actions table-actions">
                            <button type="button" class="button soft sm" onclick="event.stopPropagation(); openDrawerByEmployeeId('${drawerId}')">Edit</button>
                            <button type="button" class="button danger sm" onclick="event.stopPropagation(); deleteEmployeeQuick('${drawerId}')">Delete</button>
                        </div>
                    </div>
                </td>
                <td>${esc(employee.displayDepartment)}</td>
                <td>${esc(employee.displayPosition)}</td>
                <td>${esc(employee.displaySupervisor)}</td>
                <td>${hireDateCell}</td>
                <td class="roster-col-terminated">${terminationDateCell}</td>
                <td><span class="${statusBadge(employee.displayStatus)}">${esc(employee.displayStatusLabel)}</span></td>
            </tr>
        `;
    }).join('');
    if (typeof updateEmployeeRowBadges === 'function') {
        updateEmployeeRowBadges();
    }
    // Re-bind At-Risk KPI hover after roster updates
    if (typeof bindAtRiskKpiHover === 'function') {
        bindAtRiskKpiHover();
    }
}

async function openDrawerByEmployeeId(employeeId) {
    const employee = getEmployeesList().find(item =>
        String(item.dbId || item.id || item.employee_id) === String(employeeId)
    ); if (!employee) {
        showToast('Employee could not be found.', 'error');
        return;
    }
    let rosterSnapshot = getEmployeeSnapshotFromRosterRow(employeeId);
    if (!rosterSnapshot.employee_id) {
        rosterSnapshot = {
            ...rosterSnapshot,
            employee_id: employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || '',
            employeeId: employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || '',
            displayId: employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || ''
        };
    }
    const drawerEmployee = normalizeEmployeeForRoster({
        ...employee,
        ...rosterSnapshot
    });
    const finalEmployeeId = getEmployeePublicId(drawerEmployee, drawerEmployee.displayName);
    drawerEmployee.employee_id = finalEmployeeId;
    drawerEmployee.employeeId = finalEmployeeId;
    drawerEmployee.displayId = finalEmployeeId;
    const recordId = String(drawerEmployee.dbId || drawerEmployee.id || finalEmployeeId).trim();

    if (typeof window.syncOpenedEmployeeRecordId === 'function') {
        window.syncOpenedEmployeeRecordId(recordId);
    }

    win.isCreatingEmployee = false;
    window.currentEmployee = drawerEmployee;

    if (typeof window.openEmployeeDrawer === 'function') {
        await window.openEmployeeDrawer(recordId);
    } else if (typeof openDrawer === 'function') {
        openDrawer(drawerEmployee);
    } else {
        showToast('Employee drawer is not available.', 'error');
        return;
    }

    if (typeof populateEmployeeAdminForm === 'function') {
        populateEmployeeAdminForm(drawerEmployee);
    }
    populateEmployeeAdminFallback(drawerEmployee);
    populateEmployeeAdminByVisibleOrder(drawerEmployee);
    cleanEmployeeAdminVisibleNameFields();
    [50, 150, 300, 600, 1000, 1500].forEach(delay => {
        setTimeout(() => {
            populateEmployeeAdminFallback(drawerEmployee);
            populateEmployeeAdminByVisibleOrder(drawerEmployee);
            if (typeof window.resetDrawerEntryForms === 'function') {
                window.resetDrawerEntryForms();
            }
            cleanEmployeeAdminVisibleNameFields();
            const visibleEmployeeIdField = Array.from(document.querySelectorAll('input')).find(input => {
                const label = input.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase() || '';
                return label === 'employee id' || input.placeholder?.trim().toLowerCase() === 'employee id';
            });
            if (visibleEmployeeIdField && finalEmployeeId) {
                visibleEmployeeIdField.value = finalEmployeeId;
                visibleEmployeeIdField.dispatchEvent(new Event('input', { bubbles: true }));
                visibleEmployeeIdField.dispatchEvent(new Event('change', { bubbles: true }));
                lockEmployeeIdField(visibleEmployeeIdField);
            }
            if (delay === 1500 && typeof setEmployeeAdminAuditBaseline === 'function') {
                setEmployeeAdminAuditBaseline(getEmployeeAdminFormSnapshot());
            }
        }, delay);
    });
    if (safeGet('saveEmployeeBtn')) {
        safeGet('saveEmployeeBtn').textContent = 'Update Employee';
    }
}

async function deleteEmployeeQuick(employeeId) {
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    }
    const confirmed = await showOrbisConfirm(
        'Are you sure you want to delete this employee? This cannot be undone.',
        {
            title: 'Delete employee',
            confirmLabel: 'Delete',
            danger: true,
        }
    );
    if (!confirmed) return;
    const { error } = await OrbisServices.employees.delete(employeeId);
    if (error) {
        console.error(error);
        showToast(`Could not delete employee: ${error.message || 'Unknown error'}`, 'error');
        return;
    }
    showToast('Employee deleted.');
    if (typeof loadEmployees === 'function') {
        await loadEmployees();
    } else {
        renderEmployeeRoster();
    }
}

function ensureRosterViewTabs() {
    const statusFilter = safeGet('statusFilter');
    const rosterControls = statusFilter?.closest('.filters, .toolbar, .controls, .card, div') || statusFilter?.parentElement;
    if (!rosterControls || safeGet('rosterViewTabs')) return;
    const tabs = document.createElement('div');
    tabs.id = 'rosterViewTabs';
    tabs.style.display = 'flex';
    tabs.style.gap = '8px';
    tabs.style.alignItems = 'center';
    tabs.style.margin = '8px 0';
    const makeTab = (mode, label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button soft sm';
        button.dataset.rosterMode = mode;
        button.textContent = label;
        button.onclick = () => {
            window.rosterViewMode = mode;
            if (statusFilter) {
                statusFilter.value = '';
            }
            Array.from(tabs.querySelectorAll('button')).forEach(btn => {
                const active = btn.dataset.rosterMode === mode;
                btn.classList.toggle('active', active);
                btn.style.fontWeight = active ? '800' : '600';
                btn.style.borderColor = active ? '#111827' : '';
            });
            renderEmployeeRoster();
        };
        return button;
    };
    const activeTab = makeTab('active', 'Active Employees');
    const formerTab = makeTab('former', 'Former Employees');
    tabs.appendChild(activeTab);
    tabs.appendChild(formerTab);
    rosterControls.appendChild(tabs);
    const defaultTab = window.rosterViewMode === 'former' ? formerTab : activeTab;
    defaultTab.click();
}

function bindRosterEvents() {
    bindEmployeeUpdateToast();
    ensureRosterViewTabs();
    const searchInput = safeGet('globalSearch') || document.querySelector('#employeeSearch, #searchInput, input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
    const departmentFilter = safeGet('deptFilter');
    const statusFilter = safeGet('statusFilter');
    const clearFiltersBtn = safeGet('clearFiltersBtn');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.readOnly = false;
        searchInput.removeAttribute('disabled');
        searchInput.removeAttribute('readonly');
        searchInput.style.pointerEvents = 'auto';
        searchInput.style.userSelect = 'text';
        searchInput.tabIndex = 0;
        searchInput.style.zIndex = '9999';
        searchInput.style.position = 'relative';
        searchInput.addEventListener('click', (event) => {
            event.stopPropagation();
            unlockRosterSearchInput();
            searchInput.focus();
        });

        searchInput.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            unlockRosterSearchInput();
            searchInput.focus();
        });

        searchInput.oninput = () => {
            unlockRosterSearchInput();
            clearTimeout(rosterSearchTimer);
            rosterSearchTimer = setTimeout(() => {
                renderEmployeeRoster();
                requestAnimationFrame(() => {
                    unlockRosterSearchInput();
                    const refreshedSearchInput = safeGet('globalSearch') || document.querySelector('#employeeSearch, #searchInput, input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
                    if (refreshedSearchInput) {
                        refreshedSearchInput.focus();
                    }
                });
            }, 150);
        };
    }
    if (departmentFilter) {
        departmentFilter.onchange = renderEmployeeRoster;
    }
    if (statusFilter) {
        statusFilter.onchange = () => {
            window.rosterViewMode = 'all';
            renderEmployeeRoster();
        };
    }
    if (clearFiltersBtn) {
        clearFiltersBtn.onclick = () => {
            clearRosterFilters();
        };
    }
}

function clearRosterFilters(): void {
    const searchInput =
        safeGet('globalSearch') ||
        document.querySelector<HTMLInputElement>(
            '#employeeSearch, #searchInput, input[type="search"]'
        );
    const departmentFilter = safeGet('deptFilter') as HTMLSelectElement | null;
    const statusFilter = safeGet('statusFilter') as HTMLSelectElement | null;

    if (searchInput) searchInput.value = '';
    if (departmentFilter) departmentFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    window.rosterViewMode = 'active';
    win.currentSort = { column: 'name', direction: 'asc' };
    renderEmployeeRoster();
    ensureRosterViewTabs();
}

window.clearFilters = clearRosterFilters;

// Ensure Employee Admin tab repopulates after UI switches/reset
if (!window.__employeeAdminBind) {
    window.__employeeAdminBind = true;
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('button, .tab, [data-tab]');
        if (!tab) return; const text = (tab.textContent || '').toLowerCase();
        const isEmployeeAdmin = text.includes('employee admin') || tab.getAttribute('data-tab') === 'employee-admin';
        const isHistoryTab = text.includes('history') || tab.getAttribute('data-tab') === 'history'; if (isEmployeeAdmin && window.currentEmployee && !window.isCreatingEmployee && typeof populateEmployeeAdminForm === 'function') {
            setTimeout(() => {
                populateEmployeeAdminForm(window.currentEmployee);
                if (typeof populateEmployeeAdminFallback === 'function') {
                    populateEmployeeAdminFallback(window.currentEmployee);
                }
                if (typeof populateEmployeeAdminByVisibleOrder === 'function') {
                    populateEmployeeAdminByVisibleOrder(window.currentEmployee);
                }
                cleanEmployeeAdminVisibleNameFields();
                const currentEmployeeId = window.currentEmployee?.employee_id || window.currentEmployee?.employeeId || window.currentEmployee?.displayId || '';
                const visibleEmployeeIdField = Array.from(document.querySelectorAll('input')).find(input => {
                    const label = input.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase() || '';
                    return label === 'employee id' || input.placeholder?.trim().toLowerCase() === 'employee id';
                });
                if (visibleEmployeeIdField && currentEmployeeId) {
                    visibleEmployeeIdField.value = currentEmployeeId;
                    visibleEmployeeIdField.dispatchEvent(new Event('input', { bubbles: true }));
                    visibleEmployeeIdField.dispatchEvent(new Event('change', { bubbles: true }));
                    lockEmployeeIdField(visibleEmployeeIdField);
                }
                if (typeof setEmployeeAdminAuditBaseline === 'function') {
                    setEmployeeAdminAuditBaseline(getEmployeeAdminFormSnapshot());
                }
            }, 50);
        } if (isHistoryTab && window.currentEmployee) {
            setTimeout(() => {
                renderEmployeeAuditLogViewer(window.currentEmployee);
            }, 100);
        }
    });
}

// 🔥 Unified roster refresh (used by ALL creation flows)
window.refreshEmployeeRoster = async function () {
    try {
        if (typeof window.loadEmployees === 'function') {
            await window.loadEmployees();
        } else if (window.OrbisServices?.employees?.getAll) {
            const result = await window.OrbisServices.employees.getAll();
            window.EMPLOYEES = result?.data || [];
            if (typeof window.renderEmployeeRoster === 'function') {
                window.renderEmployeeRoster();
            }
        } else if (typeof window.renderEmployeeRoster === 'function') {
            window.renderEmployeeRoster();
        }
    } catch (err) {
        console.error('Roster refresh failed:', err);
    }
};

function getEmployeeAdminFormSnapshot() {
    return {};
}

function getEmployeeAdminFieldByLabel() {
    return null;
}

function setEmployeeAdminAuditBaseline(snapshot = {}) {
    window.__employeeAdminAuditBaseline = snapshot;
}

function getEmployeeAdminAuditBaseline() {
    return window.__employeeAdminAuditBaseline || {};
}

function getEmployeeAdminFieldKey(label = '') {
    return String(label || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

function bindEmployeeAdminDirtyTracking() {
    window.__employeeDirtyFields = window.__employeeDirtyFields || new Set();
}

function cleanEmployeeAdminVisibleNameFields() {
    return;
}

function getMeaningfulEmployeeAuditChanges(_before: Record<string, unknown> = {}, _after: Record<string, unknown> = {}) {
    return [];
}

function writeEmployeeAuditLogLocal(auditEntry) {
    const existing = JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
    existing.unshift(auditEntry);
    localStorage.setItem('orbis_audit_log', JSON.stringify(existing));
}

async function fetchEmployeeAuditLogs() {
    return [];
}

function getLocalAuditLogsForEmployee() {
    return JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
}

function renderEmployeeAuditLogViewer() {
    return;
}
function unlockRosterSearchInput() {
    const searchInput = safeGet('globalSearch') || document.querySelector('#employeeSearch, #searchInput, input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');

    if (!searchInput) return;

    searchInput.disabled = false;
    searchInput.readOnly = false;
    searchInput.removeAttribute('disabled');
    searchInput.removeAttribute('readonly');
    searchInput.style.pointerEvents = 'auto';
    searchInput.style.userSelect = 'text';
    searchInput.style.zIndex = '200000';
    searchInput.style.position = 'relative';
    searchInput.tabIndex = 0;
}

// =========================
// EXPORTS
// =========================
window.cleanRosterEmployeeNameValue = cleanRosterEmployeeNameValue;
window.formatRosterStatus = formatRosterStatus;
window.statusBadge = statusBadge;
window.normalizeEmployeeForRoster = normalizeEmployeeForRoster;
window.getEmployeePublicId = getEmployeePublicId;
window.populateEmployeeAdminFallback = populateEmployeeAdminFallback;
window.populateEmployeeAdminByVisibleOrder = populateEmployeeAdminByVisibleOrder;
window.getEmployeeSnapshotFromRosterRow = getEmployeeSnapshotFromRosterRow;
window.getFilteredRosterEmployees = getFilteredRosterEmployees;
window.renderEmployeeRoster = renderEmployeeRoster;
window.openDrawerByEmployeeId = openDrawerByEmployeeId;
window.deleteEmployeeQuick = deleteEmployeeQuick;
window.bindRosterEvents = bindRosterEvents;
window.unlockRosterSearchInput = unlockRosterSearchInput;
window.ensureRosterViewTabs = ensureRosterViewTabs;
window.lockEmployeeIdField = lockEmployeeIdField;
window.bindEmployeeUpdateToast = bindEmployeeUpdateToast;
window.getEmployeeAdminFormSnapshot = getEmployeeAdminFormSnapshot;
window.getEmployeeAdminFieldByLabel = getEmployeeAdminFieldByLabel;
window.setEmployeeAdminAuditBaseline = setEmployeeAdminAuditBaseline;
window.getEmployeeAdminAuditBaseline = getEmployeeAdminAuditBaseline;
window.getEmployeeAdminFieldKey = getEmployeeAdminFieldKey;
window.bindEmployeeAdminDirtyTracking = bindEmployeeAdminDirtyTracking;
window.cleanEmployeeAdminVisibleNameFields = cleanEmployeeAdminVisibleNameFields;
window.getMeaningfulEmployeeAuditChanges = getMeaningfulEmployeeAuditChanges;
window.getAuditLog = () => JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
window.writeEmployeeAuditLogToSupabase = writeEmployeeAuditLogToSupabase;
window.writeEmployeeAuditLogLocal = writeEmployeeAuditLogLocal;
window.fetchEmployeeAuditLogs = fetchEmployeeAuditLogs;
window.getLocalAuditLogsForEmployee = getLocalAuditLogsForEmployee;
window.renderEmployeeAuditLogViewer = renderEmployeeAuditLogViewer;

setTimeout(() => {
    const searchInput = safeGet('globalSearch');
    if (searchInput) {
        searchInput.disabled = false;
        searchInput.readOnly = false;
        searchInput.removeAttribute('disabled');
        searchInput.removeAttribute('readonly');
        searchInput.style.pointerEvents = 'auto';
        searchInput.style.userSelect = 'text';
    }
}, 250);

setInterval(() => {
    unlockRosterSearchInput();
}, 750);

function getAtRiskKpiHoverNames() {
    const riskMap = window.currentAtRiskRosterMap || (typeof currentAtRiskRosterMap !== 'undefined' ? currentAtRiskRosterMap : {}) || {};
    const employees = getEmployeesList();
    const names = []; const addNameValue = (value) => {
        if (!value) return; if (typeof value === 'string') {
            const text = value.trim();
            if (text && text.toLowerCase() !== 'true' && text.toLowerCase() !== 'yes' && !names.includes(text)) {
                names.push(text);
            }
            return;
        } if (typeof value === 'object') {
            const first = value.first || value.first_name || value.firstName || '';
            const last = value.last || value.last_name || value.lastName || '';
            const name = `${first} ${last}`.trim() || value.displayName || value.name || value.employee_name || '';
            if (name && !names.includes(name)) names.push(name);
        }
    }; Object.values(riskMap || {}).forEach(addNameValue);    // Fallback: derive from employee data if riskMap is empty
    if (!names.length && employees.length) {
        employees.forEach(emp => {
            const isAtRisk =
                emp.at_risk === true ||
                emp.atRisk === true ||
                String(emp.status || '').toUpperCase() === 'AT-RISK'; if (isAtRisk) {
                    const name =
                        emp.displayName ||
                        `${emp.first_name || emp.firstName || ''} ${emp.last_name || emp.lastName || ''}`.trim(); if (name && !names.includes(name)) names.push(name);
                }
        });
    }    // DOM fallback: if the roster row already shows an At-Risk badge, use that row's employee name.
    document.querySelectorAll('tr.employee-row').forEach(row => {
        const hasAtRiskBadge = Array.from(row.querySelectorAll('.badge, span')).some(el =>
            String(el.textContent || '').trim().toLowerCase() === 'at-risk'
        ); if (!hasAtRiskBadge) return; const rowName = row.querySelector('.link-button')?.textContent?.replace(/At-Risk|Impact/g, '').trim();
        if (rowName && !names.includes(rowName)) names.push(rowName);
    }); if (!names.length) {
        const riskCount = Number(document.getElementById('kRisk')?.textContent?.trim() || '0');
        if (riskCount > 0) {
            return [`${riskCount} employee flagged`];
        }
    } return names;
}

function bindAtRiskKpiHover() {
    const riskCard =
        document.getElementById('cardAtRiskEmployees') ||
        document.getElementById('kAtRiskEmployees')?.closest('.kpi-card');

    if (!riskCard) return;

    const riskElement = document.getElementById('kAtRiskEmployees');
    const getRiskCount = () => {
        if (!riskElement) return 0;

        const directCount = Number(String(riskElement.textContent || '').trim());

        if (!Number.isNaN(directCount)) return directCount;

        const cardText = String(riskCard.textContent || '');
        const match =
            cardText.match(/AT-RISK EMPLOYEES\s*(\d+)/i) || cardText.match(/\b(\d+)\b/);

        return match ? Number(match[1]) : 0;
    };

    const names = getAtRiskKpiHoverNames();
    const riskCount = getRiskCount();
    let text;

    if (names.length) {
        text = names.join('\n');
    } else if (riskCount > 0) {
        text = `${riskCount} employee${riskCount === 1 ? '' : 's'} flagged`;
    } else {
        text = 'No employees currently flagged at-risk.';
    }

    if (typeof window.syncKpiCardTooltip === 'function') {
        window.syncKpiCardTooltip(riskCard, text);
    } else {
        riskCard.removeAttribute('title');
        riskCard.setAttribute('data-tooltip', text);
        riskCard.setAttribute('aria-label', text);
    }

    document.getElementById('atRiskKpiTooltip')?.remove();
}

function renderRoster(): void {
    renderEmployeeRoster();
}

window.renderRoster = renderRoster;
window.bindAtRiskKpiHover = bindAtRiskKpiHover;
setTimeout(bindAtRiskKpiHover, 300);
setTimeout(bindAtRiskKpiHover, 1000);
bindEmployeeUpdateToast();
bindRosterEvents();

export { renderEmployeeRoster, renderRoster, openDrawerByEmployeeId, bindRosterEvents };