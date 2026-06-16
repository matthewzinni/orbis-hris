import { supabaseClient } from './supabaseClient';
import { showOrbisConfirm, type ConfirmOptions } from '../ui/confirmModal';
import { safeGet, showToast } from '../utils/helpers';

export type EmployeeLike = Record<string, unknown> & {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  first_name?: string;
  last_name?: string;
  first?: string;
  last?: string;
};

export type EmployeeRecordRow = Record<string, unknown> & {
  id?: string;
  employee_id?: string;
  created_at?: string;
};

type OrderSpec = { column: string; ascending?: boolean };

type SaveResult<T> = {
  data: T[] | T | null;
  error: { message?: string; code?: string } | null;
};

export function getDrawerEmployee(): EmployeeLike | null {
  if (typeof window.getCurrentEmployeeForOrbis === 'function') {
    return window.getCurrentEmployeeForOrbis() as EmployeeLike;
  }

  return (window.currentEmployee as EmployeeLike | null) || null;
}

export function getEmployeeId(employee: EmployeeLike | null | undefined): string {
  return String(
    employee?.dbId || employee?.employee_id || employee?.id || employee?.displayId || ''
  );
}

export function getEmployeeLookupIds(
  employee: EmployeeLike | null | undefined,
  fallbackId?: string
): string[] {
  return [employee?.dbId, employee?.employee_id, employee?.id, employee?.displayId, fallbackId]
    .filter(Boolean)
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
}

export function setDrawerInputValue(id: string, value: unknown): void {
  const input = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  if (!input) return;
  input.value = String(value ?? '');
}

export function sortRecordsByDate<T extends EmployeeRecordRow>(
  rows: T[],
  dateFields: string[]
): T[] {
  return [...rows].sort((a, b) => {
    const dateA = dateFields.map((field) => String(a[field] || '')).find(Boolean) || '';
    const dateB = dateFields.map((field) => String(b[field] || '')).find(Boolean) || '';
    return dateB.localeCompare(dateA);
  });
}

export async function fetchEmployeeRecords<T extends EmployeeRecordRow>(
  table: string,
  employeeIds: string[],
  order?: OrderSpec[]
): Promise<{ data: T[]; error: { message?: string } | null }> {
  let query = supabaseClient.from(table).select('*').in('employee_id', employeeIds);

  for (const spec of order || []) {
    query = query.order(spec.column, { ascending: spec.ascending ?? false });
  }

  const { data, error } = await query;
  return { data: (data || []) as T[], error };
}

export async function deleteEmployeeRecordRow(
  table: string,
  recordId: string,
  confirm: ConfirmOptions & { message: string },
  logPrefix = 'Record'
): Promise<boolean> {
  if (!recordId) return false;

  const confirmed = await showOrbisConfirm(confirm.message, {
    title: confirm.title,
    confirmLabel: confirm.confirmLabel || 'Delete',
    danger: confirm.danger ?? true,
  });

  if (!confirmed) return false;

  const { error } = await supabaseClient.from(table).delete().eq('id', recordId);

  if (error) {
    console.error(`[${logPrefix}] Delete failed:`, error);
    showToast(error.message || `Could not delete ${logPrefix.toLowerCase()}.`, 'error');
    return false;
  }

  return true;
}

export async function saveEmployeeRecordRow<T extends EmployeeRecordRow>(
  table: string,
  payload: T,
  recordId?: string | null,
  options?: {
    logPrefix?: string;
    stripMissingColumns?: boolean;
    updateMatch?: Record<string, string>;
  }
): Promise<SaveResult<T>> {
  const logPrefix = options?.logPrefix || 'Record';

  const savePayload = async (payloadToSave: T) => {
    if (recordId) {
      let query = supabaseClient.from(table).update(payloadToSave).eq('id', recordId);
      for (const [column, value] of Object.entries(options?.updateMatch || {})) {
        query = query.eq(column, value);
      }
      return query.select();
    }

    return supabaseClient.from(table).insert([payloadToSave]).select();
  };

  const cleanPayload = { ...payload };
  let result = await savePayload(cleanPayload);

  if (options?.stripMissingColumns !== false) {
    while (
      result.error &&
      result.error.code === 'PGRST204' &&
      /'([^']+)' column/.test(String(result.error.message || ''))
    ) {
      const missingColumn = String(result.error.message || '').match(/'([^']+)' column/)?.[1];
      if (!missingColumn || !(missingColumn in cleanPayload)) break;

      console.warn(`[${logPrefix}] Column missing in Supabase, retrying without: ${missingColumn}`);
      delete cleanPayload[missingColumn];
      result = await savePayload(cleanPayload);
    }
  }

  return result as SaveResult<T>;
}

