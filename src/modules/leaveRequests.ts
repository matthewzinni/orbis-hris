import {
  approveLeaveRequest,
  cancelLeaveRequest,
  canManageLeaveRequests,
  createLeaveRequest,
  denyLeaveRequest,
  employeeNameForLeave,
  formatLeaveDateRange,
  leaveStatusLabel,
  leaveTypeLabel,
  loadApprovedLeaveOutToday,
  loadLeaveRequestsForEmployee,
  type LeaveRequestRecord,
  type LeaveType,
} from '../services/leaveRequests';
import { isAdminUser } from '../services/access';

declare global {
  interface Window {
    loadEmployeeLeaveRequests?: (employeeId: string) => Promise<void>;
    submitEmployeeLeaveRequest?: () => Promise<void>;
    approveLeaveRequestById?: (requestId: string) => Promise<void>;
    denyLeaveRequestById?: (requestId: string) => Promise<void>;
    cancelLeaveRequestById?: (requestId: string) => Promise<void>;
    applyLeaveAccess?: () => void;
  }
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function getCurrentEmployeeRosterId(): string {
  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
  return String(employee?.id || employee?.employee_id || '').trim();
}

function statusClass(status: string): string {
  return `leave-status leave-status--${esc(String(status || 'requested').toLowerCase())}`;
}

function renderLeaveRow(record: LeaveRequestRecord): string {
  const canAct = record.status === 'requested' && canManageLeaveRequests();
  const actions = canAct
    ? `<div class="leave-request-actions">
        <button type="button" class="button soft" data-leave-action="approve" data-leave-id="${esc(record.id)}">Approve</button>
        <button type="button" class="button soft" data-leave-action="deny" data-leave-id="${esc(record.id)}">Deny</button>
      </div>`
    : record.status === 'requested'
      ? '<div class="muted" style="font-size:0.8rem">Awaiting approval</div>'
      : '';

  const hours = record.hours != null ? `${record.hours} hr` : '';
  const intermittent = record.intermittent ? ' · Intermittent' : '';

  return `<div class="leave-request-row" data-leave-row-id="${esc(record.id)}">
    <div class="leave-request-row-top">
      <span class="${statusClass(record.status)}">${esc(leaveStatusLabel(record.status))}</span>
      <span class="leave-request-type">${esc(leaveTypeLabel(record.leave_type))}</span>
    </div>
    <div class="leave-request-dates">${esc(formatLeaveDateRange(record))}${hours ? ` · ${esc(hours)}` : ''}${intermittent}</div>
    ${record.notes ? `<div class="leave-request-notes muted">${esc(record.notes)}</div>` : ''}
    ${actions}
  </div>`;
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

let leaveUiBound = false;

function bindLeaveRequestUi(): void {
  if (leaveUiBound) return;
  leaveUiBound = true;

  safeGet<HTMLButtonElement>('leaveRequestSubmitBtn')?.addEventListener('click', () => {
    void submitEmployeeLeaveRequest();
  });

  const list = safeGet('leaveRequestList');
  list?.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-leave-action]');
    if (!button) return;

    const id = button.dataset.leaveId || '';
    const action = button.dataset.leaveAction;
    if (!id || !action) return;

    event.preventDefault();
    if (action === 'approve') void approveLeaveRequestById(id);
    if (action === 'deny') void denyLeaveRequestById(id);
  });
}

