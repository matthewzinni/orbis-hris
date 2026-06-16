import { isAdminUser, isSupervisorUser } from '../services/access';
import {
  ATTENDANCE_LOOKBACK_DAYS,
  ATTENDANCE_REPEAT_ABSENCE_MIN,
  loadRepeatedAbsenceReport,
  type AbsenceRollupRow,
} from '../services/attendanceAbsenceReport';
import {
  AttendanceSyncError,
  loadManualAttendanceSnapshot,
  saveManualAttendanceSnapshot,
  type AttendancePerson,
  type AttendanceSummary,
} from '../services/attendance';
import { syncEmployeeStatusFromRollCall } from '../services/attendanceStatusSync';
import { isRemoteEmployee } from '../services/attendanceRemoteEmployees';
import { loadApprovedLeaveOutToday } from '../services/leaveRequests';
import { employeeDisplayName } from '../services/employeeUtils';
import { getEmployees, normalizeEmployeeStatus } from './employees';

type EmployeeRow = {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  department?: string;
  dept?: string;
  status?: string;
  [key: string]: unknown;
};

let attendanceCache: AttendanceSummary | null = null;
let attendanceCacheDate: string | null = null;
let attendanceLoading = false;
let attendanceSaving = false;
let leaveTodayIdsCache = new Set<string>();

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

function isLeaveProtectedEmployee(employee: EmployeeRow): boolean {
  const id = employeeRosterId(employee);
  const status = String(employee.status || '')
    .trim()
    .toUpperCase();
  if (status === 'LEAVE' || status === 'ON LEAVE') return true;
  return id ? leaveTodayIdsCache.has(id) : false;
}

