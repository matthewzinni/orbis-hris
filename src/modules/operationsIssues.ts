import { supabaseClient } from '../services/supabaseClient';
import {
  canAccessOperationsCenter,
  canDeleteOperationsIssue,
  canViewOperationsIssue,
  getSupervisorDepartmentScope,
  resolveCurrentUserDisplayName,
  resolveCurrentUserEmail,
} from '../services/operationsAccess';
import {
  deleteOperationsIssueAttachment,
  loadOperationsIssueAttachments,
  renderOperationsIssueAttachments,
  uploadOperationsIssueAttachment,
} from '../services/operationsAttachments';
import { isAdminUser } from '../services/access';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  fetchAllOperationsIssues,
  loadOperationsDashboardMetrics,
} from '../ui/operationsDashboard';
import {
  loadOperationsIssueEvents,
  recordOperationsIssueEvent,
  renderOperationsIssueEvents,
} from './operationsIssueEvents';
import type { OperationsIssue } from '../types/operationsTypes';
import {
  formatOperationsLabel,
  normalizeOperationsStatus,
  OPERATIONS_CATEGORIES,
  OPERATIONS_IMPACT_LEVELS,
  OPERATIONS_PRIORITIES,
  OPERATIONS_STATUSES,
} from '../types/operationsTypes';

declare global {
  interface Window {
    loadOperationsIssues?: () => Promise<void>;
    ensureOperationsIssuesLoaded?: (force?: boolean) => void;
    exportOperationsIssuesCsv?: () => void;
    openOperationsView?: () => void;
    openNewOperationsIssueForm?: () => void;
    openOperationsIssueDrawer?: (issueId: string) => Promise<void>;
    closeOperationsIssueDrawer?: () => void;
    saveOperationsIssueRecord?: () => Promise<void>;
    deleteOperationsIssueRecord?: () => Promise<void>;
    deleteOperationsIssueById?: (issueId: string) => Promise<void>;
    cancelOperationsIssueEdit?: () => void;
    isOperationsIssueDrawerOpen?: () => boolean;
    closeActiveDrawer?: () => void;
    applyOperationsCenterAccess?: () => void;
  }
}

let currentOperationsIssueId: string | null = null;
let cachedOperationsIssues: OperationsIssue[] = [];
let assigneeOptionsCache: { email: string; name: string }[] = [];
let isOperationsSaveInProgress = false;
let operationsIssuesHydrated = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: string = 'success'): void {
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

function todayInputValue(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }
  return new Date().toISOString().slice(0, 10);
}

