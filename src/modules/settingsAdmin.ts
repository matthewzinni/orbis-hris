import { supabaseClient } from '../services/supabaseClient';
import {
  getUserRole,
  isAdminUser,
  parseSupervisedEmployeeIds,
  resolveDirectReportIdsForSupervisorName,
  resolveEmployeeRosterName,
  resolveLinkedEmployeeIdForEmail,
  resolveSupervisorScopeForEmployee,
  type UserAccessRow,
} from '../services/access';
import { showOrbisConfirm } from '../ui/confirmModal';

const USER_ACCESS_ROLES = ['admin', 'supervisor', 'user'] as const;

let cachedUserAccessRows: UserAccessRow[] = [];
let cachedPendingRows: UserAccessRow[] = [];
let editingUserEmail: string | null = null;
let isAddingUserAccess = false;
let isSavingUserAccess = false;

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

function parseScopedEmployeeIdsFromInput(raw: string): string[] | null {
  const parts = String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return parts.length ? parts : null;
}

function formatScopedIdsForInput(row: UserAccessRow): string {
  return parseSupervisedEmployeeIds(row).join(', ');
}

function readRowFromForm(root: ParentNode, originalEmail: string): UserAccessRow | null {
  const emailInput = root.querySelector<HTMLInputElement>('[data-field="email"]');
  const displayInput = root.querySelector<HTMLInputElement>('[data-field="display_name"]');
  const roleSelect = root.querySelector<HTMLSelectElement>('[data-field="role"]');
  const supervisorInput = root.querySelector<HTMLInputElement>('[data-field="supervisor_name"]');
  const scopedIdsInput = root.querySelector<HTMLTextAreaElement>('[data-field="supervised_employee_ids"]');
  const canDeleteInput = root.querySelector<HTMLInputElement>('[data-field="can_delete"]');
  const linkedIdInput = root.querySelector<HTMLInputElement>('[data-field="linked_employee_id"]');

  const email = normalizeUserEmail(emailInput?.value || originalEmail);

  if (!email) {
    showToast('Email is required.', 'error');
    return null;
  }

  const role = normalizeUserRole(roleSelect?.value || 'user');

  return {
    email,
    display_name: String(displayInput?.value || '').trim(),
    role,
    supervisor_name: String(supervisorInput?.value || '').trim(),
    supervised_employee_ids: parseScopedEmployeeIdsFromInput(scopedIdsInput?.value || ''),
    linked_employee_id: String(linkedIdInput?.value || '').trim() || null,
    can_delete: Boolean(canDeleteInput?.checked),
    approval_status: 'approved',
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
      <td>${esc(String(row.approval_status || 'approved').toUpperCase())}</td>
      <td>${esc(row.linked_employee_id || '—')}</td>
      <td>${esc(row.supervisor_name || '—')}</td>
      <td class="muted" style="max-width: 240px; font-size: 0.85rem; word-break: break-all">${(() => {
        const ids = parseSupervisedEmployeeIds(row);
        if (!ids.length) return '—';
        const preview = ids.join(', ');
        return esc(preview.length > 120 ? `${preview.slice(0, 120)}…` : preview);
      })()}</td>
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

async function preparePendingApprovalRow(row: UserAccessRow): Promise<UserAccessRow> {
  const email = normalizeUserEmail(String(row.email || ''));
  const linkedEmployeeId =
    String(row.linked_employee_id || '').trim() ||
    (await resolveLinkedEmployeeIdForEmail(email)) ||
    null;

  let displayName = String(row.display_name || '').trim();
  if (linkedEmployeeId && !displayName) {
    displayName = await resolveEmployeeRosterName(linkedEmployeeId);
  }

  return {
    ...row,
    email,
    display_name: displayName,
    linked_employee_id: linkedEmployeeId,
    role: normalizeUserRole(String(row.role || 'user')),
  };
}

function bindPendingApprovalFormInteractions(row: UserAccessRow): void {
  const host = document.getElementById('settingsPendingApprovalForm');
  if (!host) return;

  const roleSelect = host.querySelector<HTMLSelectElement>('[data-field="role"]');
  if (!roleSelect) return;

  roleSelect.addEventListener('change', () => {
    void applyPendingApprovalRoleDefaults(roleSelect, row);
  });

  void applyPendingApprovalRoleDefaults(roleSelect, row);
}

async function applyPendingApprovalRoleDefaults(
  roleSelect: HTMLSelectElement,
  row: UserAccessRow
): Promise<void> {
  const host = document.getElementById('settingsPendingApprovalForm');
  if (!host) return;

  const role = normalizeUserRole(roleSelect.value || 'user');
  const linkedInput = host.querySelector<HTMLInputElement>('[data-field="linked_employee_id"]');
  const supervisorInput = host.querySelector<HTMLInputElement>('[data-field="supervisor_name"]');
  const teamInput = host.querySelector<HTMLTextAreaElement>('[data-field="supervised_employee_ids"]');
  const userFields = host.querySelector<HTMLDivElement>('[data-user-only-fields]');
  const supervisorFields = host.querySelector<HTMLDivElement>('[data-supervisor-only-fields]');

  userFields?.classList.toggle('hidden', role !== 'user');
  supervisorFields?.classList.toggle('hidden', role !== 'supervisor');

  const linkedId =
    String(linkedInput?.value || row.linked_employee_id || '').trim() ||
    (await resolveLinkedEmployeeIdForEmail(normalizeUserEmail(String(row.email || '')))) ||
    '';

  if (role === 'user' && linkedInput && linkedId) {
    linkedInput.value = linkedId;
  }

  if (role !== 'supervisor') {
    return;
  }

  const rosterName =
    (linkedId ? await resolveEmployeeRosterName(linkedId) : '') ||
    String(row.display_name || '').trim();
  const scope = linkedId
    ? await resolveSupervisorScopeForEmployee(linkedId)
    : {
        supervisor_name: rosterName,
        supervised_employee_ids: await resolveDirectReportIdsForSupervisorName(rosterName),
      };

  if (supervisorInput && scope.supervisor_name) {
    supervisorInput.value = scope.supervisor_name;
  }

  if (teamInput && scope.supervised_employee_ids.length) {
    teamInput.value = scope.supervised_employee_ids.join(', ');
  }
}

function clearPendingApprovalForm(): void {
  const host = document.getElementById('settingsPendingApprovalForm');
  if (!host) return;

  host.classList.add('hidden');
  host.setAttribute('hidden', '');
  host.innerHTML = '';
  host.removeAttribute('data-user-email');
  host.removeAttribute('data-editing');
}

function renderPendingApprovalForm(row: UserAccessRow): void {
  const host = document.getElementById('settingsPendingApprovalForm');
  if (!host) return;

  const email = normalizeUserEmail(String(row.email || ''));
  const role = normalizeUserRole(String(row.role || 'user'));
  const rosterHint = row.linked_employee_id
    ? `Matched roster id <strong>${esc(String(row.linked_employee_id))}</strong> from signup email.`
    : 'No roster match yet — signup email must match their personal or work email on file.';

  host.classList.remove('hidden');
  host.removeAttribute('hidden');
  host.setAttribute('data-editing', 'true');
  host.setAttribute('data-user-email', email);
  host.innerHTML = `
    <p class="settings-pending-approval-form-title">Approve account: ${esc(email)}</p>
    <p class="muted" style="margin: 0 0 14px; font-size: 0.88rem">${rosterHint}</p>
    <div class="settings-form-grid">
      <div class="field">
        <label>Email</label>
        <input type="email" data-field="email" value="${escAttr(email)}" readonly />
      </div>
      <div class="field">
        <label>Display name</label>
        <input
          type="text"
          data-field="display_name"
          value="${escAttr(row.display_name || '')}"
          placeholder="Display name"
        />
      </div>
      <div class="field">
        <label>Access level</label>
        <select data-field="role">${renderRoleOptions(role)}</select>
        <p class="muted" style="margin: 6px 0 0; font-size: 0.82rem">
          <strong>user</strong> = My Profile + Tasks &amp; Acknowledgments + Directory + My Time Off ·
          <strong>supervisor</strong> = direct reports ·
          <strong>admin</strong> = full HRIS
        </p>
      </div>
      <div class="field${role === 'user' ? '' : ' hidden'}" data-user-only-fields>
        <label>Linked employee (PTO)</label>
        <input
          type="text"
          data-field="linked_employee_id"
          value="${escAttr(row.linked_employee_id || '')}"
          placeholder="e.g. BTW2105 for Ryan Bird"
          readonly
        />
        <p class="muted" style="margin: 6px 0 0; font-size: 0.82rem">
          User sees only this person&apos;s PTO and time-off requests.
        </p>
      </div>
      <div class="settings-form-grid${role === 'supervisor' ? '' : ' hidden'}" data-supervisor-only-fields style="grid-column: 1 / -1"
      >
        <div class="field">
          <label>Supervisor name (roster match)</label>
          <input
            type="text"
            data-field="supervisor_name"
            value="${escAttr(row.supervisor_name || '')}"
            placeholder="e.g. Kyle Hodges"
          />
        </div>
        <div class="field" style="grid-column: 1 / -1">
          <label>Direct report employee IDs</label>
          <textarea
            data-field="supervised_employee_ids"
            rows="2"
            placeholder="Auto-filled from roster supervisor field, e.g. BTW2105"
          >${escAttr(formatScopedIdsForInput(row))}</textarea>
        </div>
      </div>
      <div class="field">
        <label class="settings-delete-check">
          <input type="checkbox" data-field="can_delete"${row.can_delete ? ' checked' : ''} />
          Allow delete
        </label>
      </div>
    </div>
    <div class="settings-form-actions settings-user-actions">
      <button class="button primary" type="button" data-action="save-user" data-email="${escAttr(email)}" data-is-new="0">Save approval</button>
      <button class="button soft" type="button" data-action="cancel-user">Cancel</button>
    </div>
  `;

  bindPendingApprovalFormInteractions(row);

  const focusTarget = host.querySelector<HTMLElement>('[data-field="role"]');
  focusTarget?.focus();
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
      <td class="muted">APPROVED</td>
      <td>
        <input
          class="settings-inline-input"
          type="text"
          data-field="linked_employee_id"
          value="${escAttr(row.linked_employee_id || '')}"
          placeholder="BTW id for USER role (e.g. BTW2105)"
        />
      </td>
      <td>
        <input
          class="settings-inline-input"
          type="text"
          data-field="supervisor_name"
          value="${escAttr(row.supervisor_name || '')}"
          placeholder="Supervisor name (fuzzy match)"
        />
      </td>
      <td>
        <textarea
          class="settings-inline-input"
          data-field="supervised_employee_ids"
          rows="2"
          style="min-width: 200px; resize: vertical"
          placeholder="Team employee IDs, comma-separated"
        >${escAttr(formatScopedIdsForInput(row))}</textarea>
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

  const approvedRows = cachedUserAccessRows.filter(
    (row) => String(row.approval_status || 'approved').toLowerCase() !== 'pending'
  );

  if (countEl) {
    countEl.textContent = `${approvedRows.length} approved`;
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
          supervised_employee_ids: null,
          linked_employee_id: null,
          can_delete: false,
          approval_status: 'approved',
        },
        true
      )
    );
  }

  approvedRows.forEach((row) => {
    const email = normalizeUserEmail(String(row.email || ''));

    if (editingUserEmail && editingUserEmail === email) {
      parts.push(renderUserAccessEditRow(row, false));
      return;
    }

    parts.push(renderUserAccessViewRow(row));
  });

  if (!parts.length) {
    body.innerHTML =
      '<tr><td colspan="9" class="empty">No approved users yet. Use Add user or approve pending requests.</td></tr>';
    return;
  }

  body.innerHTML = parts.join('');
}