async function refreshLeaveTodayCache(): Promise<void> {
  try {
    const rows = await loadApprovedLeaveOutToday();
    leaveTodayIdsCache = new Set(
      rows.map((row) => String(row.employee_id || '').trim()).filter(Boolean)
    );
  } catch {
    leaveTodayIdsCache = new Set();
  }
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

/** Active + on leave + marked absent today still appear on roll call (save sets status Absent). */
function isRollCallRosterEmployee(employee: EmployeeRow): boolean {
  const status = normalizeEmployeeStatus(employee.status);
  return status === 'active' || status === 'leave' || status === 'absent';
}

function getRollCallEmployees(): EmployeeRow[] {
  return sortEmployeesByName(getEmployees()).filter(
    (employee) => !isRemoteEmployee(employee) && isRollCallRosterEmployee(employee)
  );
}

function isPersonOnRollCall(person: AttendancePerson): boolean {
  return !isRemoteEmployee(person.employeeId);
}

function filterSnapshotForRollCall(snapshot: AttendanceSummary): AttendanceSummary {
  const present = snapshot.present.filter(isPersonOnRollCall);
  const absent = snapshot.absent.filter(isPersonOnRollCall);
  return {
    ...snapshot,
    present: sortPeople(present),
    absent: sortPeople(absent),
  };
}

function presentKeySet(snapshot: AttendanceSummary): Set<string> {
  return new Set(snapshot.present.map((person) => personKey(person)));
}

function absentKeySet(snapshot: AttendanceSummary): Set<string> {
  return new Set(snapshot.absent.map((person) => personKey(person)));
}

function getRowCheckboxes(row: Element | null): {
  present: HTMLInputElement | null;
  absent: HTMLInputElement | null;
} {
  if (!row) return { present: null, absent: null };
  return {
    present: row.querySelector<HTMLInputElement>('.attendance-present-check'),
    absent: row.querySelector<HTMLInputElement>('.attendance-absent-check'),
  };
}

function syncRowAttendanceClasses(row: Element | null): void {
  if (!row) return;
  const { present, absent } = getRowCheckboxes(row);
  row.classList.toggle('is-present', Boolean(present?.checked));
  row.classList.toggle('is-absent', Boolean(absent?.checked));
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

function countChecklistFromDom(): { present: number; absent: number } | null {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return null;

  const presentInputs = body.querySelectorAll<HTMLInputElement>('.attendance-present-check');
  if (!presentInputs.length) return null;

  let present = 0;
  let absent = 0;
  presentInputs.forEach((input) => {
    if (input.checked) present += 1;
  });
  body.querySelectorAll<HTMLInputElement>('.attendance-absent-check').forEach((input) => {
    if (input.checked) absent += 1;
  });
  return { present, absent };
}

function formatAbsenceDates(dates: string[]): string {
  if (!dates.length) return '—';
  if (dates.length <= 4) {
    return dates
      .map((date) => {
        const parsed = new Date(`${date}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return date;
        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      })
      .join(', ');
  }

  const shown = dates.slice(0, 3).map((date) => {
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });

  return `${shown.join(', ')} +${dates.length - 3} more`;
}

function renderAbsenceReportRows(rows: AbsenceRollupRow[]): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceAbsenceReportBody');
  const countEl = safeGet('attendanceRepeatAbsenceCount');
  if (!body) return;

  if (countEl) countEl.textContent = String(rows.length);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No employees with ${ATTENDANCE_REPEAT_ABSENCE_MIN} or more absences in the past ${ATTENDANCE_LOOKBACK_DAYS} days.</td></tr>`;
    window.renderMobileAbsenceCards?.([]);
    return;
  }

  body.innerHTML = rows
    .map(
      (row) => `
        <tr
          class="attendance-absence-report-row"
          data-attendance-open-employee="${escapeHtml(row.employeeId)}"
          tabindex="0"
          role="button"
        >
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${escapeHtml(row.employeeId)}</td>
          <td>${escapeHtml(row.department || '—')}</td>
          <td><span class="badge badge-absent">${row.absenceCount}</span></td>
          <td class="muted attendance-absence-dates">${escapeHtml(formatAbsenceDates(row.absenceDates))}</td>
        </tr>
      `
    )
    .join('');

  window.renderMobileAbsenceCards?.(
    rows.map((row) => ({
      employeeId: row.employeeId,
      name: row.name,
      department: row.department || '—',
      absenceCount: row.absenceCount,
      datesLabel: formatAbsenceDates(row.absenceDates),
    }))
  );
}

async function loadAbsenceReportPanel(): Promise<void> {
  const body = safeGet<HTMLTableSectionElement>('attendanceAbsenceReportBody');
  if (!body || !canViewAttendance()) return;

  body.innerHTML = '<tr><td colspan="5" class="empty">Loading absence report…</td></tr>';

  try {
    await ensureEmployeesLoaded();
    const rows = await loadRepeatedAbsenceReport({
      roster: getEmployees(),
    });
    renderAbsenceReportRows(rows);
  } catch (error) {
    console.error('[Attendance] Absence report failed:', error);
    body.innerHTML =
      '<tr><td colspan="5" class="empty">Could not load repeated absence report.</td></tr>';
    const countEl = safeGet('attendanceRepeatAbsenceCount');
    if (countEl) countEl.textContent = '—';
  }
}

function updateAttendanceKpis(snapshot: AttendanceSummary): void {
  const presentCount = safeGet('attendancePresentCount');
  const absentCount = safeGet('attendanceAbsentCount');
  const asOf = safeGet('attendanceAsOf');
  const source = safeGet('attendanceSource');

  const fromDom = countChecklistFromDom();
  const presentTotal = fromDom ? fromDom.present : snapshot.present.length;
  const absentTotal = fromDom ? fromDom.absent : snapshot.absent.length;

  if (presentCount) presentCount.textContent = String(presentTotal);
  if (absentCount) absentCount.textContent = String(absentTotal);
  if (asOf) asOf.textContent = formatAsOfLabel(snapshot.asOf, snapshot.timezone);
  if (source) source.textContent = snapshot.source || 'Manual';
}

function applyChecklistToSnapshot(): AttendanceSummary {
  const snapshot = ensureWorkingSnapshot();
  const present: AttendancePerson[] = [];
  const absent: AttendancePerson[] = [];
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');

  getRollCallEmployees().forEach((employee) => {
    const person = personFromEmployee(employee);
    const key = personKey(person);
    const row = body?.querySelector<HTMLTableRowElement>(
      `tr.attendance-employee-row[data-attendance-key="${CSS.escape(key)}"]`
    );
    const { present: presentCheck, absent: absentCheck } = getRowCheckboxes(row);

    if (presentCheck?.checked) {
      present.push(person);
    } else if (absentCheck?.checked) {
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
  absentKeys: Set<string>
): string {
  const person = personFromEmployee(employee);
  const key = personKey(person);
  const isPresent = presentKeys.has(key);
  const isAbsent = absentKeys.has(key);
  const onLeave = isLeaveProtectedEmployee(employee);
  const classes = ['attendance-employee-row'];
  if (isPresent) classes.push('is-present');
  if (isAbsent) classes.push('is-absent');
  if (onLeave) classes.push('is-on-leave');

  const leaveBadge = onLeave
    ? '<span class="badge badge-leave attendance-leave-badge">On leave</span>'
    : '';

  return `<tr class="${classes.join(' ')}" data-attendance-key="${escapeHtml(key)}">
    <td class="attendance-check-cell">
      <input
        type="checkbox"
        class="attendance-present-check"
        data-attendance-key="${escapeHtml(key)}"
        ${isPresent ? 'checked' : ''}
        aria-label="Present: ${escapeHtml(person.name)}"
      />
    </td>
    <td class="attendance-check-cell">
      <input
        type="checkbox"
        class="attendance-absent-check"
        data-attendance-key="${escapeHtml(key)}"
        ${isAbsent ? 'checked' : ''}
        aria-label="Absent: ${escapeHtml(person.name)}"
      />
    </td>
    <td class="attendance-name-cell">${escapeHtml(person.name)}${leaveBadge}</td>
    <td>${escapeHtml(person.employeeId)}</td>
    <td>${escapeHtml(person.department || '—')}</td>
  </tr>`;
}

function renderAttendanceChecklist(snapshot: AttendanceSummary): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return;

  const employees = getRollCallEmployees();

  if (!employees.length) {
    body.innerHTML =
      '<tr><td colspan="5" class="empty">No active employees in your roster.</td></tr>';
    window.renderMobileAttendanceRollCall?.([]);
    updateAttendanceKpis(snapshot);
    return;
  }

  const presentKeys = presentKeySet(snapshot);
  const absentKeys = absentKeySet(snapshot);
  body.innerHTML = employees
    .map((employee) => renderEmployeeChecklistRow(employee, presentKeys, absentKeys))
    .join('');

  window.renderMobileAttendanceRollCall?.(
    employees.map((employee) => {
      const person = personFromEmployee(employee);
      const key = personKey(person);
      return {
        attendanceKey: key,
        name: person.name,
        department: person.department || '—',
        presentChecked: presentKeys.has(key),
        absentChecked: absentKeys.has(key),
      };
    })
  );

  updateAttendanceKpis(snapshot);
}

function renderAttendance(snapshot: AttendanceSummary): void {
  renderAttendanceChecklist(snapshot);
}

function setAllPresentChecked(checked: boolean): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return;

  body.querySelectorAll<HTMLInputElement>('.attendance-present-check').forEach((input) => {
    input.checked = checked;
    const row = input.closest('tr.attendance-employee-row');
    if (checked && row) {
      const absent = getRowCheckboxes(row).absent;
      if (absent) absent.checked = false;
    }
    syncRowAttendanceClasses(row);
  });

  updateAttendanceKpis(ensureWorkingSnapshot());
}

function setAllAbsentChecked(checked: boolean): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return;

  body.querySelectorAll<HTMLInputElement>('.attendance-absent-check').forEach((input) => {
    input.checked = checked;
    const row = input.closest('tr.attendance-employee-row');
    if (checked && row) {
      const present = getRowCheckboxes(row).present;
      if (present) present.checked = false;
    }
    syncRowAttendanceClasses(row);
  });

  updateAttendanceKpis(ensureWorkingSnapshot());
}

function clearAllChecklist(): void {
  const body = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (!body) return;

  body.querySelectorAll<HTMLInputElement>('.attendance-present-check, .attendance-absent-check').forEach(
    (input) => {
      input.checked = false;
      syncRowAttendanceClasses(input.closest('tr.attendance-employee-row'));
    }
  );

  updateAttendanceKpis(ensureWorkingSnapshot());
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
  if (getEmployees().length) return;
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

    const syncResult = await syncEmployeeStatusFromRollCall(
      snapshot,
      date,
      todayIsoDate(),
      getRollCallEmployees()
    );

    if (syncResult && (syncResult.markedAbsent || syncResult.markedActive)) {
      if (typeof window.loadEmployees === 'function') {
        await window.loadEmployees();
      }
      renderAttendance(snapshot);
      if (typeof window.refreshDashboardKpis === 'function') {
        window.refreshDashboardKpis();
      }
    }

    let toast = `Attendance saved for ${date}.`;
    if (syncResult?.markedAbsent) {
      toast += ` ${syncResult.markedAbsent} marked Absent.`;
    }
    if (syncResult?.markedActive) {
      toast += ` ${syncResult.markedActive} returned to Active.`;
    }
    if (syncResult?.skippedLeave) {
      toast += ` ${syncResult.skippedLeave} on leave (unchanged).`;
    }
    showToast(toast);
    void loadAbsenceReportPanel();
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
    void loadAbsenceReportPanel();
    return;
  }

  attendanceLoading = true;

  try {
    await ensureEmployeesLoaded();
    await refreshLeaveTodayCache();

    const saved = await loadManualAttendanceSnapshot(date);
    if (saved) {
      attendanceCache = filterSnapshotForRollCall({
        ...saved,
        present: sortPeople(saved.present),
        absent: sortPeople(saved.absent),
      });
      attendanceCacheDate = date;
      renderAttendance(attendanceCache);
      void loadAbsenceReportPanel();
      return;
    }

    attendanceCache = emptySnapshot();
    attendanceCacheDate = date;
    renderAttendance(attendanceCache);
    void loadAbsenceReportPanel();
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
    void loadAbsenceReportPanel();
  } finally {
    attendanceLoading = false;
  }
}

function bindAttendanceUi(): void {
  const dateInput = safeGet<HTMLInputElement>('attendanceDateInput');
  if (dateInput && !dateInput.value) {
    dateInput.value = todayIsoDate();
  }

  const saveBtn = safeGet<HTMLButtonElement>('attendanceSaveBtn');
  if (saveBtn && saveBtn.dataset.bound !== '1') {
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', () => {
      void saveAttendance();
    });
  }

  const markAllPresentBtn = safeGet<HTMLButtonElement>('attendanceMarkAllPresentBtn');
  if (markAllPresentBtn && markAllPresentBtn.dataset.bound !== '1') {
    markAllPresentBtn.dataset.bound = '1';
    markAllPresentBtn.addEventListener('click', () => {
      setAllPresentChecked(true);
    });
  }

  const markAllAbsentBtn = safeGet<HTMLButtonElement>('attendanceMarkAllAbsentBtn');
  if (markAllAbsentBtn && markAllAbsentBtn.dataset.bound !== '1') {
    markAllAbsentBtn.dataset.bound = '1';
    markAllAbsentBtn.addEventListener('click', () => {
      setAllAbsentChecked(true);
    });
  }

  const clearAllBtn = safeGet<HTMLButtonElement>('attendanceClearAllBtn');
  if (clearAllBtn && clearAllBtn.dataset.bound !== '1') {
    clearAllBtn.dataset.bound = '1';
    clearAllBtn.addEventListener('click', () => {
      clearAllChecklist();
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

  const absenceRefreshBtn = safeGet<HTMLButtonElement>('attendanceAbsenceReportRefreshBtn');
  if (absenceRefreshBtn && absenceRefreshBtn.dataset.bound !== '1') {
    absenceRefreshBtn.dataset.bound = '1';
    absenceRefreshBtn.addEventListener('click', () => {
      void loadAbsenceReportPanel();
    });
  }

  const absenceReportBody = safeGet<HTMLTableSectionElement>('attendanceAbsenceReportBody');
  if (absenceReportBody && absenceReportBody.dataset.bound !== '1') {
    absenceReportBody.dataset.bound = '1';
    absenceReportBody.addEventListener('click', (event) => {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-attendance-open-employee]'
      );
      const employeeId = row?.dataset.attendanceOpenEmployee || '';
      if (!employeeId || employeeId === '—') return;
      if (typeof window.openEmployeeDrawer === 'function') {
        void window.openEmployeeDrawer(employeeId);
      }
    });
    absenceReportBody.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-attendance-open-employee]'
      );
      if (!row) return;
      event.preventDefault();
      const employeeId = row.dataset.attendanceOpenEmployee || '';
      if (!employeeId || employeeId === '—') return;
      if (typeof window.openEmployeeDrawer === 'function') {
        void window.openEmployeeDrawer(employeeId);
      }
    });
  }

  const checklistBody = safeGet<HTMLTableSectionElement>('attendanceChecklistBody');
  if (checklistBody && checklistBody.dataset.bound !== '1') {
    checklistBody.dataset.bound = '1';
    checklistBody.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (
        !target?.classList.contains('attendance-present-check') &&
        !target?.classList.contains('attendance-absent-check')
      ) {
        return;
      }

      const row = target.closest('tr.attendance-employee-row');
      if (!row) return;

      const { present, absent } = getRowCheckboxes(row);

      if (target.classList.contains('attendance-present-check') && target.checked && absent) {
        absent.checked = false;
      }

      if (target.classList.contains('attendance-absent-check') && target.checked && present) {
        present.checked = false;
      }

      syncRowAttendanceClasses(row);
      updateAttendanceKpis(ensureWorkingSnapshot());
    });
  }
}

bindAttendanceUi();
applyAttendanceAccess();

window.loadAttendance = loadAttendance;
window.applyAttendanceAccess = applyAttendanceAccess;
