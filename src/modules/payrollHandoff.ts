import { getEmployeeById } from './employees';
import { isAdminUser } from '../services/access';
import { employeeDisplayName } from '../services/employeeUtils';
import {
  createPayrollHandoff,
  loadPayrollHandoffsForEmployee,
  payrollChangeTypeLabel,
  payrollHandoffStatusLabel,
  updatePayrollHandoffStatus,
  type PayrollChangeType,
  type PayrollHandoffRecord,
} from '../services/payrollHandoff';

declare global {
  interface Window {
    loadEmployeePayrollHandoffs?: (employeeId: string) => Promise<void>;
    logManualPayrollHandoff?: () => Promise<void>;
  }
}

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

function resolveRosterEmployeeId(employeeId: string): string {
  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
  if (employee) {
    return String(employee.id || employee.employee_id || employeeId).trim();
  }

  const match = getEmployeeById(employeeId);
  return String(match?.id || match?.employee_id || employeeId).trim();
}

function currentEmployeeContext(): {
  rosterId: string;
  name: string;
} | null {
  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
  if (!employee) return null;

  const rosterId = resolveRosterEmployeeId(String(employee.id || employee.employee_id || ''));
  if (!rosterId) return null;

  return {
    rosterId,
    name: employeeDisplayName(employee),
  };
}

function formatDateLabel(iso: string): string {
  if (!iso) return '—';
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderHandoffRow(record: PayrollHandoffRecord): string {
  const statusClass = `payroll-handoff-status--${esc(record.status)}`;
  const actions =
    record.status === 'pending'
      ? `<div class="payroll-handoff-actions">
          <button type="button" class="button soft" data-payroll-action="sent" data-payroll-id="${esc(record.id)}">Mark sent</button>
          <button type="button" class="button soft" data-payroll-action="confirmed" data-payroll-id="${esc(record.id)}">Confirmed</button>
        </div>`
      : record.status === 'sent'
        ? `<div class="payroll-handoff-actions">
            <button type="button" class="button soft" data-payroll-action="confirmed" data-payroll-id="${esc(record.id)}">Mark confirmed</button>
          </div>`
        : '';

  return `<div class="payroll-handoff-row" data-payroll-row-id="${esc(record.id)}">
    <div class="payroll-handoff-row-top">
      <span class="payroll-handoff-type">${esc(payrollChangeTypeLabel(record.change_type))}</span>
      <span class="payroll-handoff-status ${statusClass}">${esc(payrollHandoffStatusLabel(record.status))}</span>
    </div>
    <div class="payroll-handoff-summary">${esc(record.summary)}</div>
    <div class="payroll-handoff-meta muted">
      Effective ${esc(formatDateLabel(record.effective_date))}
      · Logged ${esc(formatDateLabel(record.created_at.slice(0, 10)))}
    </div>
    ${actions}
  </div>`;
}

let payrollHandoffBound = false;

function bindPayrollHandoffPanel(): void {
  if (payrollHandoffBound) return;
  payrollHandoffBound = true;

  const list = safeGet('payrollHandoffList');
  list?.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-payroll-action]');
    if (!button) return;

    const handoffId = button.dataset.payrollId || '';
    const action = button.dataset.payrollAction;
    if (!handoffId || !action) return;

    event.preventDefault();
    void (async () => {
      try {
        await updatePayrollHandoffStatus(
          handoffId,
          action === 'confirmed' ? 'confirmed' : 'sent'
        );
        showToast(
          action === 'confirmed' ? 'Marked confirmed with payroll.' : 'Marked sent to payroll.'
        );
        const ctx = currentEmployeeContext();
        if (ctx) {
          await loadEmployeePayrollHandoffs(ctx.rosterId);
        }
        if (typeof window.loadHrInbox === 'function') {
          void window.loadHrInbox(true);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update handoff.', 'error');
      }
    })();
  });

  safeGet<HTMLButtonElement>('payrollHandoffLogBtn')?.addEventListener('click', () => {
    void logManualPayrollHandoff();
  });
}

export async function loadEmployeePayrollHandoffs(employeeId: string): Promise<void> {
  const list = safeGet('payrollHandoffList');
  const panel = safeGet('payrollHandoffPanel');
  if (!list || !panel) return;

  if (!isAdminUser()) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  list.innerHTML = '<div class="muted">Loading payroll handoffs…</div>';

  const effectiveInput = safeGet<HTMLInputElement>('payrollHandoffEffectiveInput');
  if (effectiveInput && !effectiveInput.value) {
    effectiveInput.value = new Date().toISOString().slice(0, 10);
  }

  const rosterId = resolveRosterEmployeeId(employeeId);

  try {
    const rows = await loadPayrollHandoffsForEmployee(rosterId);
    if (!rows.length) {
      list.innerHTML =
        '<div class="muted">No payroll handoffs logged. Changes you save in this tab can auto-create entries.</div>';
      return;
    }

    list.innerHTML = rows.map(renderHandoffRow).join('');
  } catch (err) {
    list.innerHTML = '<div class="muted">Could not load payroll handoffs.</div>';
    console.error('[PayrollHandoff]', err);
  }
}

export async function logManualPayrollHandoff(): Promise<void> {
  const ctx = currentEmployeeContext();
  if (!ctx) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const typeSelect = safeGet<HTMLSelectElement>('payrollHandoffTypeInput');
  const effectiveInput = safeGet<HTMLInputElement>('payrollHandoffEffectiveInput');
  const summaryInput = safeGet<HTMLInputElement>('payrollHandoffSummaryInput');

  const change_type = String(typeSelect?.value || 'other').trim() as PayrollChangeType;
  const effective_date = String(effectiveInput?.value || '').trim();
  const summary = String(summaryInput?.value || '').trim();

  if (!effective_date) {
    showToast('Effective date is required.', 'error');
    return;
  }

  if (!summary) {
    showToast('Summary is required.', 'error');
    return;
  }

  try {
    const row = await createPayrollHandoff({
      employee_id: ctx.rosterId,
      change_type,
      effective_date,
      summary,
    });

    if (!row) {
      showToast('A pending handoff of this type already exists.', 'error');
      return;
    }

    showToast('Payroll handoff logged.');
    if (summaryInput) summaryInput.value = '';
    await loadEmployeePayrollHandoffs(ctx.rosterId);
    if (typeof window.loadHrInbox === 'function') {
      void window.loadHrInbox(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not log handoff.', 'error');
  }
}

bindPayrollHandoffPanel();

window.loadEmployeePayrollHandoffs = loadEmployeePayrollHandoffs;
window.logManualPayrollHandoff = logManualPayrollHandoff;
