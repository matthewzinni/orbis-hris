import {
  canEditEmployeeAdmin,
  getCurrentUserAccess,
  getLinkedEmployeeId,
  isAdminUser,
} from '../services/access';
import { recordAuditEvent } from '../services/auditTrail';
import { getEmployeeIronShiftMeta, refreshIronShiftAwardRosterMap } from '../services/ironShiftAwards';
import { supabaseClient } from '../services/supabaseClient';

type EmployeeRow = Record<string, unknown>;

let bindingsReady = false;
let saving = false;

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

function todayIso(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Date not recorded';
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveEmployeeId(employee: EmployeeRow): string {
  return String(
    employee.dbId || employee.id || employee.employee_id || employee.displayId || ''
  ).trim();
}

function resolveEmployeeName(employee: EmployeeRow): string {
  const full = `${String(employee.first_name || employee.firstName || '').trim()} ${String(
    employee.last_name || employee.lastName || ''
  ).trim()}`.trim();
  return full || String(employee.name || employee.displayName || '').trim();
}

function currentUserLabel(): string {
  const access = getCurrentUserAccess();
  return String(access?.display_name || access?.email || '').trim() || 'HR';
}

/**
 * Admins can award anyone; supervisors only people on their own team (same rule as
 * Employee Admin) and never themselves.
 */
export function canGiveIronShiftAward(employee: EmployeeRow | null | undefined): boolean {
  if (!employee || window.isCreatingEmployee) return false;
  if (isAdminUser()) return true;
  const linkedId = getLinkedEmployeeId();
  if (linkedId && resolveEmployeeId(employee) === linkedId) return false;
  return canEditEmployeeAdmin(employee);
}

export function renderEmployeeIronShiftAdminSection(
  employee: EmployeeRow | null | undefined
): void {
  const summary = document.getElementById('employeeIronShiftSummary');
  const button = document.getElementById('giveIronShiftAwardBtn') as HTMLButtonElement | null;
  const reason = document.getElementById('ironShiftReasonInput') as HTMLTextAreaElement | null;
  if (!summary || !button) return;

  if (!employee || window.isCreatingEmployee) {
    summary.textContent = 'Open an employee to view Iron Shift award history.';
    button.disabled = true;
    if (reason) reason.disabled = true;
    return;
  }

  const canGive = canGiveIronShiftAward(employee);
  button.disabled = !canGive || saving;
  if (reason) reason.disabled = !canGive;
  button.title = canGive
    ? 'Give this employee an Iron Shift Award'
    : 'You can only give Iron Shift Awards to people on your team';

  const meta = getEmployeeIronShiftMeta(employee);
  if (!meta) {
    summary.innerHTML = 'No Iron Shift award logged yet.';
    return;
  }

  const countLabel =
    meta.awardCount > 1 ? `${meta.awardCount} Iron Shift awards on file.` : 'Iron Shift Award recipient.';
  summary.innerHTML = `
    <strong>${esc(countLabel)}</strong><br />
    Latest: ${esc(meta.summary || 'Recognized for exceptional shift performance.')}<br />
    <span class="muted">${esc(formatDate(meta.recognizedOn))}${meta.recognizedBy ? ` · ${esc(meta.recognizedBy)}` : ''}</span>
  `;
}

export async function giveIronShiftAward(): Promise<void> {
  const employee = window.currentEmployee as EmployeeRow | null;
  if (!employee) {
    showToast('Open an employee first.', 'error');
    return;
  }
  if (!canGiveIronShiftAward(employee)) {
    showToast('You can only give Iron Shift Awards to people on your team.', 'error');
    return;
  }

  const input = document.getElementById('ironShiftReasonInput') as HTMLTextAreaElement | null;
  const reason = String(input?.value || '').trim();
  if (!reason) {
    showToast('Enter a reason before giving the Iron Shift Award.', 'error');
    return;
  }
  if (saving) return;

  saving = true;
  renderEmployeeIronShiftAdminSection(employee);
  try {
    const { error } = await supabaseClient.from('care_recognition').insert({
      employee_id: resolveEmployeeId(employee),
      employee_name: resolveEmployeeName(employee),
      department: String(employee.department || '').trim(),
      recognition_type: 'iron_shift',
      summary: reason,
      recognized_on: todayIso(),
      recognized_by: currentUserLabel(),
    });

    if (error) {
      console.error(error);
      showToast('Could not give the Iron Shift Award.', 'error');
      return;
    }

    if (input) input.value = '';
    showToast('Iron Shift Award given.');
    recordAuditEvent('Gave Iron Shift Award', employee, reason);
    await refreshIronShiftAwardRosterMap();
    if (typeof window.loadIronShiftAwardsFallback === 'function') {
      await window.loadIronShiftAwardsFallback();
    }
  } finally {
    saving = false;
    renderEmployeeIronShiftAdminSection(window.currentEmployee as EmployeeRow | null);
  }
}

function bindIronShiftAdminEvents(): void {
  if (bindingsReady) return;
  bindingsReady = true;

  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest('button');
    if (button?.id !== 'giveIronShiftAwardBtn') return;
    event.preventDefault();
    void giveIronShiftAward();
  });
}

bindIronShiftAdminEvents();

window.renderEmployeeIronShiftAdminSection = renderEmployeeIronShiftAdminSection;
window.giveIronShiftAward = giveIronShiftAward;