export function applyLeaveAccess(): void {
  const visible = canManageLeaveRequests();

  document.querySelectorAll<HTMLElement>('[data-leave-access]').forEach((element) => {
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
}

export async function loadEmployeeLeaveRequests(employeeId: string): Promise<void> {
  const list = safeGet('leaveRequestList');
  const form = safeGet('leaveRequestForm');
  if (!list) return;

  if (!canManageLeaveRequests()) {
    if (form) form.classList.add('hidden');
    list.innerHTML = '<div class="muted">Time off is not available for your role.</div>';
    return;
  }

  if (form) form.classList.remove('hidden');

  const rosterId = employeeId || getCurrentEmployeeRosterId();
  list.innerHTML = '<div class="muted">Loading time off…</div>';

  try {
    const rows = await loadLeaveRequestsForEmployee(rosterId);
    if (!rows.length) {
      list.innerHTML = '<div class="muted">No leave requests for this employee.</div>';
      return;
    }

    list.innerHTML = rows.map(renderLeaveRow).join('');
  } catch (err) {
    list.innerHTML = '<div class="muted">Could not load leave requests.</div>';
    console.error('[LeaveRequests]', err);
  }
}

export async function submitEmployeeLeaveRequest(): Promise<void> {
  const rosterId = getCurrentEmployeeRosterId();
  if (!rosterId) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const type = String(safeGet<HTMLSelectElement>('leaveRequestTypeInput')?.value || 'pto') as LeaveType;
  const start = String(safeGet<HTMLInputElement>('leaveRequestStartInput')?.value || '').trim();
  const end = String(safeGet<HTMLInputElement>('leaveRequestEndInput')?.value || '').trim();
  const hoursRaw = String(safeGet<HTMLInputElement>('leaveRequestHoursInput')?.value || '').trim();
  const notes = String(safeGet<HTMLTextAreaElement>('leaveRequestNotesInput')?.value || '').trim();
  const intermittent = Boolean(safeGet<HTMLInputElement>('leaveRequestIntermittentInput')?.checked);

  if (!start) {
    showToast('Start date is required.', 'error');
    return;
  }

  try {
    await createLeaveRequest({
      employee_id: rosterId,
      leave_type: type,
      start_date: start,
      end_date: end || null,
      hours: hoursRaw ? Number(hoursRaw) : null,
      intermittent,
      notes: notes || null,
    });

    showToast('Leave request submitted.');
    safeGet<HTMLTextAreaElement>('leaveRequestNotesInput')!.value = '';
    await loadEmployeeLeaveRequests(rosterId);
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not submit request.', 'error');
  }
}

export async function approveLeaveRequestById(requestId: string): Promise<void> {
  const setLeave = Boolean(safeGet<HTMLInputElement>('leaveRequestSetStatusInput')?.checked);
  const rosterId = getCurrentEmployeeRosterId();
  const name = employeeNameForLeave(rosterId);

  try {
    await approveLeaveRequest(requestId, {
      setEmployeeLeaveStatus: setLeave,
      employeeName: name,
    });
    showToast('Leave request approved.');
    await loadEmployeeLeaveRequests(rosterId);
    if (typeof window.loadEmployees === 'function') {
      await window.loadEmployees();
    }
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not approve.', 'error');
  }
}

export async function denyLeaveRequestById(requestId: string): Promise<void> {
  const rosterId = getCurrentEmployeeRosterId();

  try {
    await denyLeaveRequest(requestId);
    showToast('Leave request denied.');
    await loadEmployeeLeaveRequests(rosterId);
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not deny.', 'error');
  }
}

export async function cancelLeaveRequestById(requestId: string): Promise<void> {
  if (!isAdminUser()) {
    showToast('Only admins can cancel approved leave.', 'error');
    return;
  }

  const rosterId = getCurrentEmployeeRosterId();

  try {
    await cancelLeaveRequest(requestId);
    showToast('Leave request cancelled.');
    await loadEmployeeLeaveRequests(rosterId);
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not cancel.', 'error');
  }
}

bindLeaveRequestUi();
applyLeaveAccess();

window.loadEmployeeLeaveRequests = loadEmployeeLeaveRequests;
window.submitEmployeeLeaveRequest = submitEmployeeLeaveRequest;
window.approveLeaveRequestById = approveLeaveRequestById;
window.denyLeaveRequestById = denyLeaveRequestById;
window.cancelLeaveRequestById = cancelLeaveRequestById;
window.applyLeaveAccess = applyLeaveAccess;

export async function renderOutTodayCard(): Promise<void> {
  const card = safeGet('hrInboxOutTodayCard');
  const list = safeGet('hrInboxOutTodayList');
  if (!card || !list) return;

  if (!canManageLeaveRequests()) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  try {
    const rows = await loadApprovedLeaveOutToday();
    if (!rows.length) {
      list.innerHTML = '<div class="muted">Everyone scheduled is expected in today.</div>';
      return;
    }

    list.innerHTML = rows
      .map((row) => {
        const name = employeeNameForLeave(row.employee_id);
        return `<div class="hr-inbox-out-today-item"><strong>${esc(name)}</strong> · ${esc(leaveTypeLabel(row.leave_type))} · ${esc(formatLeaveDateRange(row))}</div>`;
      })
      .join('');
  } catch {
    list.innerHTML = '<div class="muted">Could not load who is out today.</div>';
  }
}