function applyDrawerOpenStyles(drawer: HTMLElement, backdrop: HTMLElement | null): void {
  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.classList.remove('hidden');
    backdrop.removeAttribute('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.setProperty('display', 'block', 'important');
    backdrop.style.setProperty('visibility', 'visible', 'important');
    backdrop.style.setProperty('opacity', '1', 'important');
    backdrop.style.setProperty('z-index', '99998', 'important');
  }

  drawer.classList.add('open');
  drawer.classList.remove('hidden');
  drawer.removeAttribute('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.style.setProperty('display', 'flex', 'important');
  drawer.style.setProperty('flex-direction', 'column', 'important');
  drawer.style.setProperty('visibility', 'visible', 'important');
  drawer.style.setProperty('opacity', '1', 'important');
  drawer.style.setProperty('pointer-events', 'auto', 'important');
  drawer.style.setProperty('position', 'fixed', 'important');
  drawer.style.setProperty('top', '0', 'important');
  drawer.style.setProperty('right', '0', 'important');
  drawer.style.setProperty('bottom', '0', 'important');
  drawer.style.setProperty('height', '100vh', 'important');
  drawer.style.setProperty('width', 'min(760px, 92vw)', 'important');
  drawer.style.setProperty('max-width', '92vw', 'important');
  drawer.style.setProperty('transform', 'translateX(0)', 'important');
  drawer.style.setProperty('z-index', '99999', 'important');
}

function getDepartmentOptions(): string[] {
  const source = isAdminUser()
    ? Array.isArray(window.ALL_EMPLOYEES)
      ? window.ALL_EMPLOYEES
      : window.EMPLOYEES
    : window.EMPLOYEES;

  const departments = new Set<string>();
  (Array.isArray(source) ? source : []).forEach((employee) => {
    const dept = String(
      (employee as Record<string, unknown>).department ||
        (employee as Record<string, unknown>).dept ||
        ''
    ).trim();
    if (dept) departments.add(dept);
  });

  getSupervisorDepartmentScope().forEach((dept) => {
    const match = [...departments].find((value) => value.toLowerCase() === dept);
    if (match) return;
  });

  return [...departments].sort((a, b) => a.localeCompare(b));
}

async function loadAssigneeOptions(): Promise<void> {
  if (assigneeOptionsCache.length) return;

  const { data, error } = await supabaseClient
    .from('user_access')
    .select('email, display_name, role')
    .in('role', ['admin', 'supervisor'])
    .order('display_name', { ascending: true });

  if (error) {
    console.warn('[Operations] Could not load assignee options:', error);
    return;
  }

  assigneeOptionsCache = (data || [])
    .map((row) => ({
      email: String((row as { email?: string }).email || '').trim().toLowerCase(),
      name: String((row as { display_name?: string }).display_name || '').trim(),
    }))
    .filter((row) => row.email);
}

function populateSelectOptions(
  selectId: string,
  values: string[],
  selectedValue?: string,
  labelFormatter?: (value: string) => string
): void {
  const select = safeGet<HTMLSelectElement>(selectId);
  if (!select) return;

  const current = String(selectedValue || select.value || '');
  select.innerHTML = values
    .map((value) => {
      const label = labelFormatter ? labelFormatter(value) : value;
      const selected = value === current ? ' selected' : '';
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
}

function populateDepartmentSelect(selectedValue?: string): void {
  const departments = getDepartmentOptions();
  const select = safeGet<HTMLSelectElement>('opsIssueDepartmentInput');
  if (!select) return;

  const current = String(selectedValue || select.value || '');
  select.innerHTML =
    '<option value="">Select department</option>' +
    departments
      .map((dept) => {
        const selected = dept === current ? ' selected' : '';
        return `<option value="${escapeHtml(dept)}"${selected}>${escapeHtml(dept)}</option>`;
      })
      .join('');
}

async function populateAssigneeSelect(selectedEmail?: string): Promise<void> {
  await loadAssigneeOptions();
  const select = safeGet<HTMLSelectElement>('opsIssueAssignedToInput');
  if (!select) return;

  const current = String(selectedEmail || select.value || '').toLowerCase();
  select.innerHTML =
    '<option value="">Unassigned</option>' +
    assigneeOptionsCache
      .map((row) => {
        const selected = row.email === current ? ' selected' : '';
        return `<option value="${escapeHtml(row.email)}" data-assignee-name="${escapeHtml(row.name)}"${selected}>${escapeHtml(row.name || row.email)}</option>`;
      })
      .join('');
}

function getDrawerValues(): Record<string, string | boolean> {
  const assignedSelect = safeGet<HTMLSelectElement>('opsIssueAssignedToInput');
  const assignedOption = assignedSelect?.selectedOptions?.[0];

  return {
    title: String(safeGet<HTMLInputElement>('opsIssueTitleInput')?.value || '').trim(),
    category: String(safeGet<HTMLSelectElement>('opsIssueCategoryInput')?.value || 'other').trim(),
    system_affected: String(safeGet<HTMLInputElement>('opsIssueSystemInput')?.value || '').trim(),
    description: String(safeGet<HTMLTextAreaElement>('opsIssueDescriptionInput')?.value || '').trim(),
    impact_level: String(safeGet<HTMLSelectElement>('opsIssueImpactInput')?.value || 'medium').trim(),
    priority: String(safeGet<HTMLSelectElement>('opsIssuePriorityInput')?.value || 'normal').trim(),
    status: normalizeOperationsStatus(safeGet<HTMLSelectElement>('opsIssueStatusInput')?.value || 'open'),
    is_recurring: Boolean(safeGet<HTMLInputElement>('opsIssueRecurringInput')?.checked),
    department: String(safeGet<HTMLSelectElement>('opsIssueDepartmentInput')?.value || '').trim(),
    assigned_to_email: String(assignedSelect?.value || '').trim().toLowerCase(),
    assigned_to_name: String(assignedOption?.dataset.assigneeName || '').trim(),
    due_date: String(safeGet<HTMLInputElement>('opsIssueDueDateInput')?.value || '').trim(),
    resolution_notes: String(safeGet<HTMLTextAreaElement>('opsIssueResolutionNotesInput')?.value || '').trim(),
    root_cause: String(safeGet<HTMLTextAreaElement>('opsIssueRootCauseInput')?.value || '').trim(),
  };
}

function getActiveFilters(): {
  search: string;
  status: string;
  category: string;
  department: string;
  priority: string;
} {
  return {
    search: String(safeGet<HTMLInputElement>('opsIssuesSearchInput')?.value || '')
      .trim()
      .toLowerCase(),
    status: String(safeGet<HTMLSelectElement>('opsIssuesStatusFilter')?.value || '').trim(),
    category: String(safeGet<HTMLSelectElement>('opsIssuesCategoryFilter')?.value || '').trim(),
    department: String(safeGet<HTMLSelectElement>('opsIssuesDepartmentFilter')?.value || '').trim(),
    priority: String(safeGet<HTMLSelectElement>('opsIssuesPriorityFilter')?.value || '').trim(),
  };
}

function filterIssues(issues: OperationsIssue[]): OperationsIssue[] {
  const filters = getActiveFilters();

  return issues.filter((issue) => {
    if (!canViewOperationsIssue(issue)) return false;

    if (filters.status && String(issue.status || '') !== filters.status) return false;
    if (filters.category && String(issue.category || '') !== filters.category) return false;
    if (
      filters.department &&
      String(issue.department || '').toLowerCase() !== filters.department.toLowerCase()
    ) {
      return false;
    }
    if (filters.priority && String(issue.priority || '') !== filters.priority) return false;

    if (!filters.search) return true;

    const haystack = [
      issue.title,
      issue.description,
      issue.system_affected,
      issue.department,
      issue.reported_by_name,
      issue.assigned_to_name,
      issue.status,
      issue.category,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return haystack.includes(filters.search);
  });
}

function renderStatusBadge(status: unknown): string {
  const value = normalizeOperationsStatus(status);
  const alertStatuses = ['open', 'investigating', 'waiting'];
  const warnStatuses = ['in_progress'];
  const cls = alertStatuses.includes(value)
    ? 'badge alert'
    : warnStatuses.includes(value)
      ? 'badge warn'
      : value === 'resolved'
        ? 'badge good'
        : 'badge';

  return `<span class="${cls}">${escapeHtml(formatOperationsLabel(value))}</span>`;
}

function renderPriorityBadge(priority: unknown): string {
  const value = String(priority || 'normal').toLowerCase();
  const cls =
    value === 'urgent' ? 'badge alert' : value === 'high' ? 'badge warn' : 'badge soft';
  return `<span class="${cls}">${escapeHtml(formatOperationsLabel(value))}</span>`;
}

function renderIssuesTable(issues: OperationsIssue[]): void {
  const tbody = safeGet<HTMLTableSectionElement>('operationsIssuesBody');
  const countEl = safeGet('operationsIssuesCount');

  if (!tbody) return;

  const filtered = filterIssues(issues);

  if (countEl) {
    countEl.textContent = `${filtered.length} issue${filtered.length === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty">No operational issues match the current filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered
    .map((issue) => {
      const created = issue.created_at
        ? new Date(String(issue.created_at)).toLocaleDateString()
        : '—';

      return `
        <tr data-operations-issue-id="${escapeHtml(issue.id || '')}">
          <td>
            <button class="link-button" type="button" data-edit-operations-issue-id="${escapeHtml(issue.id || '')}">
              ${escapeHtml(issue.title || 'Untitled Issue')}
            </button>
            ${issue.is_recurring ? '<span class="badge warn">Recurring</span>' : ''}
          </td>
          <td>${escapeHtml(formatOperationsLabel(String(issue.category || '')))}</td>
          <td>${escapeHtml(issue.department || '')}</td>
          <td>${renderPriorityBadge(issue.priority)}</td>
          <td>${renderStatusBadge(issue.status)}</td>
          <td>${escapeHtml(issue.assigned_to_name || issue.assigned_to_email || '—')}</td>
          <td>${escapeHtml(created)}</td>
          <td class="table-actions">
            <button class="button soft sm" type="button" data-edit-operations-issue-id="${escapeHtml(issue.id || '')}">
              Edit
            </button>
            ${
              canDeleteOperationsIssue()
                ? `<button class="button danger sm" type="button" data-delete-operations-issue-id="${escapeHtml(issue.id || '')}">Delete</button>`
                : ''
            }
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll<HTMLButtonElement>('[data-edit-operations-issue-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const issueId = button.dataset.editOperationsIssueId;
      if (issueId) void openOperationsIssueDrawer(issueId);
    });
  });

  tbody.querySelectorAll<HTMLButtonElement>('[data-delete-operations-issue-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const issueId = button.dataset.deleteOperationsIssueId;
      if (issueId) void deleteOperationsIssueById(issueId);
    });
  });
}

