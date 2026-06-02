import { isAdminUser, isSupervisorUser } from '../services/access';
import {
  AttendanceSyncError,
  fetchIntuitAttendanceSnapshot,
  loadManualAttendanceSnapshot,
  saveManualAttendanceSnapshot,
  type AttendancePerson,
  type AttendanceSummary,
} from '../services/attendance';
import { isRemoteEmployee } from '../services/attendanceRemoteEmployees';
import { employeeDisplayName } from '../services/employeeUtils';
import { getActiveEmployees } from './employees';

declare global {
  interface Window {
    loadAttendance?: (force?: boolean) => Promise<void>;
    applyAttendanceAccess?: () => void;
  }
}

type EmployeeRow = {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  department?: string;
  dept?: string;
  status?: string;
  is_remote?: boolean | string | number | null;
  [key: string]: unknown;
};

let attendanceCache: AttendanceSummary | null = null;
let attendanceCacheDate: string | null = null;
let attendanceLoading = false;
let attendanceSaving = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function getSelectedDate(): string {
  const input = safeGet<HTMLInputElement>('attendanceDateInput');
  return input?.value || todayIsoDate();
}

function employeeRosterId(employee: EmployeeRow): string {
  return String(
    employee.employee_id || employee.displayId || employee.id || employee.dbId || ''
  ).trim();
}

function employeeDepartment(employee: EmployeeRow): string {
  return String(employee.department || employee.dept || '').trim();
}

function personFromEmployee(employee: EmployeeRow): AttendancePerson {
  return {
    employeeId: employeeRosterId(employee) || '—',
    name: employeeDisplayName(employee),
    department: employeeDepartment(employee) || undefined,
  };
}

function sortPeople(rows: AttendancePerson[]): AttendancePerson[] {
  return [...rows].sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.employeeId.localeCompare(b.employeeId, undefined, { sensitivity: 'base' });
  });
}

function personKey(person: AttendancePerson): string {
  return String(person.employeeId || person.name || '')
    .trim()
    .toLowerCase();
}

function emptySnapshot(): AttendanceSummary {
  return {
    asOf: new Date().toISOString(),
    source: 'Manual',
    present: [],
    absent: [],
  };
}

function ensureWorkingSnapshot(): AttendanceSummary {
  if (!attendanceCache) {
    attendanceCache = emptySnapshot();
  }
  return attendanceCache;
}

function sortEmployeesByName(employees: EmployeeRow[]): EmployeeRow[] {
  return employees.slice().sort((a, b) =>
    employeeDisplayName(a).localeCompare(employeeDisplayName(b), undefined, {
      sensitivity: 'base',
    })
  );
}

function partitionRosterEmployees(): { inHouse: EmployeeRow[]; remote: EmployeeRow[] } {
  const inHouse: EmployeeRow[] = [];
  const remote: EmployeeRow[] = [];

  sortEmployeesByName(getActiveEmployees()).forEach((employee) => {
    if (isRemoteEmployee(employee)) {
      remote.push(employee);
    } else {
      inHouse.push(employee);
    }
  });

  return { inHouse, remote };
}

function getRollCallEmployeeOrder(): EmployeeRow[] {
  const { inHouse, remote } = partitionRosterEmployees();
  return [...inHouse, ...remote];
}

function presentKeySet(snapshot: AttendanceSummary): Set<string> {
  return new Set(snapshot.present.map((person) => personKey(person)));
}

function formatAsOfLabel(asOf: string, timezone?: string): string {
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return asOf;

  const label = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return timezone ? `${label} (${timezone})` : label;
}

function updateAttendanceKpis(snapshot: AttendanceSummary): void {
  const presentCount = safeGet('attendancePresentCount');
  const absentCount = safeGet('attendanceAbsentCount');
  const asOf = safeGet('attendanceAsOf');
  const source = safeGet('attendanceSource');

  if (presentCount) presentCount.textContent = String(snapshot.present.length);
  if (absentCount) absentCount.textContent = String(snapshot.absent.length);
  if (asOf) asOf.textContent = formatAsOfLabel(snapshot.asOf, snapshot.timezone);
  if (source) source.textContent = snapshot.source || 'Manual';
}

function applyChecklistToSnapshot(): AttendanceSummary {
  const snapshot = ensureWorkingSnapshot();
  const present: AttendancePerson[] = [];
  const absent: AttendancePerson[] = [];
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');

  getRollCallEmployeeOrder().forEach((employee) => {
    const person = personFromEmployee(employee);
    const key = personKey(person);
    const checkbox = body?.querySelector<HTMLInputElement>(
      `input.attendance-present-check[data-attendance-key="${CSS.escape(key)}"]`
    );

    if (checkbox?.checked) {
      present.push(person);
    } else {
      absent.push(person);
    }
  });

  snapshot.present = sortPeople(present);
  snapshot.absent = sortPeople(absent);
  snapshot.asOf = new Date().toISOString();
  snapshot.source = snapshot.source || 'Manual';
  updateAttendanceKpis(snapshot);
  return snapshot;
}

