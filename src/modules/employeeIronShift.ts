import { canManageCareEngagementRecords } from '../services/careEngagementAccess';
import { getEmployeeIronShiftMeta } from '../services/ironShiftAwards';
import { openCareRecognitionEditor } from './careEngagementEditor';

type EmployeeRow = Record<string, unknown>;

let bindingsReady = false;

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

export function renderEmployeeIronShiftAdminSection(
  employee: EmployeeRow | null | undefined
): void {
  const summary = document.getElementById('employeeIronShiftSummary');
  const button = document.getElementById('logIronShiftAwardBtn') as HTMLButtonElement | null;
  if (!summary || !button) return;

  if (!employee || window.isCreatingEmployee) {
    summary.textContent = 'Open an employee to view Iron Shift award history.';
    button.disabled = true;
    return;
  }

  const canManage = canManageCareEngagementRecords();
  button.disabled = !canManage;
  button.title = canManage
    ? 'Log an Iron Shift Award for this employee'
    : 'HR admin access is required to log Iron Shift awards';

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

function bindIronShiftAdminEvents(): void {
  if (bindingsReady) return;
  bindingsReady = true;

  document.getElementById('logIronShiftAwardBtn')?.addEventListener('click', () => {
    const employee = window.currentEmployee as EmployeeRow | null;
    if (!employee) return;
    void openCareRecognitionEditor(null, resolveEmployeeId(employee), 'iron_shift');
  });
}

bindIronShiftAdminEvents();

window.renderEmployeeIronShiftAdminSection = renderEmployeeIronShiftAdminSection;