function populateFilterSelects(issues: OperationsIssue[]): void {
  const departments = [...new Set(issues.map((issue) => String(issue.department || '').trim()).filter(Boolean))].sort();
  const statusFilter = safeGet<HTMLSelectElement>('opsIssuesStatusFilter');
  const categoryFilter = safeGet<HTMLSelectElement>('opsIssuesCategoryFilter');
  const departmentFilter = safeGet<HTMLSelectElement>('opsIssuesDepartmentFilter');
  const priorityFilter = safeGet<HTMLSelectElement>('opsIssuesPriorityFilter');

  if (statusFilter && statusFilter.options.length <= 1) {
    statusFilter.innerHTML =
      '<option value="">All Statuses</option>' +
      OPERATIONS_STATUSES.map(
        (status) => `<option value="${status}">${escapeHtml(formatOperationsLabel(status))}</option>`
      ).join('');
  }

  if (categoryFilter && categoryFilter.options.length <= 1) {
    categoryFilter.innerHTML =
      '<option value="">All Categories</option>' +
      OPERATIONS_CATEGORIES.map(
        (category) =>
          `<option value="${category}">${escapeHtml(formatOperationsLabel(category))}</option>`
      ).join('');
  }

  if (priorityFilter && priorityFilter.options.length <= 1) {
    priorityFilter.innerHTML =
      '<option value="">All Priorities</option>' +
      OPERATIONS_PRIORITIES.map(
        (priority) =>
          `<option value="${priority}">${escapeHtml(formatOperationsLabel(priority))}</option>`
      ).join('');
  }

  if (departmentFilter) {
    const current = departmentFilter.value;
    departmentFilter.innerHTML =
      '<option value="">All Departments</option>' +
      departments
        .map(
          (dept) =>
            `<option value="${escapeHtml(dept)}"${dept === current ? ' selected' : ''}>${escapeHtml(dept)}</option>`
        )
        .join('');
  }
}

