import { supabaseClient } from '../services/supabaseClient';
import { isAdminUser, type UserAccessRow } from '../services/access';
import { showOrbisConfirm } from '../ui/confirmModal';

const USER_ACCESS_ROLES = ['admin', 'supervisor', 'user'] as const;

let cachedUserAccessRows: UserAccessRow[] = [];
let editingUserEmail: string | null = null;
let isAddingUserAccess = false;

type AuditLogRow = {
  id?: string;
  employee_id?: string;
  employee_name?: string;
  action_type?: string;
  fields_changed?: unknown;
  changed_by?: string;
  changed_at?: string;
  metadata?: { details?: string; action_type?: string } | null;
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escAttr(value: unknown): string {
  return esc(value).replaceAll("'", '&#39;');
}

function normalizeUserEmail(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeUserRole(value: string): string {
  const role = String(value || 'user').trim().toLowerCase();

  return USER_ACCESS_ROLES.includes(role as (typeof USER_ACCESS_ROLES)[number]) ? role : 'user';
}

function readRowFromForm(root: ParentNode, originalEmail: string): UserAccessRow | null {
  const emailInput = root.querySelector<HTMLInputElement>('[data-field="email"]');
  const displayInput = root.querySelector<HTMLInputElement>('[data-field="display_name"]');
  const roleSelect = root.querySelector<HTMLSelectElement>('[data-field="role"]');
  const supervisorInput = root.querySelector<HTMLInputElement>('[data-field="supervisor_name"]');
  const canDeleteInput = root.querySelector<HTMLInputElement>('[data-field="can_delete"]');

  const email = normalizeUserEmail(emailInput?.value || originalEmail);

  if (!email) {
    showToast('Email is required.', 'error');
    return null;
  }

  return {
    email,
    display_name: String(displayInput?.value || '').trim(),
    role: normalizeUserRole(roleSelect?.value || 'user'),
    supervisor_name: String(supervisorInput?.value || '').trim(),
    can_delete: Boolean(canDeleteInput?.checked),
  };
}

function renderRoleOptions(selected: string): string {
  const role = normalizeUserRole(selected);

  return USER_ACCESS_ROLES.map(
    (option) =>
      `<option value="${option}"${option === role ? ' selected' : ''}>${option.toUpperCase()}</option>`
  ).join('');
}

function renderUserAccessViewRow(row: UserAccessRow): string {
  const email = normalizeUserEmail(String(row.email || ''));

  return `
    <tr data-user-email="${escAttr(email)}">
      <td>${esc(email || '—')}</td>
      <td>${esc(row.display_name || '—')}</td>
      <td>${esc(String(row.role || 'user').toUpperCase())}</td>
      <td>${esc(row.supervisor_name || '—')}</td>
      <td>${row.can_delete ? 'Yes' : 'No'}</td>
      <td>
        <div class="settings-user-actions table-actions">
          <button class="button soft sm" type="button" data-action="edit-user" data-email="${escAttr(email)}">Edit</button>
          <button class="button danger sm" type="button" data-action="delete-user" data-email="${escAttr(email)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function renderUserAccessEditRow(row: UserAccessRow, isNew: boolean): string {
  const email = normalizeUserEmail(String(row.email || ''));

  return `
    <tr class="settings-user-edit-row" data-user-email="${escAttr(email)}" data-editing="true">
      <td>
        <input
          class="settings-inline-input"
          type="email"
          data-field="email"
          value="${escAttr(email)}"
          ${isNew ? '' : 'readonly'}
          placeholder="user@company.com"
        />
      </td>
      <td>
        <input
          class="settings-inline-input"
          type="text"
          data-field="display_name"
          value="${escAttr(row.display_name || '')}"
          placeholder="Display name"
        />
      </td>
      <td>
        <select class="settings-inline-select" data-field="role">
          ${renderRoleOptions(String(row.role || 'user'))}
        </select>
      </td>
      <td>
        <input
          class="settings-inline-input"
          type="text"
          data-field="supervisor_name"
          value="${escAttr(row.supervisor_name || '')}"
          placeholder="Supervisor name"
        />
      </td>
      <td>
        <label class="settings-delete-check">
          <input type="checkbox" data-field="can_delete"${row.can_delete ? ' checked' : ''} />
          Allow delete
        </label>
      </td>
      <td>
        <div class="settings-user-actions table-actions">
          <button class="button primary sm" type="button" data-action="save-user" data-email="${escAttr(email)}" data-is-new="${isNew ? '1' : '0'}">Save</button>
          <button class="button soft sm" type="button" data-action="cancel-user">Cancel</button>
        </div>
      </td>
    </tr>
  `;
}

function renderUserAccessTableBody(): void {
  const body = document.getElementById('settingsUserAccessBody');
  const countEl = document.getElementById('settingsUserAccessCount');

  if (!body) return;

  if (countEl) {
    countEl.textContent = `${cachedUserAccessRows.length} user${cachedUserAccessRows.length === 1 ? '' : 's'}`;
  }

  const parts: string[] = [];

  if (isAddingUserAccess) {
    parts.push(
      renderUserAccessEditRow(
        {
          email: '',
          display_name: '',
          role: 'user',
          supervisor_name: '',
          can_delete: false,
        },
        true
      )
    );
  }

  cachedUserAccessRows.forEach((row) => {
    const email = normalizeUserEmail(String(row.email || ''));

    if (editingUserEmail && editingUserEmail === email) {
      parts.push(renderUserAccessEditRow(row, false));
      return;
    }

    parts.push(renderUserAccessViewRow(row));
  });

  if (!parts.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty">No user access rows found. Use Add user to grant access.</td></tr>';
    return;
  }

  body.innerHTML = parts.join('');
}

async function saveUserAccessRow(originalEmail: string, isNew: boolean): Promise<void> {
  const body = document.getElementById('settingsUserAccessBody');
  const editRow = body?.querySelector('tr[data-editing="true"]');

  if (!editRow) {
    showToast('Could not find the user form row.', 'error');
    return;
  }

  const payload = readRowFromForm(editRow, originalEmail);

  if (!payload?.email) {
    return;
  }

  if (isNew) {
    const exists = cachedUserAccessRows.some(
      (row) => normalizeUserEmail(String(row.email || '')) === payload.email
    );

    if (exists) {
      showToast('A user with that email already exists.', 'error');
      return;
    }

    const { error } = await supabaseClient.from('user_access').insert(payload);

    if (error) {
      console.error('[Settings] user_access insert failed:', error);
      showToast(error.message || 'Could not add user access.', 'error');
      return;
    }

    showToast('User access added.');
  } else {
    const { error } = await supabaseClient
      .from('user_access')
      .update({
        display_name: payload.display_name,
        role: payload.role,
        supervisor_name: payload.supervisor_name,
        can_delete: payload.can_delete,
      })
      .eq('email', normalizeUserEmail(originalEmail));

    if (error) {
      console.error('[Settings] user_access update failed:', error);
      showToast(error.message || 'Could not update user access.', 'error');
      return;
    }

    showToast('User access updated.');
  }

  editingUserEmail = null;
  isAddingUserAccess = false;
  await loadUserAccessTable();
}

async function deleteUserAccessRow(email: string): Promise<void> {
  const normalized = normalizeUserEmail(email);

  if (!normalized) return;

  const confirmed = await showOrbisConfirm(`Remove access for ${normalized}?`, {
    title: 'Delete user access',
    confirmLabel: 'Delete',
    danger: true,
  });

  if (!confirmed) return;

  const { error } = await supabaseClient.from('user_access').delete().eq('email', normalized);

  if (error) {
    console.error('[Settings] user_access delete failed:', error);
    showToast(error.message || 'Could not delete user access.', 'error');
    return;
  }

  showToast('User access removed.');
  editingUserEmail = null;
  isAddingUserAccess = false;
  await loadUserAccessTable();
}

function handleUserAccessTableClick(event: Event): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');

  if (!target) return;

  const action = target.getAttribute('data-action');

  if (action === 'edit-user') {
    editingUserEmail = normalizeUserEmail(target.getAttribute('data-email') || '');
    isAddingUserAccess = false;
    renderUserAccessTableBody();
    return;
  }

  if (action === 'cancel-user') {
    editingUserEmail = null;
    isAddingUserAccess = false;
    renderUserAccessTableBody();
    return;
  }

  if (action === 'save-user') {
    const originalEmail = target.getAttribute('data-email') || '';
    const isNew = target.getAttribute('data-is-new') === '1';
    void saveUserAccessRow(originalEmail, isNew);
    return;
  }

  if (action === 'delete-user') {
    void deleteUserAccessRow(target.getAttribute('data-email') || '');
  }
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function formatFieldsChanged(value: unknown, metadata?: AuditLogRow['metadata']): string {
  const details = String(metadata?.details || '').trim();

  if (details) {
    return details;
  }

  if (!value) {
    return '—';
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }

        if (item && typeof item === 'object') {
          const record = item as { summary?: string; field?: string };

          if (record.summary) {
            return String(record.summary).trim();
          }

          if (record.field) {
            return String(record.field).trim();
          }
        }

        return '';
      })
      .filter(Boolean);

    return parts.length ? parts.join('; ') : '—';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatActionLabel(actionType: string, metadata?: AuditLogRow['metadata']): string {
  const raw = String(actionType || metadata?.action_type || 'update').trim();

  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value: string): string {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

async function loadUserAccessTable(): Promise<void> {
  const body = document.getElementById('settingsUserAccessBody');
  const countEl = document.getElementById('settingsUserAccessCount');

  if (!body) return;

  body.innerHTML =
    '<tr><td colspan="6" class="empty">Loading user access...</td></tr>';

  const { data, error } = await supabaseClient
    .from('user_access')
    .select('email, display_name, role, supervisor_name, can_delete')
    .order('role', { ascending: true })
    .order('email', { ascending: true });

  if (error) {
    console.error('[Settings] user_access load failed:', error);
    body.innerHTML =
      '<tr><td colspan="6" class="empty">Could not load user access records.</td></tr>';
    if (countEl) countEl.textContent = 'Load failed';
    return;
  }

  cachedUserAccessRows = (data || []) as UserAccessRow[];
  renderUserAccessTableBody();
}

async function loadRecentAuditLogs(): Promise<void> {
  const body = document.getElementById('settingsAuditLogBody');
  const countEl = document.getElementById('settingsAuditLogCount');

  if (!body) return;

  body.innerHTML =
    '<tr><td colspan="5" class="empty">Loading audit log...</td></tr>';

  const { data, error } = await supabaseClient
    .from('employee_audit_logs')
    .select(
      'employee_id, employee_name, action_type, fields_changed, changed_by, changed_at, metadata'
    )
    .order('changed_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Settings] audit log load failed:', error);
    body.innerHTML =
      '<tr><td colspan="5" class="empty">Could not load audit log entries.</td></tr>';
    if (countEl) countEl.textContent = 'Load failed';
    return;
  }

  const rows = (data || []) as AuditLogRow[];

  if (countEl) {
    countEl.textContent = `Showing ${rows.length} recent`;
  }

  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="5" class="empty">No audit log entries found.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const employeeLabel =
        String(row.employee_name || '').trim() ||
        String(row.employee_id || '').trim() ||
        '—';

      return `
      <tr>
        <td>${esc(employeeLabel)}</td>
        <td>${esc(formatActionLabel(String(row.action_type || ''), row.metadata))}</td>
        <td>${esc(formatFieldsChanged(row.fields_changed, row.metadata))}</td>
        <td>${esc(row.changed_by || '—')}</td>
        <td>${esc(formatTimestamp(String(row.changed_at || '')))}</td>
      </tr>
    `;
    })
    .join('');
}

function renderSettingsAccessGate(): void {
  const gate = document.getElementById('settingsAdminGate');
  const content = document.getElementById('settingsAdminContent');

  if (!gate || !content) return;

  if (isAdminUser()) {
    gate.classList.add('hidden');
    content.classList.remove('hidden');
    return;
  }

  gate.classList.remove('hidden');
  content.classList.add('hidden');
}

export async function loadSettingsAdmin(force = false): Promise<void> {
  renderSettingsAccessGate();

  if (!isAdminUser()) {
    return;
  }

  if (!force && (window as { __settingsAdminLoaded?: boolean }).__settingsAdminLoaded) {
    return;
  }

  await Promise.all([loadUserAccessTable(), loadRecentAuditLogs()]);
  (window as { __settingsAdminLoaded?: boolean }).__settingsAdminLoaded = true;
}

function bindSettingsEvents(): void {
  if ((window as { __settingsEventsBound?: boolean }).__settingsEventsBound) {
    return;
  }

  (window as { __settingsEventsBound?: boolean }).__settingsEventsBound = true;

  document.getElementById('settingsRefreshBtn')?.addEventListener('click', () => {
    editingUserEmail = null;
    isAddingUserAccess = false;
    void loadSettingsAdmin(true);
  });

  document.getElementById('settingsAddUserBtn')?.addEventListener('click', () => {
    editingUserEmail = null;
    isAddingUserAccess = true;
    renderUserAccessTableBody();
  });

  document
    .getElementById('settingsUserAccessBody')
    ?.addEventListener('click', handleUserAccessTableClick);
}

bindSettingsEvents();

declare global {
  interface Window {
    loadSettingsAdmin?: (force?: boolean) => Promise<void>;
  }
}

window.loadSettingsAdmin = loadSettingsAdmin;
