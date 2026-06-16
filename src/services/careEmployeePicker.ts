import type { CareEngagementDataset } from '../types/careEngagementTypes';
import {
  compareEmployeesByLastName,
  employeeDisplayName,
  type EmployeeLike,
} from './employeeUtils';

function escapeHtml(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getCareEmployeeRoster(): EmployeeLike[] {
  return Array.isArray(window.EMPLOYEES) ? (window.EMPLOYEES as EmployeeLike[]) : [];
}

/** Primary key stored on care_* tables — matches employee drawer / Supabase employee id. */
export function resolveCareEmployeeId(employee: EmployeeLike | null | undefined): string {
  if (!employee) return '';
  return String(
    employee.dbId || employee.id || employee.employee_id || employee.displayId || ''
  ).trim();
}

export function findCareEmployeeById(employeeId: string): EmployeeLike | null {
  const needle = String(employeeId || '').trim();
  if (!needle) return null;

  return (
    getCareEmployeeRoster().find((employee) => {
      const keys = [
        employee.dbId,
        employee.id,
        employee.employee_id,
        employee.displayId,
      ]
        .filter(Boolean)
        .map(String);

      return keys.some((key) => key === needle);
    }) || null
  );
}

export function getCareEmployeeLabel(employeeId: string): string {
  const employee = findCareEmployeeById(employeeId);
  if (!employee) {
    return employeeId;
  }

  const id = resolveCareEmployeeId(employee);
  const name = employeeDisplayName(employee);
  return id ? `${name} (${id})` : name;
}

export function getCareEmployeeDepartment(employee: EmployeeLike | null | undefined): string {
  if (!employee) return '';
  return String(employee.department || employee.dept || '').trim();
}

export function populateCareEmployeeSelect(
  selectId: string,
  selectedValue?: string
): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;

  const current = String(selectedValue || '').trim();
  const sorted = [...getCareEmployeeRoster()].sort(compareEmployeesByLastName);

  const options = sorted
    .map((employee) => {
      const id = resolveCareEmployeeId(employee);
      if (!id) return '';
      const label = getCareEmployeeLabel(id);
      const selected = id === current ? ' selected' : '';
      return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .filter(Boolean)
    .join('');

  select.innerHTML = `<option value="">Select employee</option>${options}`;
}

export function resolveStoredCareEmployeeId(storedId: string, storedName: string): string {
  if (storedId && findCareEmployeeById(storedId)) {
    return storedId;
  }

  const normalizedName = String(storedName || '').trim().toLowerCase();
  if (!normalizedName) {
    return storedId;
  }

  const byName = getCareEmployeeRoster().find(
    (employee) => employeeDisplayName(employee).toLowerCase() === normalizedName
  );

  return byName ? resolveCareEmployeeId(byName) : storedId;
}

export function readCareEmployeeSelect(selectId: string): {
  employeeId: string;
  employeeName: string;
  department: string;
} {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  const employeeId = String(select?.value || '').trim();
  const employee = findCareEmployeeById(employeeId);

  return {
    employeeId,
    employeeName: employee ? employeeDisplayName(employee) : '',
    department: getCareEmployeeDepartment(employee),
  };
}

export async function ensureCareEmployeeRosterLoaded(): Promise<void> {
  const roster = getCareEmployeeRoster();
  if (roster.length) return;

  if (typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
  }
}

function resolveCareEmployeeFields(
  employeeId: string,
  employeeName: string,
  department: string
): { employeeId: string; employeeName: string; department: string } {
  const resolvedId = resolveStoredCareEmployeeId(employeeId, employeeName);
  const employee = findCareEmployeeById(resolvedId);

  if (!employee) {
    return {
      employeeId: resolvedId || employeeId,
      employeeName: employeeName || resolvedId,
      department,
    };
  }

  return {
    employeeId: resolveCareEmployeeId(employee),
    employeeName: employeeDisplayName(employee),
    department: getCareEmployeeDepartment(employee) || department,
  };
}

/** Normalize stored IDs/names against the live roster after Supabase load. */
export function enrichCareEngagementDataset(dataset: CareEngagementDataset): CareEngagementDataset {
  return {
    ...dataset,
    careItems: dataset.careItems.map((item) => ({
      ...item,
      ...resolveCareEmployeeFields(item.employeeId, item.employeeName, item.department),
    })),
    recognition: dataset.recognition.map((entry) => ({
      ...entry,
      ...resolveCareEmployeeFields(entry.employeeId, entry.employeeName, entry.department),
    })),
    employeeNotes: dataset.employeeNotes.map((note) => ({
      ...note,
      employeeId: resolveCareEmployeeFields(note.employeeId, '', '').employeeId,
    })),
    followUps: dataset.followUps.map((item) => ({
      ...item,
      ...resolveCareEmployeeFields(item.employeeId, '', ''),
    })),
    resources: dataset.resources.map((item) => ({
      ...item,
      ...resolveCareEmployeeFields(item.employeeId, '', ''),
    })),
    wellnessCheckIns: dataset.wellnessCheckIns.map((item) => ({
      ...item,
      ...resolveCareEmployeeFields(item.employeeId, '', ''),
    })),
  };
}

/** Clickable employee name for care lists (opens employee drawer). */
export function renderCareEmployeeNameLink(employeeId: string, employeeName: string): string {
  const drawerId = resolveStoredCareEmployeeId(employeeId, employeeName);
  const employee = drawerId ? findCareEmployeeById(drawerId) : null;
  const displayName = employee ? employeeDisplayName(employee) : employeeName || drawerId;

  if (!drawerId) {
    return escapeHtml(displayName);
  }

  return `<button type="button" class="link-button" data-open-care-employee="${escapeHtml(drawerId)}">${escapeHtml(displayName)}</button>`;
}

export function bindCareEmployeeSelectAutoFill(
  selectId: string,
  departmentInputId: string
): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  const departmentInput = document.getElementById(departmentInputId) as HTMLInputElement | null;

  if (!select || !departmentInput) return;

  select.addEventListener('change', () => {
    const { department } = readCareEmployeeSelect(selectId);
    departmentInput.value = department;
  });
}