export function applyOperationsCenterAccess(): void {
  const canAccess = canAccessOperationsCenter();
  document.querySelectorAll('[data-operations-access]').forEach((element) => {
    (element as HTMLElement).classList.toggle('hidden', !canAccess);
  });

  const page = safeGet('operationsCenterTop');
  if (page && !canAccess) {
    page.classList.add('hidden');
  }
}

export async function loadOperationsIssues(): Promise<void> {
  const tbody = safeGet('operationsIssuesBody');

  if (!canAccessOperationsCenter()) {
    applyOperationsCenterAccess();
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="empty">Operations Center requires admin or supervisor access.</td></tr>';
    }
    return;
  }

  applyOperationsCenterAccess();

  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty">Loading operational issues...</td></tr>';
  }

  try {
    cachedOperationsIssues = await fetchAllOperationsIssues();
    cachedOperationsIssues = cachedOperationsIssues.filter((issue) => canViewOperationsIssue(issue));
    populateFilterSelects(cachedOperationsIssues);
    renderIssuesTable(cachedOperationsIssues);
    await loadOperationsDashboardMetrics(cachedOperationsIssues);
    operationsIssuesHydrated = true;
  } catch (error) {
    console.error('[Operations] Failed to load issues:', error);
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: string }).message)
        : 'Could not load operational issues.';

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(message)}</td></tr>`;
    }
    showToast('Could not load operational issues.', 'error');
  }
}

async function refreshIssueDrawerPanels(issueId: string): Promise<void> {
  const [events, attachments] = await Promise.all([
    loadOperationsIssueEvents(issueId),
    loadOperationsIssueAttachments(issueId),
  ]);

  renderOperationsIssueEvents(safeGet('operationsIssueActivity'), events);
  renderOperationsIssueAttachments(
    safeGet('operationsIssueAttachments'),
    attachments,
    canDeleteOperationsIssue() ? handleDeleteAttachment : undefined
  );
}

async function handleDeleteAttachment(attachment: { id?: string; file_name?: string }): Promise<void> {
  const confirmed = await showOrbisConfirm(
    `Delete attachment "${attachment.file_name || 'file'}"?`,
    'Delete attachment'
  );
  if (!confirmed || !currentOperationsIssueId) return;

  try {
    await deleteOperationsIssueAttachment(attachment);
    await recordOperationsIssueEvent(currentOperationsIssueId, 'attachment_removed', {
      note: attachment.file_name || '',
    });
    await refreshIssueDrawerPanels(currentOperationsIssueId);
    showToast('Attachment deleted.');
  } catch (error) {
    console.error('[Operations] Attachment delete failed:', error);
    showToast('Could not delete attachment.', 'error');
  }
}

function fillOperationsIssueDrawer(issue: OperationsIssue | null): void {
  populateSelectOptions('opsIssueCategoryInput', OPERATIONS_CATEGORIES, issue?.category, formatOperationsLabel);
  populateSelectOptions('opsIssueImpactInput', OPERATIONS_IMPACT_LEVELS, issue?.impact_level, formatOperationsLabel);
  populateSelectOptions('opsIssuePriorityInput', OPERATIONS_PRIORITIES, issue?.priority, formatOperationsLabel);
  populateSelectOptions('opsIssueStatusInput', OPERATIONS_STATUSES, issue?.status, formatOperationsLabel);
  populateDepartmentSelect(issue?.department);
  void populateAssigneeSelect(issue?.assigned_to_email);

  const values: Record<string, string | boolean> = {
    opsIssueTitleInput: issue?.title || '',
    opsIssueSystemInput: issue?.system_affected || '',
    opsIssueDescriptionInput: issue?.description || '',
    opsIssueDueDateInput: issue?.due_date || '',
    opsIssueResolutionNotesInput: issue?.resolution_notes || '',
    opsIssueRootCauseInput: issue?.root_cause || '',
    opsIssueRecurringInput: Boolean(issue?.is_recurring),
  };

  Object.entries(values).forEach(([id, value]) => {
    const field = safeGet<HTMLInputElement | HTMLTextAreaElement>(id);
    if (!field) return;
    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = Boolean(value);
    } else {
      field.value = String(value);
    }
  });

  if (issue?.category) {
    const categoryField = safeGet<HTMLSelectElement>('opsIssueCategoryInput');
    if (categoryField) categoryField.value = String(issue.category);
  }

  const deleteBtn = safeGet<HTMLButtonElement>('deleteOperationsIssueBtn');
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !canDeleteOperationsIssue() || !issue?.id);
  }

  const title = safeGet('operationsIssueDrawerTitle');
  const sub = safeGet('operationsIssueDrawerSub');
  if (title) title.textContent = issue?.title || 'New Operational Issue';
  if (sub) {
    sub.textContent = issue?.id
      ? `${formatOperationsLabel(String(issue.status || 'open'))} · ${issue.department || 'No department'}`
      : 'Operations Resolution Center';
  }
}

export function isOperationsIssueDrawerOpen(): boolean {
  const drawer = safeGet('operationsIssueDrawer');
  if (!drawer) return false;
  return drawer.classList.contains('open') || drawer.getAttribute('aria-hidden') === 'false';
}

export function closeOperationsIssueDrawer(): void {
  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('operationsIssueDrawer');
  const employeeDrawer = safeGet('employeeDrawer');
  const candidateDrawer = safeGet('candidateDrawer');

  if (drawer) {
    drawer.classList.remove('open');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.removeAttribute('style');
  }

  const candidateOpen =
    candidateDrawer?.classList.contains('open') ||
    candidateDrawer?.getAttribute('aria-hidden') === 'false';
  const employeeOpen =
    employeeDrawer?.classList.contains('open') ||
    employeeDrawer?.getAttribute('aria-hidden') === 'false';

  if (backdrop && !candidateOpen && !employeeOpen) {
    backdrop.classList.remove('open');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.removeAttribute('style');
  }

  if (employeeDrawer && !employeeOpen) {
    employeeDrawer.classList.remove('hidden');
    employeeDrawer.style.removeProperty('display');
    employeeDrawer.removeAttribute('aria-hidden');
  }

  document.body.classList.remove('orbis-drawer-open');
  document.body.style.overflow = '';

  const attachmentFileName = safeGet('opsIssueAttachmentFileName');
  if (attachmentFileName) attachmentFileName.textContent = 'No file chosen';

  currentOperationsIssueId = null;
}

export async function openOperationsIssueDrawer(issueId: string): Promise<void> {
  const issue = cachedOperationsIssues.find((row) => String(row.id) === String(issueId));

  if (!issue?.id) {
    showToast('Issue not found.', 'error');
    return;
  }

  if (!canViewOperationsIssue(issue)) {
    showToast('You do not have access to this issue.', 'error');
    return;
  }

  currentOperationsIssueId = String(issue.id);

  const employeeDrawer = safeGet('employeeDrawer');
  const candidateDrawer = safeGet('candidateDrawer');
  if (employeeDrawer) {
    employeeDrawer.classList.remove('open');
    employeeDrawer.classList.add('hidden');
    employeeDrawer.setAttribute('aria-hidden', 'true');
    employeeDrawer.style.setProperty('display', 'none', 'important');
  }
  if (candidateDrawer) {
    candidateDrawer.classList.remove('open');
    candidateDrawer.classList.add('hidden');
    candidateDrawer.setAttribute('aria-hidden', 'true');
  }

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('operationsIssueDrawer');
  if (!drawer) return;

  fillOperationsIssueDrawer(issue);
  applyDrawerOpenStyles(drawer, backdrop);
  await refreshIssueDrawerPanels(String(issue.id));
  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';
  safeGet('operationsIssueDrawer')?.querySelector('.drawer-body')?.scrollTo(0, 0);
}

export function openNewOperationsIssueForm(): void {
  if (!canAccessOperationsCenter()) {
    showToast('Operations Center requires admin or supervisor access.', 'error');
    return;
  }

  currentOperationsIssueId = null;

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('operationsIssueDrawer');
  if (!drawer) {
    console.error('[Operations] operationsIssueDrawer element not found');
    showToast('Could not open issue form. Refresh the page and try again.', 'error');
    return;
  }

  fillOperationsIssueDrawer({
    status: 'open',
    priority: 'normal',
    impact_level: 'medium',
    category: 'software',
    due_date: '',
  });

  const departments = getDepartmentOptions();
  if (departments.length === 1) {
    const deptField = safeGet<HTMLSelectElement>('opsIssueDepartmentInput');
    if (deptField) deptField.value = departments[0];
  }

  applyDrawerOpenStyles(drawer, backdrop);
  renderOperationsIssueEvents(safeGet('operationsIssueActivity'), []);
  renderOperationsIssueAttachments(safeGet('operationsIssueAttachments'), []);
  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';
  drawer.querySelector('.drawer-body')?.scrollTo(0, 0);
}

export function cancelOperationsIssueEdit(): void {
  closeOperationsIssueDrawer();
}

export async function saveOperationsIssueRecord(): Promise<void> {
  if (isOperationsSaveInProgress) {
    return;
  }

  isOperationsSaveInProgress = true;
  const saveButton = safeGet<HTMLButtonElement>('saveOperationsIssueBtn');
  if (saveButton) saveButton.disabled = true;

  try {
    await saveOperationsIssueRecordInner();
  } finally {
    isOperationsSaveInProgress = false;
    if (saveButton) saveButton.disabled = false;
  }
}

async function saveOperationsIssueRecordInner(): Promise<void> {
  const values = getDrawerValues();

  if (!values.title) {
    showToast('Issue title is required.', 'error');
    return;
  }

  if (!values.description) {
    showToast('Description is required.', 'error');
    return;
  }

  if (!values.department) {
    showToast('Department is required.', 'error');
    return;
  }

  const email = await resolveCurrentUserEmail();
  const displayName = resolveCurrentUserDisplayName();

  const status = normalizeOperationsStatus(values.status);
  const resolvedStatuses = ['resolved', 'closed'];
  const existing = currentOperationsIssueId
    ? cachedOperationsIssues.find((row) => String(row.id) === String(currentOperationsIssueId))
    : null;

  const payload: Record<string, unknown> = {
    title: values.title,
    category: values.category,
    system_affected: values.system_affected || null,
    description: values.description,
    impact_level: values.impact_level,
    priority: values.priority,
    status,
    is_recurring: values.is_recurring,
    department: values.department,
    assigned_to_email: values.assigned_to_email || null,
    assigned_to_name: values.assigned_to_name || null,
    due_date: values.due_date || null,
    resolution_notes: values.resolution_notes || null,
    root_cause: values.root_cause || null,
    resolved_at:
      resolvedStatuses.includes(status)
        ? existing?.resolved_at || new Date().toISOString()
        : null,
  };

  try {
    if (currentOperationsIssueId) {
      const { data, error } = await supabaseClient
        .from('operations_issues')
        .update(payload)
        .eq('id', currentOperationsIssueId)
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (existing && data) {
        if (String(existing.status || '') !== String(data.status || '')) {
          await recordOperationsIssueEvent(currentOperationsIssueId, 'status_changed', {
            fieldName: 'status',
            oldValue: String(existing.status || ''),
            newValue: String(data.status || ''),
          });
        }
        if (String(existing.assigned_to_email || '') !== String(data.assigned_to_email || '')) {
          await recordOperationsIssueEvent(currentOperationsIssueId, 'assigned', {
            fieldName: 'assigned_to',
            oldValue: String(existing.assigned_to_email || ''),
            newValue: String(data.assigned_to_email || ''),
          });
        }
        await recordOperationsIssueEvent(currentOperationsIssueId, 'updated', {
          note: 'Issue details updated',
        });
      }

      showToast('Operational issue updated.');
    } else {
      const insertPayload = {
        ...payload,
        reported_by_email: email,
        reported_by_name: displayName,
      };

      const { data, error } = await supabaseClient
        .from('operations_issues')
        .insert(insertPayload)
        .select('*')
        .maybeSingle();

      if (error) throw error;

      currentOperationsIssueId = String(data?.id || '');
      if (currentOperationsIssueId) {
        await recordOperationsIssueEvent(currentOperationsIssueId, 'created', {
          note: 'Issue reported',
        });
      }

      showToast('Operational issue created.');
    }

    await loadOperationsIssues();

    if (currentOperationsIssueId) {
      const refreshed = cachedOperationsIssues.find(
        (row) => String(row.id) === String(currentOperationsIssueId)
      );
      if (refreshed) {
        fillOperationsIssueDrawer(refreshed);
        await refreshIssueDrawerPanels(currentOperationsIssueId);
      }
    }
  } catch (error) {
    console.error('[Operations] Save failed:', error);
    showToast('Could not save operational issue.', 'error');
  }
}

export async function deleteOperationsIssueById(issueId: string): Promise<void> {
  if (!canDeleteOperationsIssue()) {
    showToast('Delete is restricted to administrators.', 'error');
    return;
  }

  const issue = cachedOperationsIssues.find((row) => String(row.id) === String(issueId));
  const title = String(issue?.title || 'this issue');

  const confirmed = await showOrbisConfirm(
    `Delete "${title}" and all related activity?`,
    'Delete issue'
  );
  if (!confirmed) return;

  const { error } = await supabaseClient.from('operations_issues').delete().eq('id', issueId);

  if (error) {
    console.error('[Operations] Delete failed:', error);
    showToast('Could not delete issue.', 'error');
    return;
  }

  if (String(currentOperationsIssueId) === String(issueId)) {
    closeOperationsIssueDrawer();
  }

  showToast('Operational issue deleted.');
  await loadOperationsIssues();
}

export async function deleteOperationsIssueRecord(): Promise<void> {
  if (!currentOperationsIssueId) {
    showToast('No issue selected to delete.', 'error');
    return;
  }

  await deleteOperationsIssueById(currentOperationsIssueId);
}

async function handleAttachmentUpload(file: File): Promise<void> {
  if (!currentOperationsIssueId) {
    showToast('Save the issue before uploading attachments.', 'error');
    return;
  }

  try {
    await uploadOperationsIssueAttachment(currentOperationsIssueId, file);
    await recordOperationsIssueEvent(currentOperationsIssueId, 'attachment_added', {
      note: file.name,
    });
    await refreshIssueDrawerPanels(currentOperationsIssueId);
    showToast('Attachment uploaded.');
  } catch (error) {
    console.error('[Operations] Upload failed:', error);
    showToast('Could not upload attachment.', 'error');
  }
}

function bindOperationsEvents(): void {
  if ((window as { __operationsEventsBound?: boolean }).__operationsEventsBound) return;
  (window as { __operationsEventsBound?: boolean }).__operationsEventsBound = true;

  const previousCloseActiveDrawer = window.closeActiveDrawer;
  window.closeActiveDrawer = () => {
    if (isOperationsIssueDrawerOpen()) {
      closeOperationsIssueDrawer();
      return;
    }
    previousCloseActiveDrawer?.();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!isOperationsIssueDrawerOpen()) return;
    event.preventDefault();
    closeOperationsIssueDrawer();
  });

  ['opsIssuesSearchInput', 'opsIssuesStatusFilter', 'opsIssuesCategoryFilter', 'opsIssuesDepartmentFilter', 'opsIssuesPriorityFilter'].forEach(
    (id) => {
      const element = safeGet(id);
      if (!element) return;
      element.addEventListener('input', () => renderIssuesTable(cachedOperationsIssues));
      element.addEventListener('change', () => renderIssuesTable(cachedOperationsIssues));
    }
  );

  safeGet('newOperationsIssueBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    openNewOperationsIssueForm();
  });

  safeGet('refreshOperationsIssuesBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void loadOperationsIssues();
  });

  safeGet('exportOperationsIssuesBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    exportOperationsIssuesCsv();
  });

  safeGet('saveOperationsIssueBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void saveOperationsIssueRecord();
  });

  safeGet('cancelOperationsIssueBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    cancelOperationsIssueEdit();
  });

  safeGet('deleteOperationsIssueBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void deleteOperationsIssueRecord();
  });

  const attachmentBtn = safeGet<HTMLButtonElement>('opsIssueAttachmentBtn');
  const attachmentInput = safeGet<HTMLInputElement>('opsIssueAttachmentInput');
  const attachmentFileName = safeGet('opsIssueAttachmentFileName');

  attachmentBtn?.addEventListener('click', () => {
    attachmentInput?.click();
  });

  attachmentInput?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (attachmentFileName) {
      attachmentFileName.textContent = file?.name || 'No file chosen';
    }

    if (!file) return;
    void handleAttachmentUpload(file);
    input.value = '';
    if (attachmentFileName) {
      attachmentFileName.textContent = 'No file chosen';
    }
  });
}

function isOperationsCenterVisible(): boolean {
  const section = safeGet('operationsCenterTop');
  if (!section || section.classList.contains('hidden')) {
    return false;
  }

  const rect = section.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

/** Load issues when the Operations section is on screen but navigation did not run. */
function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function exportOperationsIssuesCsv(): void {
  if (!canAccessOperationsCenter()) {
    showToast('Operations Center requires admin or supervisor access.', 'error');
    return;
  }

  const issues = filterIssues(cachedOperationsIssues);

  if (!issues.length) {
    showToast('No issues to export for the current filters.', 'error');
    return;
  }

  const headers = [
    'Title',
    'Category',
    'Department',
    'System Affected',
    'Priority',
    'Impact',
    'Status',
    'Assigned To',
    'Reported By',
    'Recurring',
    'Created',
    'Due Date',
    'Description',
    'Root Cause',
    'Resolution Notes',
  ];

  const rows = issues.map((issue) => [
    issue.title,
    formatOperationsLabel(String(issue.category || '')),
    issue.department,
    issue.system_affected,
    formatOperationsLabel(String(issue.priority || '')),
    formatOperationsLabel(String(issue.impact_level || '')),
    formatOperationsLabel(String(issue.status || '')),
    issue.assigned_to_name || issue.assigned_to_email,
    issue.reported_by_name || issue.reported_by_email,
    issue.is_recurring ? 'Yes' : 'No',
    issue.created_at ? new Date(String(issue.created_at)).toLocaleDateString() : '',
    issue.due_date || '',
    issue.description,
    issue.root_cause,
    issue.resolution_notes,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `operations-issues-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showToast(`Exported ${issues.length} issue${issues.length === 1 ? '' : 's'}.`);
}