function renderPendingApprovalsBody(): void {
  const body = document.getElementById('settingsPendingApprovalsBody');
  const countEl = document.getElementById('settingsPendingApprovalsCount');

  if (!body) return;

  if (countEl) {
    countEl.textContent = `${cachedPendingRows.length} pending`;
  }

  const visiblePending = cachedPendingRows.filter((row) => {
    const email = normalizeUserEmail(String(row.email || ''));
    return !editingUserEmail || editingUserEmail !== email;
  });

  if (!visiblePending.length) {
    body.innerHTML = editingUserEmail
      ? '<tr><td colspan="4" class="empty">Finish approval in the form below.</td></tr>'
      : '<tr><td colspan="4" class="empty">No pending account requests.</td></tr>';
    return;
  }

  body.innerHTML = visiblePending
    .map((row) => {
      const email = normalizeUserEmail(String(row.email || ''));
      return `
        <tr data-pending-email="${escAttr(email)}">
          <td>${esc(email)}</td>
          <td>${esc(row.display_name || '—')}</td>
          <td>${esc(row.linked_employee_id || '—')}</td>
          <td>
            <div class="settings-user-actions table-actions">
              <button class="button primary sm" type="button" data-action="approve-pending" data-email="${escAttr(email)}">Review &amp; approve</button>
              <button class="button danger sm" type="button" data-action="reject-pending" data-email="${escAttr(email)}">Reject</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function employeeIdExists(employeeId: string): Promise<boolean> {
  const id = String(employeeId || '').trim();
  if (!id) return false;

  const { data, error } = await supabaseClient
    .from('employees')
    .select('id')
    .eq('id', id)
    .limit(1);

  if (error) {
    console.error('[Settings] employee lookup failed:', error);
    return false;
  }

  return Boolean(data?.length);
}

async function saveUserAccessRow(
  originalEmail: string,
  isNew: boolean,
  editRow: ParentNode
): Promise<void> {
  if (isSavingUserAccess) return;

  if (!isAdminUser()) {
    showToast('Admin access is required to manage user access.', 'error');
    return;
  }

  const payload = readRowFromForm(editRow, originalEmail);

  if (!payload?.email) {
    return;
  }

  if (payload.role === 'user' && !payload.linked_employee_id) {
    payload.linked_employee_id = await resolveLinkedEmployeeIdForEmail(payload.email);
  }

  if (payload.role === 'user') {
    if (!payload.linked_employee_id) {
      showToast(
        'User role requires a PTO employee ID that matches someone on the Employees roster. ' +
          'Add them under Employees first, or pick an existing BTW id.',
        'error'
      );
      return;
    }

    const rosterMatch = await employeeIdExists(payload.linked_employee_id);
    if (!rosterMatch) {
      showToast(
        `${payload.linked_employee_id} is not on the Employees roster. ` +
          'Confirm the signup email matches their personal/work email on file, or add them to Employees first.',
        'error'
      );
      return;
    }
  }

  if (payload.role === 'supervisor') {
    if (!String(payload.supervisor_name || '').trim() && !parseSupervisedEmployeeIds(payload).length) {
      showToast(
        'Supervisor role needs a supervisor name or direct-report employee IDs from the roster.',
        'error'
      );
      return;
    }
  }

  const lookupEmail = normalizeUserEmail(isNew ? payload.email : originalEmail || payload.email);

  if (!lookupEmail) {
    showToast('Email is required.', 'error');
    return;
  }

  isSavingUserAccess = true;

  try {
    if (isNew) {
      const exists = cachedUserAccessRows.some(
        (row) => normalizeUserEmail(String(row.email || '')) === payload.email
      );

      if (exists) {
        showToast('A user with that email already exists.', 'error');
        return;
      }

      const { data, error } = await supabaseClient
        .from('user_access')
        .insert(payload)
        .select('email')
        .maybeSingle();

      if (error) {
        console.error('[Settings] user_access insert failed:', error);
        showToast(error.message || 'Could not add user access.', 'error');
        return;
      }

      if (!data?.email) {
        showToast('User access was not created. Check database permissions (admin RLS).', 'error');
        return;
      }

      showToast('User access added.');
    } else {
      const { data, error } = await supabaseClient
        .from('user_access')
        .update({
          display_name: payload.display_name,
          role: payload.role,
          supervisor_name: payload.supervisor_name,
          supervised_employee_ids: payload.supervised_employee_ids,
          linked_employee_id: payload.linked_employee_id,
          can_delete: payload.can_delete,
          approval_status: 'approved',
        })
        .eq('email', lookupEmail)
        .select('email');

      if (error) {
        console.error('[Settings] user_access update failed:', error);
        showToast(error.message || 'Could not update user access.', 'error');
        return;
      }

      if (!data?.length) {
        showToast(
          'No user was updated. The email may not exist, or you may lack admin write permission.',
          'error'
        );
        return;
      }

      showToast('User access updated.');
    }

    editingUserEmail = null;
    isAddingUserAccess = false;
    clearPendingApprovalForm();
    await loadUserAccessTable();
    await getUserRole();
  } finally {
    isSavingUserAccess = false;
  }
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

function focusUserAccessEditRow(row: ParentNode | null): void {
  if (!row) return;

  const focusTarget =
    row.querySelector<HTMLElement>('[data-field="display_name"]') ||
    row.querySelector<HTMLElement>('[data-field="email"]') ||
    row.querySelector<HTMLElement>('input, select');

  focusTarget?.focus();
}

function handleUserAccessTableClick(event: Event): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');

  if (!target) return;

  if (
    !target.closest('#settingsUserAccessBody') &&
    !target.closest('#settingsPendingApprovalsBody') &&
    !target.closest('#settingsPendingApprovalForm')
  ) {
    return;
  }

  const action = target.getAttribute('data-action');

  event.preventDefault();
  event.stopPropagation();

  if (action === 'edit-user') {
    if (!isAdminUser()) {
      showToast('Admin access is required to edit users.', 'error');
      return;
    }

    editingUserEmail = normalizeUserEmail(target.getAttribute('data-email') || '');
    isAddingUserAccess = false;
    renderUserAccessTableBody();

    const editRow = document
      .getElementById('settingsUserAccessBody')
      ?.querySelector('tr[data-editing="true"]');

    focusUserAccessEditRow(editRow);
    return;
  }

  if (action === 'cancel-user') {
    editingUserEmail = null;
    isAddingUserAccess = false;
    clearPendingApprovalForm();
    renderUserAccessTableBody();
    renderPendingApprovalsBody();
    return;
  }

  if (action === 'save-user') {
    const editRow =
      target.closest('tr[data-editing="true"]') ||
      document.getElementById('settingsPendingApprovalForm');

    if (!editRow || editRow.classList.contains('hidden')) {
      showToast('Could not find the user form row.', 'error');
      return;
    }

    const originalEmail =
      target.getAttribute('data-email') ||
      editRow.getAttribute('data-user-email') ||
      '';
    const isNew = target.getAttribute('data-is-new') === '1';
    void saveUserAccessRow(originalEmail, isNew, editRow);
    return;
  }

  if (action === 'delete-user') {
    void deleteUserAccessRow(target.getAttribute('data-email') || '');
    return;
  }

  if (action === 'approve-pending') {
    if (!isAdminUser()) {
      showToast('Admin access is required.', 'error');
      return;
    }

    const email = normalizeUserEmail(target.getAttribute('data-email') || '');
    const row = cachedPendingRows.find(
      (item) => normalizeUserEmail(String(item.email || '')) === email
    );

    if (!row) {
      showToast('Pending request not found.', 'error');
      return;
    }

    editingUserEmail = email;
    isAddingUserAccess = false;
    void preparePendingApprovalRow(row).then((prepared) => {
      renderPendingApprovalForm(prepared);
      renderPendingApprovalsBody();
      document
        .getElementById('settingsPendingApprovalForm')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return;
  }

  if (action === 'reject-pending') {
    void rejectPendingAccount(target.getAttribute('data-email') || '');
  }
}

async function rejectPendingAccount(email: string): Promise<void> {
  const normalized = normalizeUserEmail(email);
  if (!normalized) return;

  const confirmed = await showOrbisConfirm(`Reject account request for ${normalized}?`, {
    title: 'Reject account',
    confirmLabel: 'Reject',
    danger: true,
  });

  if (!confirmed) return;

  const { error } = await supabaseClient
    .from('user_access')
    .update({ approval_status: 'rejected' })
    .eq('email', normalized);

  if (error) {
    showToast(error.message || 'Could not reject request.', 'error');
    return;
  }

  showToast('Account request rejected.');
  editingUserEmail = null;
  await loadUserAccessTable();
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
    '<tr><td colspan="9" class="empty">Loading user access...</td></tr>';

  const pendingBody = document.getElementById('settingsPendingApprovalsBody');
  if (pendingBody) {
    pendingBody.innerHTML =
      '<tr><td colspan="4" class="empty">Loading pending requests...</td></tr>';
  }

  const { data, error } = await supabaseClient
    .from('user_access')
    .select(
      'email, display_name, role, supervisor_name, supervised_employee_ids, linked_employee_id, can_delete, approval_status'
    )
    .order('approval_status', { ascending: true })
    .order('role', { ascending: true })
    .order('email', { ascending: true });

  if (error) {
    console.error('[Settings] user_access load failed:', error);
    body.innerHTML =
      '<tr><td colspan="9" class="empty">Could not load user access records.</td></tr>';
    if (countEl) countEl.textContent = 'Load failed';
    if (pendingBody) {
      pendingBody.innerHTML =
        '<tr><td colspan="4" class="empty">Could not load pending requests.</td></tr>';
    }
    return;
  }

  cachedUserAccessRows = (data || []) as UserAccessRow[];
  cachedPendingRows = cachedUserAccessRows.filter(
    (row) => String(row.approval_status || '').toLowerCase() === 'pending'
  );
  renderUserAccessTableBody();
  renderPendingApprovalsBody();
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
  initSettingsAdminModule();
  renderSettingsAccessGate();

  if (!isAdminUser()) {
    return;
  }

  if (!force && (window as { __settingsAdminLoaded?: boolean }).__settingsAdminLoaded) {
    return;
  }

  await Promise.all([loadUserAccessTable(), loadRecentAuditLogs()]);
  (window as { __settingsAdminLoaded?: boolean }).__settingsAdminLoaded = true;
  window.renderMobileSettingsNav?.();
}

function bindSettingsEvents(): void {
  const root = document.getElementById('settingsAdminContent');

  if (!root) {
    return;
  }

  if (!(root as { __settingsEventsBound?: boolean }).__settingsEventsBound) {
    (root as { __settingsEventsBound?: boolean }).__settingsEventsBound = true;

    root.addEventListener('click', handleUserAccessTableClick);

    document.getElementById('settingsRefreshBtn')?.addEventListener('click', () => {
      editingUserEmail = null;
      isAddingUserAccess = false;
      void loadSettingsAdmin(true);
    });

    document.getElementById('settingsAddUserBtn')?.addEventListener('click', () => {
      if (!isAdminUser()) {
        showToast('Admin access is required to add users.', 'error');
        return;
      }

      editingUserEmail = null;
      isAddingUserAccess = true;
      renderUserAccessTableBody();

      const editRow = document
        .getElementById('settingsUserAccessBody')
        ?.querySelector('tr[data-editing="true"]');

      focusUserAccessEditRow(editRow);
    });
  }
}

function initSettingsAdminModule(): void {
  bindSettingsEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsAdminModule);
} else {
  initSettingsAdminModule();
}

declare global {
  interface Window {
    loadSettingsAdmin?: (force?: boolean) => Promise<void>;
  }
}

window.loadSettingsAdmin = loadSettingsAdmin;
