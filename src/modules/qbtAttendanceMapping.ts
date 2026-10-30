/**
 * Settings & Admin → "QuickBooks Time attendance mapping" (admins only).
 * Maps Orbis employees to their QuickBooks Time user id (never by name) and sets each
 * employee's scheduled start time, used by the live attendance sync to decide when a missed
 * punch should display as "absent." Self-mounts into Settings, same pattern as
 * src/modules/ptoSyncCard.ts for Reports.
 */
import { isAdminUser } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import {
  AttendanceLiveSyncError,
  syncAttendanceFromQuickBooksTime,
  type AttendanceSyncUnmatched,
} from '../services/attendanceLiveStatus';
import { employeeDisplayName } from '../services/employeeUtils';
import { getEmployees, normalizeEmployeeStatus } from './employees';

const CARD_ID = 'qbtAttendanceMappingCard';

type QbtUserOption = { qbtUserId: string; name: string };

function toast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

function getEligibleEmployees(): Record<string, unknown>[] {
  return getEmployees().filter((employee) => normalizeEmployeeStatus(employee.status) !== 'terminated');
}

let cachedQbtUsers: QbtUserOption[] = [];
let cachedUnmatched: AttendanceSyncUnmatched[] = [];

function qbtUserOptionsHtml(selectedQbtUserId: string): string {
  const options = [`<option value="" ${selectedQbtUserId ? '' : 'selected'}>— Unmapped —</option>`];
  cachedQbtUsers.forEach((user) => {
    const selected = user.qbtUserId === selectedQbtUserId ? 'selected' : '';
    options.push(`<option value="${esc(user.qbtUserId)}" ${selected}>${esc(user.name)} (#${esc(user.qbtUserId)})</option>`);
  });
  return options.join('');
}

