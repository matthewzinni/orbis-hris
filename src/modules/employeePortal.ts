import {
  createLeaveRequest,
  formatLeaveDateRange,
  leaveStatusLabel,
  leaveTypeLabel,
  loadLeaveRequestsForEmployee,
  type LeaveRequestRecord,
  type LeaveType,
} from '../services/leaveRequests';
import { getLinkedEmployeeId, hasPersonalEmployeePortal } from '../services/access';
import {
  formatPtoHours,
  loadEmployeePtoSnapshot,
  ptoPanelHeaderLabel,
} from '../services/ptoBalance';

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
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

function statusClass(status: string): string {
  return `leave-status leave-status--${esc(String(status || 'requested').toLowerCase())}`;
}

function renderMyLeaveRow(record: LeaveRequestRecord): string {
  const hours = record.hours != null ? `${record.hours} hr` : '';
  return `<div class="leave-request-row" data-leave-row-id="${esc(record.id)}">
    <div class="leave-request-row-top">
      <span class="${statusClass(record.status)}">${esc(leaveStatusLabel(record.status))}</span>
      <span class="leave-request-type">${esc(leaveTypeLabel(record.leave_type))}</span>
    </div>
    <div class="leave-request-dates">${esc(formatLeaveDateRange(record))}${hours ? ` · ${esc(hours)}` : ''}</div>
    ${record.notes ? `<div class="leave-request-notes muted">${esc(record.notes)}</div>` : ''}
    ${
      record.status === 'requested'
        ? '<div class="muted" style="font-size:0.8rem;margin-top:4px">Awaiting supervisor or HR approval</div>'
        : ''
    }
  </div>`;
}

export async function loadMyTimeOffPortal(): Promise<void> {
  if (!hasPersonalEmployeePortal()) return;

  const employeeId = getLinkedEmployeeId();
  const balanceEl = safeGet('myTimeOffBalanceValue');
  const balanceMeta = safeGet('myTimeOffBalanceMeta');
  const list = safeGet('myTimeOffRequestList');

  if (!employeeId) {
    if (balanceEl) balanceEl.textContent = '—';
    if (balanceMeta) {
      balanceMeta.textContent =
        'No employee record is linked to your account. Contact HR to match your login email to the personal or work email on your profile.';
    }
    if (list) list.innerHTML = '<div class="muted">Unable to load time off.</div>';
    return;
  }

  if (list) list.innerHTML = '<div class="muted">Loading…</div>';

  try {
    const rows = await loadLeaveRequestsForEmployee(employeeId);
    const snapshot = await loadEmployeePtoSnapshot(employeeId, rows);

    if (balanceEl) {
      balanceEl.textContent =
        snapshot.remainingHours == null
          ? 'Not set'
          : `${formatPtoHours(snapshot.remainingHours)} hours`;
    }

    const header = safeGet('myTimeOffPanelTitle');
    if (header) header.textContent = ptoPanelHeaderLabel(snapshot.remainingHours);

    if (balanceMeta) {
      if (snapshot.baselineHours == null) {
        balanceMeta.textContent =
          'PTO balance has not been imported yet. Contact HR if this looks wrong.';
      } else {
        const parts = [
          `Baseline ${formatPtoHours(snapshot.baselineHours)} hr`,
          snapshot.baselineAsOf ? `as of ${snapshot.baselineAsOf}` : null,
          snapshot.usedHours > 0
            ? `${formatPtoHours(snapshot.usedHours)} hr approved in Orbis`
            : null,
        ].filter(Boolean);
        balanceMeta.textContent = parts.join(' · ');
      }
    }

    if (!list) return;

    if (!rows.length) {
      list.innerHTML = '<div class="muted">No time off requests yet.</div>';
      return;
    }

    list.innerHTML = rows.map(renderMyLeaveRow).join('');
    if (typeof window.refreshMobilePortalUi === 'function') {
      window.refreshMobilePortalUi();
    }
  } catch (err) {
    console.error('[EmployeePortal]', err);
    if (list) list.innerHTML = '<div class="muted">Could not load your time off requests.</div>';
    showToast('Could not load time off.', 'error');
  }
}

export async function submitMyTimeOffRequest(): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  if (!employeeId) {
    showToast('Your employee record is not linked. Contact HR.', 'error');
    return;
  }

  const type = String(safeGet<HTMLSelectElement>('myTimeOffTypeInput')?.value || 'pto') as LeaveType;
  const start = String(safeGet<HTMLInputElement>('myTimeOffStartInput')?.value || '').trim();
  const end = String(safeGet<HTMLInputElement>('myTimeOffEndInput')?.value || '').trim();
  const hoursRaw = String(safeGet<HTMLInputElement>('myTimeOffHoursInput')?.value || '').trim();
  const notes = String(safeGet<HTMLTextAreaElement>('myTimeOffNotesInput')?.value || '').trim();

  if (!start) {
    showToast('Start date is required.', 'error');
    return;
  }

  if (!hoursRaw) {
    showToast('Hours are required for PTO tracking.', 'error');
    return;
  }

  const hours = Number(hoursRaw);
  if (Number.isNaN(hours) || hours <= 0) {
    showToast('Enter a valid number of hours.', 'error');
    return;
  }

  try {
    await createLeaveRequest({
      employee_id: employeeId,
      leave_type: type,
      start_date: start,
      end_date: end || null,
      hours,
      notes: notes || null,
    });

    showToast('Time off request submitted for approval.');
    safeGet<HTMLFormElement>('myTimeOffRequestForm')?.reset();
    await loadMyTimeOffPortal();
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not submit request.';
    showToast(message, 'error');
  }
}

function bindEmployeePortalUi(): void {
  const submitBtn = safeGet<HTMLButtonElement>('myTimeOffSubmitBtn');
  if (submitBtn && submitBtn.dataset.bound !== '1') {
    submitBtn.dataset.bound = '1';
    submitBtn.addEventListener('click', () => {
      void submitMyTimeOffRequest();
    });
  }
}

bindEmployeePortalUi();

window.loadMyTimeOffPortal = loadMyTimeOffPortal;
window.submitMyTimeOffRequest = submitMyTimeOffRequest;