export function bindHistoryItemActions<T extends EmployeeRecordRow>(options: {
  container: HTMLElement;
  rows: T[];
  editDataAttribute: string;
  deleteDataAttribute: string;
  getRowId: (row: T) => string;
  onEdit: (row: T) => void;
  onDelete: (rowId: string) => void | Promise<void>;
}): void {
  options.container
    .querySelectorAll<HTMLButtonElement>(`[${options.editDataAttribute}]`)
    .forEach((button) => {
      button.addEventListener('click', () => {
        const rowId = button.getAttribute(options.editDataAttribute);
        const record = options.rows.find((row) => String(options.getRowId(row)) === String(rowId));
        if (!record) return;
        options.onEdit(record);
      });
    });

  options.container
    .querySelectorAll<HTMLButtonElement>(`[${options.deleteDataAttribute}]`)
    .forEach((button) => {
      button.addEventListener('click', async () => {
        const rowId = button.getAttribute(options.deleteDataAttribute);
        if (!rowId) return;
        await options.onDelete(rowId);
      });
    });
}

export function renderBasicDashboardKpisIfAvailable(): void {
  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export type EditModeUiConfig = {
  saveButtonId: string;
  saveLabel: string;
  updateLabel: string;
  cancelButtonId?: string;
  editStatusId?: string;
  editStatusText?: string;
};

export function setRecordEditModeUi(config: EditModeUiConfig): void {
  const saveButton = safeGet(config.saveButtonId);
  if (saveButton) saveButton.textContent = config.updateLabel;

  const editStatus = config.editStatusId ? safeGet(config.editStatusId) : null;
  if (editStatus) {
    editStatus.textContent = config.editStatusText || 'Editing saved record';
    editStatus.classList.remove('hidden');
  }

  config.cancelButtonId && safeGet(config.cancelButtonId)?.classList.remove('hidden');
}

export function clearRecordEditModeUi(config: EditModeUiConfig): void {
  const saveButton = safeGet(config.saveButtonId);
  if (saveButton) saveButton.textContent = config.saveLabel;

  config.cancelButtonId && safeGet(config.cancelButtonId)?.classList.add('hidden');
  config.editStatusId && safeGet(config.editStatusId)?.classList.add('hidden');
}

export async function loadEmployeeRecordHistory<T extends EmployeeRecordRow>(options: {
  historyContainerId: string;
  table: string;
  employeeId: string;
  logPrefix: string;
  loadingMessage?: string;
  noEmployeeMessage?: string;
  emptyMessage?: string;
  errorMessage?: string;
  dateFields?: string[];
  order?: OrderSpec[];
  renderRows: (rows: T[]) => string;
  bindActions: (container: HTMLElement, rows: T[], reloadEmployeeId: string) => void;
  beforeLoad?: () => boolean | void;
}): Promise<string | null> {
  const target = safeGet(options.historyContainerId);
  if (!target) return null;

  if (options.beforeLoad?.() === false) {
    target.innerHTML = `<div class="empty">${options.noEmployeeMessage || 'Records are not available.'}</div>`;
    return null;
  }

  target.innerHTML = `<div class="empty">${options.loadingMessage || 'Loading...'}</div>`;

  try {
    const activeEmployee = getDrawerEmployee();
    const primaryEmployeeId = String(options.employeeId || getEmployeeId(activeEmployee) || '').trim();
    const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

    if (!primaryEmployeeId && !employeeIds.length) {
      target.innerHTML = `<div class="empty">${options.noEmployeeMessage || 'Open an employee to view records.'}</div>`;
      return null;
    }

    const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];
    const { data, error } = await fetchEmployeeRecords<T>(options.table, idsToSearch, options.order);

    if (error) {
      console.error(`[${options.logPrefix}] Could not load records:`, error);
      target.innerHTML = `<div class="empty">${options.errorMessage || 'Could not load records.'}</div>`;
      return null;
    }

    const rows = sortRecordsByDate(
      data,
      options.dateFields || ['incident_date', 'meeting_date', 'review_date', 'created_at']
    );

    if (!rows.length) {
      target.innerHTML = `<div class="empty">${options.emptyMessage || 'No records found.'}</div>`;
      return primaryEmployeeId || idsToSearch[0] || null;
    }

    target.innerHTML = options.renderRows(rows);
    options.bindActions(target, rows, primaryEmployeeId || idsToSearch[0] || '');
    return primaryEmployeeId || idsToSearch[0] || null;
  } catch (err) {
    console.error(`[${options.logPrefix}] Unexpected history failure:`, err);
    target.innerHTML = `<div class="empty">${options.errorMessage || 'Could not load records.'}</div>`;
    return null;
  }
}