export function ensureOperationsIssuesLoaded(force = false): void {
  if (!canAccessOperationsCenter()) {
    return;
  }

  const tbody = safeGet('operationsIssuesBody');
  const stillPlaceholder = Boolean(
    tbody?.textContent?.includes('Loading operational issues')
  );

  if (!force && operationsIssuesHydrated && !stillPlaceholder) {
    return;
  }

  void loadOperationsIssues();
}

function bindOperationsCenterAutoLoad(): void {
  if ((window as { __operationsAutoLoadBound?: boolean }).__operationsAutoLoadBound) {
    return;
  }

  (window as { __operationsAutoLoadBound?: boolean }).__operationsAutoLoadBound = true;

  const section = safeGet('operationsCenterTop');
  if (!section || typeof IntersectionObserver === 'undefined') {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      ensureOperationsIssuesLoaded();
    },
    { threshold: 0.12 }
  );

  observer.observe(section);
}

export function openOperationsView(): void {
  if (typeof window.switchMainView === 'function') {
    window.switchMainView('operationsView');
    return;
  }

  safeGet('operationsCenterTop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ensureOperationsIssuesLoaded(true);
}

function registerOperationsWindowGlobals(): void {
  const globalRef = globalThis as typeof globalThis & {
    loadOperationsIssues?: typeof loadOperationsIssues;
    openOperationsView?: typeof openOperationsView;
    openNewOperationsIssueForm?: typeof openNewOperationsIssueForm;
    openOperationsIssueDrawer?: typeof openOperationsIssueDrawer;
    closeOperationsIssueDrawer?: typeof closeOperationsIssueDrawer;
    saveOperationsIssueRecord?: typeof saveOperationsIssueRecord;
    deleteOperationsIssueRecord?: typeof deleteOperationsIssueRecord;
    deleteOperationsIssueById?: typeof deleteOperationsIssueById;
    cancelOperationsIssueEdit?: typeof cancelOperationsIssueEdit;
    isOperationsIssueDrawerOpen?: typeof isOperationsIssueDrawerOpen;
    applyOperationsCenterAccess?: typeof applyOperationsCenterAccess;
    ensureOperationsIssuesLoaded?: typeof ensureOperationsIssuesLoaded;
  };

  globalRef.loadOperationsIssues = loadOperationsIssues;
  globalRef.ensureOperationsIssuesLoaded = ensureOperationsIssuesLoaded;
  globalRef.exportOperationsIssuesCsv = exportOperationsIssuesCsv;
  globalRef.openOperationsView = openOperationsView;
  globalRef.openNewOperationsIssueForm = openNewOperationsIssueForm;
  globalRef.openOperationsIssueDrawer = openOperationsIssueDrawer;
  globalRef.closeOperationsIssueDrawer = closeOperationsIssueDrawer;
  globalRef.saveOperationsIssueRecord = saveOperationsIssueRecord;
  globalRef.deleteOperationsIssueRecord = deleteOperationsIssueRecord;
  globalRef.deleteOperationsIssueById = deleteOperationsIssueById;
  globalRef.cancelOperationsIssueEdit = cancelOperationsIssueEdit;
  globalRef.isOperationsIssueDrawerOpen = isOperationsIssueDrawerOpen;
  globalRef.applyOperationsCenterAccess = applyOperationsCenterAccess;
}

registerOperationsWindowGlobals();
bindOperationsEvents();
bindOperationsCenterAutoLoad();
