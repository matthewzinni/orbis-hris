// Simple employee form helpers + bridge to saveEmployeeRecord

import { cleanEmployeeNameValue } from '../services/employeeUtils';

export type EmployeeFormRow = Record<string, unknown>;

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

export function cleanEmployeeFormNameValue(value: unknown): string {
  return cleanEmployeeNameValue(value);
}

export function getEmployeeFormData(): Record<string, unknown> {
  const first = safeGet('firstName') as HTMLInputElement | null;
  const last = safeGet('lastName') as HTMLInputElement | null;

  return {
    first_name: cleanEmployeeFormNameValue(first?.value?.trim() || ''),
    last_name: cleanEmployeeFormNameValue(last?.value?.trim() || ''),
    email: String((safeGet('email') as HTMLInputElement | null)?.value || '')
      .trim()
      .toLowerCase(),
    phone: String((safeGet('phone') as HTMLInputElement | null)?.value || '').trim(),
    department: String((safeGet('department') as HTMLInputElement | null)?.value || ''),
    position: String((safeGet('position') as HTMLInputElement | null)?.value || ''),
    status: String((safeGet('status') as HTMLInputElement | null)?.value || 'Active'),
    hire_date: String((safeGet('hireDate') as HTMLInputElement | null)?.value || '') || null,
  };
}

export function populateEmployeeForm(employee: EmployeeFormRow | null | undefined): void {
  if (!employee) return;

  const setValue = (id: string, value: unknown) => {
    const field = safeGet(id) as HTMLInputElement | null;
    if (!field) return;
    field.value = String(value ?? '');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setValue(
    'firstName',
    cleanEmployeeFormNameValue(employee.first_name || employee.first || '')
  );
  setValue(
    'lastName',
    cleanEmployeeFormNameValue(employee.last_name || employee.last || '')
  );
  setValue('email', employee.email || employee.work_email || '');
  setValue('phone', employee.phone || '');
  setValue('department', employee.department || employee.dept || '');
  setValue('position', employee.position || '');
  setValue('status', employee.status || 'Active');
  setValue('hireDate', employee.hire_date || employee.hireDate || '');
}

export function resetEmployeeForm(): void {
  const ids = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'department',
    'position',
    'status',
    'hireDate',
  ];

  ids.forEach((id) => {
    const field = safeGet(id) as HTMLInputElement | null;
    if (!field) return;
    field.value = id === 'status' ? 'Active' : '';
  });
}

export async function saveEmployeeForm(): Promise<void> {
  if (typeof window.saveEmployeeRecord === 'function') {
    await window.saveEmployeeRecord();
    return;
  }

  const payload = getEmployeeFormData();
  if (!payload.first_name || !payload.last_name) {
    showToast('First and last name are required.', 'error');
    return;
  }

  showToast('Employee save is not available.', 'error');
}

declare global {
  interface Window {
    cleanEmployeeFormNameValue?: (value: unknown) => string;
    getEmployeeFormData?: () => Record<string, unknown>;
    populateEmployeeForm?: (employee: EmployeeFormRow) => void;
    resetEmployeeForm?: () => void;
    saveEmployeeForm?: () => Promise<void>;
    saveEmployeeRecord?: () => Promise<void>;
  }
}

window.cleanEmployeeFormNameValue = cleanEmployeeFormNameValue;
window.getEmployeeFormData = getEmployeeFormData;
window.populateEmployeeForm = populateEmployeeForm;
window.resetEmployeeForm = resetEmployeeForm;
window.saveEmployeeForm = saveEmployeeForm;