function renderEmployeeRows(): string {
  const employees = [...getEligibleEmployees()].sort((a, b) =>
    employeeDisplayName(a).localeCompare(employeeDisplayName(b))
  );

  if (!employees.length) {
    return '<tr><td colspan="4" class="empty">No employees loaded.</td></tr>';
  }

  return employees
    .map((employee) => {
      const id = String(employee.id || employee.dbId || employee.employee_id || '');
      const currentQbtId = String(employee.qbt_user_id || '');
      const scheduledStart = String(employee.scheduled_start_time || '').slice(0, 5); // HH:MM for <input type=time>

      return `
        <tr data-qbt-mapping-row="${esc(id)}">
          <td>${esc(employeeDisplayName(employee))}</td>
          <td>
            <select class="input" data-qbt-user-select>${qbtUserOptionsHtml(currentQbtId)}</select>
          </td>
          <td>
            <input class="input" type="time" data-scheduled-start-input value="${esc(scheduledStart)}" />
          </td>
          <td>
            <button class="button soft sm" type="button" data-save-mapping-id="${esc(id)}">Save</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderUnmatchedList(): string {
  if (!cachedUnmatched.length) {
    return '<li class="muted">None — every active QuickBooks Time user is mapped.</li>';
  }
  return cachedUnmatched
    .map((u) => `<li>${esc(u.name)} <span class="muted">(QBT user #${esc(u.qbtUserId)})</span></li>`)
    .join('');
}

function render(): void {
  const body = document.getElementById('qbtAttendanceMappingBody');
  const unmatchedList = document.getElementById('qbtAttendanceMappingUnmatched');
  if (body) body.innerHTML = renderEmployeeRows();
  if (unmatchedList) unmatchedList.innerHTML = renderUnmatchedList();
}

async function refresh(): Promise<void> {
  const status = document.getElementById('qbtAttendanceMappingStatus');
  if (status) status.textContent = 'Loading QuickBooks Time users…';

  try {
    const result = await syncAttendanceFromQuickBooksTime({ preview: true });
    cachedQbtUsers = [
      ...result.matched.map((m) => ({ qbtUserId: m.qbtUserId, name: m.name })),
      ...result.unmatched.map((u) => ({ qbtUserId: u.qbtUserId, name: u.name })),
    ];
    cachedUnmatched = result.unmatched;
    render();
    if (status) status.textContent = `Loaded ${cachedQbtUsers.length} QuickBooks Time users.`;
  } catch (err) {
    const message =
      err instanceof AttendanceLiveSyncError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Could not load QuickBooks Time users.';
    if (status) status.textContent = message;
    toast(message, 'error');
  }
}

async function saveMapping(employeeId: string, row: HTMLElement): Promise<void> {
  const qbtSelect = row.querySelector<HTMLSelectElement>('[data-qbt-user-select]');
  const startInput = row.querySelector<HTMLInputElement>('[data-scheduled-start-input]');
  const saveBtn = row.querySelector<HTMLButtonElement>('[data-save-mapping-id]');
  if (!employeeId) return;

  const qbtUserId = qbtSelect?.value.trim() || null;
  const scheduledStartTime = startInput?.value.trim() || null;

  if (saveBtn) saveBtn.disabled = true;
  try {
    const { error } = await supabaseClient
      .from('employees')
      .update({
        qbt_user_id: qbtUserId,
        scheduled_start_time: scheduledStartTime ? `${scheduledStartTime}:00` : null,
      })
      .eq('id', employeeId);

    if (error) {
      const message =
        error.code === '23505'
          ? 'That QuickBooks Time user is already mapped to a different employee.'
          : error.message || 'Could not save mapping.';
      toast(message, 'error');
      return;
    }

    toast('Mapping saved.');
    if (typeof window.loadEmployees === 'function') {
      await window.loadEmployees();
    }
    await refresh();
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function buildCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = CARD_ID;
  card.innerHTML = `
    <div class="card-header">QuickBooks Time attendance mapping</div>
    <div class="card-body">
      <p class="muted" style="margin: 0 0 12px">
        Map each employee to their QuickBooks Time user id (never by name) and set their
        scheduled start time, used by the live attendance sync to decide when a missed punch
        counts as absent.
      </p>
      <div class="stay-org-themes-toolbar">
        <button class="button soft" id="qbtAttendanceMappingRefreshBtn" type="button">Refresh</button>
      </div>
      <p class="muted" id="qbtAttendanceMappingStatus" style="margin: 10px 0"></p>
      <div class="table-wrap"><table>
        <thead><tr><th>Employee</th><th>QuickBooks Time user</th><th>Scheduled start (ET)</th><th></th></tr></thead>
        <tbody id="qbtAttendanceMappingBody"><tr><td colspan="4" class="empty">Loading…</td></tr></tbody>
      </table></div>
      <details style="margin-top: 12px">
        <summary><strong>Unmatched QuickBooks Time users</strong></summary>
        <ul id="qbtAttendanceMappingUnmatched"></ul>
      </details>
    </div>`;

  card.querySelector('#qbtAttendanceMappingRefreshBtn')?.addEventListener('click', () => void refresh());
  card.querySelector('#qbtAttendanceMappingBody')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>('[data-save-mapping-id]');
    if (!button) return;
    const row = button.closest<HTMLElement>('[data-qbt-mapping-row]');
    if (!row) return;
    void saveMapping(button.dataset.saveMappingId || '', row);
  });

  return card;
}

/** Insert the card into Settings (admins only). Safe to call repeatedly. */
export function mountQbtAttendanceMappingCard(): void {
  const content = document.getElementById('settingsAdminContent');
  if (!content) return;

  const existing = document.getElementById(CARD_ID);
  if (!isAdminUser()) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const card = buildCard();
  content.appendChild(card);
  void refresh();
}

function init(): void {
  mountQbtAttendanceMappingCard();
  const section = document.getElementById('orbisSectionSettings');
  if (section) {
    new MutationObserver(() => mountQbtAttendanceMappingCard()).observe(section, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