function renderEmployeeChecklistRow(
  employee: EmployeeRow,
  presentKeys: Set<string>,
  remote: boolean
): string {
  const person = personFromEmployee(employee);
  const key = personKey(person);
  const checked = presentKeys.has(key);
  const classes = ['attendance-employee-row'];
  if (!checked) classes.push('is-absent');
  if (remote) classes.push('is-remote');

  const nameCell = remote
    ? `${escapeHtml(person.name)}<span class="attendance-remote-badge">Remote</span>`
    : escapeHtml(person.name);

  return `<tr class="${classes.join(' ')}">
    <td class="attendance-check-cell">
      <input
        type="checkbox"
        class="attendance-present-check"
        data-attendance-key="${escapeHtml(key)}"
        ${checked ? 'checked' : ''}
        aria-label="Present: ${escapeHtml(person.name)}${remote ? ' (remote)' : ''}"
      />
    </td>
    <td class="attendance-name-cell">${nameCell}</td>
    <td>${escapeHtml(person.employeeId)}</td>
    <td>${escapeHtml(person.department || '—')}</td>
  </tr>`;
}

function renderGroupHeaderRow(label: string, count: number): string {
  return `<tr class="attendance-group-row">
    <td colspan="4">
      <span class="attendance-group-label">${escapeHtml(label)}</span>
      <span class="attendance-group-count">${count}</span>
    </td>
  </tr>`;
}

function renderAttendanceChecklist(snapshot: AttendanceSummary): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return;

  const { inHouse, remote } = partitionRosterEmployees();
  const totalCount = inHouse.length + remote.length;
  updateAttendanceKpis(snapshot);

  if (!totalCount) {
    body.innerHTML =
      '<tr><td colspan="4" class="empty">No active employees in your roster.</td></tr>';
    return;
  }

  const presentKeys = presentKeySet(snapshot);
  const parts: string[] = [];

  if (inHouse.length) {
    parts.push(renderGroupHeaderRow('In house', inHouse.length));
    inHouse.forEach((employee) => {
      parts.push(renderEmployeeChecklistRow(employee, presentKeys, false));
    });
  }

  if (remote.length) {
    parts.push(renderGroupHeaderRow('Overseas / remote', remote.length));
    remote.forEach((employee) => {
      parts.push(renderEmployeeChecklistRow(employee, presentKeys, true));
    });
  }

  body.innerHTML = parts.join('');
}

function renderAttendance(snapshot: AttendanceSummary): void {
  renderAttendanceChecklist(snapshot);
}

function setAllChecklistChecked(checked: boolean): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return;

  body.querySelectorAll<HTMLInputElement>('.attendance-present-check').forEach((input) => {
    input.checked = checked;
    const row = input.closest('tr.attendance-employee-row');
    if (row) {
      row.classList.toggle('is-absent', !checked);
    }
  });

  applyChecklistToSnapshot();
}

function setSyncLoading(isLoading: boolean): void {
  const syncBtn = safeGet<HTMLButtonElement>('attendanceSyncBtn');
  if (!syncBtn) return;
  syncBtn.disabled = isLoading || attendanceSaving;
  syncBtn.textContent = isLoading ? 'Syncing…' : 'Sync from Intuit';
}

function setSaveLoading(isLoading: boolean): void {
  const saveBtn = safeGet<HTMLButtonElement>('attendanceSaveBtn');
  if (!saveBtn) return;
  saveBtn.disabled = isLoading || attendanceLoading;
  saveBtn.textContent = isLoading ? 'Saving…' : 'Save attendance';
}

function canViewAttendance(): boolean {
  return isAdminUser() || isSupervisorUser();
}

async function ensureEmployeesLoaded(): Promise<void> {
  if (getActiveEmployees().length) return;
  if (typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
  }
}

export async function saveAttendance(): Promise<void> {
  if (!canViewAttendance()) return;
  if (attendanceSaving) return;

  const date = getSelectedDate();
  const snapshot = applyChecklistToSnapshot();

  attendanceSaving = true;
  setSaveLoading(true);

  try {
    await saveManualAttendanceSnapshot(date, snapshot);
    attendanceCacheDate = date;
    snapshot.asOf = new Date().toISOString();
    snapshot.source = snapshot.source || 'Manual';
    attendanceCache = snapshot;
    updateAttendanceKpis(snapshot);
    showToast(`Attendance saved for ${date}.`);
  } catch (error) {
    const message =
      error instanceof AttendanceSyncError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Could not save attendance.';
    console.error('[Attendance] Save failed:', error);
    showToast(message, 'error');
  } finally {
    attendanceSaving = false;
    setSaveLoading(false);
  }
}

