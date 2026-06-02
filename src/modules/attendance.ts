import { isAdminUser, isSupervisorUser } from '../services/access';
import {
  AttendanceSyncError,
  fetchIntuitAttendanceSnapshot,
  type AttendancePerson,
  type AttendanceSummary,
} from '../services/attendance';

declare global {
  interface Window {
    loadAttendance?: (force?: boolean) => Promise<void>;
    applyAttendanceAccess?: () => void;
  }
}

let attendanceCache: AttendanceSummary | null = null;
let attendanceLoading = false;

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

function renderPersonRow(person: AttendancePerson, index: number): string {
  const bg = index % 2 ? '' : ' style="background: #f6f8fa;"';
  return `<tr${bg}><td>${escapeHtml(person.employeeId)}</td><td>${escapeHtml(person.name)}</td><td>${escapeHtml(person.department || '—')}</td></tr>`;
}

function renderPeopleTable(targetId: string, rows: AttendancePerson[]): void {
  const body = safeGet<HTMLTableSectionElement>(targetId);
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3" class="empty">No records.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((row, index) => renderPersonRow(row, index)).join('');
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

function renderAttendance(snapshot: AttendanceSummary): void {
  const presentCount = safeGet('attendancePresentCount');
  const absentCount = safeGet('attendanceAbsentCount');
  const asOf = safeGet('attendanceAsOf');
  const source = safeGet('attendanceSource');

  if (presentCount) presentCount.textContent = String(snapshot.present.length);
  if (absentCount) absentCount.textContent = String(snapshot.absent.length);
  if (asOf) asOf.textContent = formatAsOfLabel(snapshot.asOf, snapshot.timezone);
  if (source) source.textContent = snapshot.source || 'Intuit Workforce';

  renderPeopleTable('attendancePresentBody', snapshot.present);
  renderPeopleTable('attendanceAbsentBody', snapshot.absent);
}

function setLoadingState(isLoading: boolean): void {
  const syncBtn = safeGet<HTMLButtonElement>('attendanceSyncBtn');
  if (!syncBtn) return;
  syncBtn.disabled = isLoading;
  syncBtn.textContent = isLoading ? 'Syncing…' : 'Sync now';
}

function canViewAttendance(): boolean {
  return isAdminUser() || isSupervisorUser();
}

export function applyAttendanceAccess(): void {
  const navBtn = document.querySelector<HTMLElement>('[data-attendance-access]');
  const section = safeGet('orbisSectionAttendance');
  const visible = canViewAttendance();

  if (navBtn) {
    navBtn.classList.toggle('hidden', !visible);
    navBtn.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  if (section && !visible && window.currentMainView === 'attendanceView') {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('dashboardView');
    }
  }
}

export async function loadAttendance(force = false): Promise<void> {
  if (!canViewAttendance()) return;
  if (attendanceLoading) return;
  if (!force && attendanceCache) {
    renderAttendance(attendanceCache);
    return;
  }

  attendanceLoading = true;
  setLoadingState(true);

  try {
    const snapshot = await fetchIntuitAttendanceSnapshot();
    attendanceCache = snapshot;
    renderAttendance(snapshot);
  } catch (error) {
    const message =
      error instanceof AttendanceSyncError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Could not load attendance.';
    console.error('[Attendance] Sync failed:', error);
    showToast(message, 'error');
  } finally {
    attendanceLoading = false;
    setLoadingState(false);
  }
}

function bindAttendanceUi(): void {
  const syncBtn = safeGet<HTMLButtonElement>('attendanceSyncBtn');
  if (!syncBtn || syncBtn.dataset.bound === '1') return;
  syncBtn.dataset.bound = '1';

  syncBtn.addEventListener('click', () => {
    void loadAttendance(true);
  });
}

bindAttendanceUi();
applyAttendanceAccess();

window.loadAttendance = loadAttendance;
window.applyAttendanceAccess = applyAttendanceAccess;