export function applyAttendanceAccess(): void {
  const visible = canViewAttendance();

  document.querySelectorAll<HTMLElement>('[data-attendance-access]').forEach((element) => {
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  const section = safeGet('orbisSectionAttendance');

  if (section && !visible && window.currentMainView === 'attendanceView') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('dashboardView');
    }
  }
}

export async function loadAttendance(force = false): Promise<void> {
  if (!canViewAttendance()) return;
  if (attendanceLoading) return;

  const date = getSelectedDate();
  if (!force && attendanceCache && attendanceCacheDate === date) {
    renderAttendance(attendanceCache);
    return;
  }

  attendanceLoading = true;
  setSyncLoading(true);

  try {
    await ensureEmployeesLoaded();

    const saved = await loadManualAttendanceSnapshot(date);
    if (saved) {
      attendanceCache = {
        ...saved,
        present: sortPeople(saved.present),
        absent: sortPeople(saved.absent),
      };
      attendanceCacheDate = date;
      renderAttendance(attendanceCache);
      return;
    }

    attendanceCache = emptySnapshot();
    attendanceCacheDate = date;
    renderAttendance(attendanceCache);
  } catch (error) {
    const message =
      error instanceof AttendanceSyncError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Could not load attendance.';
    console.error('[Attendance] Load failed:', error);
    showToast(message, 'error');
    attendanceCache = emptySnapshot();
    attendanceCacheDate = date;
    renderAttendance(attendanceCache);
  } finally {
    attendanceLoading = false;
    setSyncLoading(false);
  }
}

async function syncFromIntuit(): Promise<void> {
  if (!canViewAttendance()) return;
  if (attendanceLoading) return;

  attendanceLoading = true;
  setSyncLoading(true);

  try {
    const snapshot = await fetchIntuitAttendanceSnapshot();
    attendanceCache = {
      ...snapshot,
      present: sortPeople(snapshot.present),
      absent: sortPeople(snapshot.absent),
    };
    attendanceCacheDate = getSelectedDate();
    renderAttendance(attendanceCache);
    showToast('Loaded from Intuit. Click Save attendance to keep this day.', 'success');
  } catch (error) {
    const message =
      error instanceof AttendanceSyncError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Could not sync attendance.';
    console.error('[Attendance] Sync failed:', error);
    showToast(message, 'error');
  } finally {
    attendanceLoading = false;
    setSyncLoading(false);
  }
}

function bindAttendanceUi(): void {
  const dateInput = safeGet<HTMLInputElement>('attendanceDateInput');
  if (dateInput && !dateInput.value) {
    dateInput.value = todayIsoDate();
  }

  const syncBtn = safeGet<HTMLButtonElement>('attendanceSyncBtn');
  if (syncBtn && syncBtn.dataset.bound !== '1') {
    syncBtn.dataset.bound = '1';
    syncBtn.addEventListener('click', () => {
      void syncFromIntuit();
    });
  }

  const saveBtn = safeGet<HTMLButtonElement>('attendanceSaveBtn');
  if (saveBtn && saveBtn.dataset.bound !== '1') {
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', () => {
      void saveAttendance();
    });
  }

  const markAllBtn = safeGet<HTMLButtonElement>('attendanceMarkAllPresentBtn');
  if (markAllBtn && markAllBtn.dataset.bound !== '1') {
    markAllBtn.dataset.bound = '1';
    markAllBtn.addEventListener('click', () => {
      setAllChecklistChecked(true);
    });
  }

  const clearAllBtn = safeGet<HTMLButtonElement>('attendanceClearAllBtn');
  if (clearAllBtn && clearAllBtn.dataset.bound !== '1') {
    clearAllBtn.dataset.bound = '1';
    clearAllBtn.addEventListener('click', () => {
      setAllChecklistChecked(false);
    });
  }

  if (dateInput && dateInput.dataset.bound !== '1') {
    dateInput.dataset.bound = '1';
    dateInput.addEventListener('change', () => {
      attendanceCache = null;
      attendanceCacheDate = null;
      void loadAttendance(true);
    });
  }

  const checklistBody = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (checklistBody && checklistBody.dataset.bound !== '1') {
    checklistBody.dataset.bound = '1';
    checklistBody.addEventListener('change', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.classList.contains('attendance-present-check')) return;

      const row = target.closest('tr.attendance-employee-row');
      const input = target as HTMLInputElement;
      if (row) {
        row.classList.toggle('is-absent', !input.checked);
      }

      applyChecklistToSnapshot();
    });
  }
}

bindAttendanceUi();
applyAttendanceAccess();

window.loadAttendance = loadAttendance;
window.applyAttendanceAccess = applyAttendanceAccess;
