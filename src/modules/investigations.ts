import { supabaseClient } from '../services/supabaseClient';
import {
  canAccessInvestigationsCenter,
  canDeleteInvestigation,
  canManageInvestigations,
  canViewInvestigation,
  INVESTIGATION_INVESTIGATOR_EMAIL,
  INVESTIGATION_INVESTIGATOR_NAME,
  resolveInvestigatorDisplayName,
  resolveInvestigatorEmail,
} from '../services/investigationsAccess';
import {
  compareEmployeesByLastName,
  employeeDisplayName,
} from '../services/employeeUtils';
import {
  recordInvestigationAudit,
  summarizeInvestigationChanges,
} from '../services/investigationAudit';
import {
  addInvestigationEvidenceLink,
  deleteInvestigationEvidence,
  loadInvestigationEvidence,
  renderInvestigationEvidence,
  uploadInvestigationEvidenceFile,
} from '../services/investigationsAttachments';
import { requestInvestigationAiGuidance, InvestigationAiError } from '../services/investigationAiGuidance';
import {
  buildInvestigationGuidanceFallback,
  collectInvestigationGuidanceContext,
  type InvestigationGuidanceContext,
} from '../services/investigationGuidance';
import { initInvestigationDictation, stopInvestigationDictation } from './dictation';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  fetchAllInvestigations,
  loadInvestigationsDashboardMetrics,
} from '../ui/investigationsDashboard';
import {
  loadInvestigationTimeline,
  recordInvestigationTimelineEvent,
  renderInvestigationTimeline,
  timelineEventForStatus,
} from './investigationTimeline';
import type {
  Investigation,
  InvestigationInterview,
  InvestigationSubject,
} from '../types/investigationsTypes';
import {
  formatInvestigationLabel,
  INVESTIGATION_CATEGORIES,
  INVESTIGATION_OUTCOMES,
  INVESTIGATION_SEVERITIES,
  INVESTIGATION_STATUSES,
  INTERVIEW_TYPES,
  normalizeInvestigationStatus,
} from '../types/investigationsTypes';

let currentInvestigationId: string | null = null;
let cachedInvestigations: Investigation[] = [];
let cachedInterviews: InvestigationInterview[] = [];
let investigationsHydrated = false;
let isInvestigationSaveInProgress = false;
let activeInvestigationTab = 'case';

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
  drawer.style.setProperty('width', 'min(820px, 94vw)', 'important');
  drawer.style.setProperty('max-width', '94vw', 'important');
  drawer.style.setProperty('transform', 'translateX(0)', 'important');
  drawer.style.setProperty('z-index', '99999', 'important');
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

function getEmployeeRoster(): Record<string, unknown>[] {
  return Array.isArray(window.EMPLOYEES) ? (window.EMPLOYEES as Record<string, unknown>[]) : [];
}

function getSortedEmployeeRoster(): Record<string, unknown>[] {
  return [...getEmployeeRoster()].sort((left, right) =>
    compareEmployeesByLastName(
      left as Parameters<typeof compareEmployeesByLastName>[0],
      right as Parameters<typeof compareEmployeesByLastName>[1]
    )
  );
}

function getEmployeeId(employee: Record<string, unknown>): string {
  return String(
    employee.dbId || employee.id || employee.employee_id || employee.displayId || ''
  ).trim();
}

function findEmployeeById(employeeId: string): Record<string, unknown> | null {
  const id = String(employeeId || '').trim();
  if (!id) return null;

  return (
    getEmployeeRoster().find((employee) => {
      const keys = [employee.dbId, employee.id, employee.employee_id, employee.displayId]
        .filter(Boolean)
        .map(String);
      return keys.some((key) => key === id);
    }) || null
  );
}

async function ensureInvestigationsEmployeeRosterLoaded(): Promise<void> {
  if (getEmployeeRoster().length) return;

  if (typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
  }
}

function getEmployeeLabel(employeeId: string): string {
  const employee = findEmployeeById(employeeId);
  if (!employee) return employeeId;
  const id = getEmployeeId(employee);
  const name = employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0]);
  return `${name} (${id})`;
}

function populateEmployeeSelect(selectId: string, selectedValue?: string): void {
  const select = safeGet<HTMLSelectElement>(selectId);
  if (!select) return;

  const current = String(selectedValue || '');

  const options = getSortedEmployeeRoster()
    .map((employee) => {
      const id = getEmployeeId(employee);
      if (!id) return '';
      const label = getEmployeeLabel(id);
      const selected = id === current ? ' selected' : '';
      return `<option value="${escapeHtml(id)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .filter(Boolean)
    .join('');

  select.innerHTML = `<option value="">Select employee</option>${options}`;
}

function populateFocusEmployeeMultiSelect(selectedIds: string[] = []): void {
  const select = safeGet<HTMLSelectElement>('invFocusEmployeesInput');
  if (!select) return;

  const selected = new Set(selectedIds.map((id) => String(id).trim()).filter(Boolean));

  select.innerHTML = getSortedEmployeeRoster()
    .map((employee) => {
      const id = getEmployeeId(employee);
      if (!id) return '';
      const isSelected = selected.has(id) ? ' selected' : '';
      return `<option value="${escapeHtml(id)}"${isSelected}>${escapeHtml(getEmployeeLabel(id))}</option>`;
    })
    .filter(Boolean)
    .join('');
}

function getSelectedFocusEmployeeIds(): string[] {
  const select = safeGet<HTMLSelectElement>('invFocusEmployeesInput');
  if (!select) return [];

  return Array.from(select.selectedOptions)
    .map((option) => String(option.value || '').trim())
    .filter(Boolean);
}

function getFocusEmployeeIdsFromInvestigation(investigation: Investigation | null): string[] {
  const subjects = investigation?.investigation_subjects || [];
  const fromSubjects = subjects
    .filter((row) => String(row.subject_role || '') === 'focus')
    .map((row) => String(row.employee_id || '').trim())
    .filter(Boolean);

  if (fromSubjects.length) {
    return fromSubjects;
  }

  const legacyPrimary = String(investigation?.primary_employee_id || '').trim();
  return legacyPrimary ? [legacyPrimary] : [];
}

function populateTargetedEmployeeMultiSelect(selectedIds: string[] = []): void {
  const select = safeGet<HTMLSelectElement>('invTargetedEmployeesInput');
  if (!select) return;

  const selected = new Set(selectedIds.map((id) => String(id).trim()).filter(Boolean));

  select.innerHTML = getSortedEmployeeRoster()
    .map((employee) => {
      const id = getEmployeeId(employee);
      if (!id) return '';
      const isSelected = selected.has(id) ? ' selected' : '';
      return `<option value="${escapeHtml(id)}"${isSelected}>${escapeHtml(getEmployeeLabel(id))}</option>`;
    })
    .filter(Boolean)
    .join('');
}

function getSelectedTargetedEmployeeIds(): string[] {
  const select = safeGet<HTMLSelectElement>('invTargetedEmployeesInput');
  if (!select) return [];

  return Array.from(select.selectedOptions)
    .map((option) => String(option.value || '').trim())
    .filter(Boolean);
}

function getTargetedEmployeeIdsFromInvestigation(investigation: Investigation | null): string[] {
  const subjects = investigation?.investigation_subjects || [];
  const fromTargeted = subjects
    .filter((row) => String(row.subject_role || '') === 'targeted')
    .map((row) => String(row.employee_id || '').trim())
    .filter(Boolean);

  if (fromTargeted.length) {
    return fromTargeted;
  }

  const fromLegacyRespondent = subjects
    .filter((row) => String(row.subject_role || '') === 'respondent')
    .map((row) => String(row.employee_id || '').trim())
    .filter(Boolean);

  if (fromLegacyRespondent.length) {
    return fromLegacyRespondent;
  }

  const legacyColumn = String(investigation?.targeted_employee_id || '').trim();
  return legacyColumn ? [legacyColumn] : [];
}

function sortEmployeeIdsByLastName(employeeIds: string[]): string[] {
  return [...employeeIds].sort((leftId, rightId) =>
    compareEmployeesByLastName(
      findEmployeeById(leftId) as Parameters<typeof compareEmployeesByLastName>[0],
      findEmployeeById(rightId) as Parameters<typeof compareEmployeesByLastName>[1]
    )
  );
}

function formatEmployeeNamesForTable(employeeIds: string[]): string {
  const ids = sortEmployeeIdsByLastName(employeeIds);
  if (!ids.length) return '—';

  return ids
    .map((id) => {
      const employee = findEmployeeById(id);
      const drawerId = employee ? getEmployeeId(employee) : id;
      const name = employee
        ? employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0])
        : id;

      if (employee && typeof window.openEmployeeDrawer === 'function' && drawerId) {
        return `<button type="button" class="link-button" data-open-inv-employee="${escapeHtml(drawerId)}">${escapeHtml(name)}</button>`;
      }

      return escapeHtml(name);
    })
    .join(', ');
}

function formatTargetedEmployeesForTable(investigation: Investigation): string {
  return formatEmployeeNamesForTable(getTargetedEmployeeIdsFromInvestigation(investigation));
}

function formatEmployeeNamesForExport(employeeIds: string[]): string {
  const ids = sortEmployeeIdsByLastName(employeeIds);
  if (!ids.length) return '';

  return ids
    .map((id) => {
      const employee = findEmployeeById(id);
      if (!employee) return id;
      const name = employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0]);
      const employeeNumber = getEmployeeId(employee);
      return employeeNumber ? `${name} (${employeeNumber})` : name;
    })
    .join('; ');
}

function buildInvestigationEmployeeSearchText(investigation: Investigation): string {
  const employeeIds = new Set<string>([
    ...getTargetedEmployeeIdsFromInvestigation(investigation),
    ...getFocusEmployeeIdsFromInvestigation(investigation),
    String(investigation.reported_by_employee_id || '').trim(),
    String(investigation.targeted_employee_id || '').trim(),
    String(investigation.primary_employee_id || '').trim(),
  ].filter(Boolean));

  return [...employeeIds]
    .map((id) => {
      const employee = findEmployeeById(id);
      if (!employee) return id;
      const name = employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0]);
      return `${name} ${getEmployeeId(employee)}`.trim();
    })
    .join(' ')
    .toLowerCase();
}

async function syncTargetedSubjects(
  investigationId: string,
  employeeIds: string[]
): Promise<void> {
  const { error: deleteTargetedError } = await supabaseClient
    .from('investigation_subjects')
    .delete()
    .eq('investigation_id', investigationId)
    .eq('subject_role', 'targeted');

  if (deleteTargetedError) {
    throw deleteTargetedError;
  }

  const { error: deleteRespondentError } = await supabaseClient
    .from('investigation_subjects')
    .delete()
    .eq('investigation_id', investigationId)
    .eq('subject_role', 'respondent');

  if (deleteRespondentError) {
    throw deleteRespondentError;
  }

  if (!employeeIds.length) {
    return;
  }

  const rows = employeeIds.map((employeeId) => {
    const employee = findEmployeeById(employeeId);
    return {
      investigation_id: investigationId,
      employee_id: employeeId,
      subject_role: 'targeted',
      display_name: employee
        ? employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0])
        : employeeId,
    };
  });

  const { error: insertError } = await supabaseClient
    .from('investigation_subjects')
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

async function syncFocusSubjects(investigationId: string, employeeIds: string[]): Promise<void> {
  const { error: deleteError } = await supabaseClient
    .from('investigation_subjects')
    .delete()
    .eq('investigation_id', investigationId)
    .eq('subject_role', 'focus');

  if (deleteError) {
    throw deleteError;
  }

  if (!employeeIds.length) {
    return;
  }

  const rows = employeeIds.map((employeeId) => {
    const employee = findEmployeeById(employeeId);
    return {
      investigation_id: investigationId,
      employee_id: employeeId,
      subject_role: 'focus',
      display_name: employee
        ? employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0])
        : employeeId,
    };
  });

  const { error: insertError } = await supabaseClient
    .from('investigation_subjects')
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

function resolveReportedByFromForm(): { employeeId: string; displayName: string } {
  const employeeId = String(safeGet<HTMLSelectElement>('invReportedByInput')?.value || '').trim();
  if (!employeeId) {
    return { employeeId: '', displayName: '' };
  }

  const employee = findEmployeeById(employeeId);
  const displayName = employee
    ? employeeDisplayName(employee as Parameters<typeof employeeDisplayName>[0])
    : employeeId;

  return { employeeId, displayName };
}

function updateClosedFieldsVisibility(status?: string): void {
  const closedPanel = safeGet('invClosedFieldsPanel');
  if (!closedPanel) return;

  const normalized = normalizeInvestigationStatus(
    status || safeGet<HTMLSelectElement>('invStatusInput')?.value || ''
  );
  const showClosedFields = normalized === 'closed';
  closedPanel.classList.toggle('hidden', !showClosedFields);
}

function focusClosedOutcomeField(): void {
  updateClosedFieldsVisibility('closed');
  const panel = safeGet('invClosedFieldsPanel');
  const outcome = safeGet<HTMLSelectElement>('invOutcomeInput');
  panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  outcome?.focus();
}

function setInvestigationTab(tabId: string): void {
  if (activeInvestigationTab === 'interviews' && tabId !== 'interviews') {
    stopInvestigationDictation();
  }

  activeInvestigationTab = tabId;

  document.querySelectorAll('[data-investigation-tab]').forEach((button) => {
    const el = button as HTMLElement;
    const match = el.dataset.investigationTab === tabId;
    el.classList.toggle('active', match);
    el.setAttribute('aria-selected', match ? 'true' : 'false');
  });

  document.querySelectorAll('[data-investigation-panel]').forEach((panel) => {
    const el = panel as HTMLElement;
    const match = el.dataset.investigationPanel === tabId;
    el.classList.toggle('hidden', !match);
    el.setAttribute('aria-hidden', match ? 'false' : 'true');
  });
}

function filterInvestigations(rows: Investigation[]): Investigation[] {
  const search = String(safeGet<HTMLInputElement>('invSearchInput')?.value || '')
    .trim()
    .toLowerCase();
  const status = String(safeGet<HTMLSelectElement>('invStatusFilter')?.value || '').trim();
  const category = String(safeGet<HTMLSelectElement>('invCategoryFilter')?.value || '').trim();
  const severity = String(safeGet<HTMLSelectElement>('invSeverityFilter')?.value || '').trim();

  return rows.filter((row) => {
    const rowStatus = normalizeInvestigationStatus(row.status);

    if (!status) {
      if (rowStatus === 'closed') return false;
    } else if (rowStatus !== status) {
      return false;
    }

    if (category && String(row.category || '') !== category) return false;
    if (severity && String(row.severity || '') !== severity) return false;

    if (!search) return true;

    const haystack = [
      row.case_number,
      row.title,
      row.allegation_summary,
      row.assigned_investigator_email,
      row.assigned_investigator_name,
      row.reported_by_employee_id,
      row.reported_by_name,
      buildInvestigationEmployeeSearchText(row),
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return haystack.includes(search);
  });
}

function renderInvestigationsTable(rows: Investigation[]): void {
  const tbody = safeGet<HTMLTableSectionElement>('investigationsTableBody');
  const countEl = safeGet('investigationsTableCount');

  if (!tbody) return;

  const filtered = filterInvestigations(rows);

  if (countEl) {
    countEl.textContent = `${filtered.length} case${filtered.length === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="empty">No investigations match the current filters.</td></tr>';
    window.renderMobileInvestigationCards?.(filtered);
    return;
  }

  tbody.innerHTML = filtered
    .map((row) => {
      const opened = row.opened_at
        ? new Date(String(row.opened_at)).toLocaleDateString()
        : '—';
      const status = formatInvestigationLabel(normalizeInvestigationStatus(row.status));
      const severity = formatInvestigationLabel(String(row.severity || 'medium'));
      return `
        <tr data-investigation-id="${escapeHtml(row.id || '')}">
          <td>
            <button class="link-button" type="button" data-edit-investigation-id="${escapeHtml(row.id || '')}">
              ${escapeHtml(row.case_number || 'Case')}
            </button>
          </td>
          <td>${escapeHtml(row.title || '')}</td>
          <td>${formatTargetedEmployeesForTable(row)}</td>
          <td>${escapeHtml(formatInvestigationLabel(String(row.category || '')))}</td>
          <td>${escapeHtml(severity)}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(row.assigned_investigator_email || '—')}</td>
          <td>${escapeHtml(opened)}</td>
          <td>
            <button class="button soft sm" type="button" data-edit-investigation-id="${escapeHtml(row.id || '')}">
              Open
            </button>
            ${
              canDeleteInvestigation()
                ? `<button class="button danger sm" type="button" data-delete-investigation-id="${escapeHtml(row.id || '')}">Delete</button>`
                : ''
            }
          </td>
        </tr>
      `;
    })
    .join('');

  window.renderMobileInvestigationCards?.(filtered);

  tbody.querySelectorAll<HTMLButtonElement>('[data-edit-investigation-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.editInvestigationId;
      if (id) void openInvestigationDrawer(id);
    });
  });

  tbody.querySelectorAll<HTMLButtonElement>('[data-delete-investigation-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.deleteInvestigationId;
      if (id) void deleteInvestigationById(id);
    });
  });
}

function populateFilterSelects(): void {
  const statusFilter = safeGet<HTMLSelectElement>('invStatusFilter');
  const categoryFilter = safeGet<HTMLSelectElement>('invCategoryFilter');
  const severityFilter = safeGet<HTMLSelectElement>('invSeverityFilter');

  if (statusFilter) {
    const currentStatus = statusFilter.value;
    const openStatuses = INVESTIGATION_STATUSES.filter((value) => value !== 'closed');
    statusFilter.innerHTML =
      '<option value="">All Statuses</option>' +
      openStatuses
        .map(
          (value) =>
            `<option value="${value}">${escapeHtml(formatInvestigationLabel(value))}</option>`
        )
        .join('') +
      `<option value="closed">${escapeHtml(formatInvestigationLabel('closed'))}</option>`;

    if ([...statusFilter.options].some((option) => option.value === currentStatus)) {
      statusFilter.value = currentStatus;
    }
  }

  if (categoryFilter && categoryFilter.options.length <= 1) {
    categoryFilter.innerHTML =
      '<option value="">All Categories</option>' +
      INVESTIGATION_CATEGORIES.map(
        (category) =>
          `<option value="${category}">${escapeHtml(formatInvestigationLabel(category))}</option>`
      ).join('');
  }

  if (severityFilter && severityFilter.options.length <= 1) {
    severityFilter.innerHTML =
      '<option value="">All Severities</option>' +
      INVESTIGATION_SEVERITIES.map(
        (severity) =>
          `<option value="${severity}">${escapeHtml(formatInvestigationLabel(severity))}</option>`
      ).join('');
  }
}

export function applyInvestigationsCenterAccess(): void {
  const canAccess = canAccessInvestigationsCenter();
  document.querySelectorAll('[data-investigations-access]').forEach((element) => {
    (element as HTMLElement).classList.toggle('hidden', !canAccess);
  });
}

export async function loadInvestigations(): Promise<void> {
  const tbody = safeGet('investigationsTableBody');

  if (!canAccessInvestigationsCenter()) {
    applyInvestigationsCenterAccess();
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="empty">Investigations requires administrator access.</td></tr>';
    }
    return;
  }

  applyInvestigationsCenterAccess();

  if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="empty">Loading investigations...</td></tr>';
  }

  try {
    await ensureInvestigationsEmployeeRosterLoaded();
    cachedInvestigations = await fetchAllInvestigations();
    populateFilterSelects();
    renderInvestigationsTable(cachedInvestigations);
    loadInvestigationsDashboardMetrics(cachedInvestigations);
    investigationsHydrated = true;

    if (typeof window.initOrbisDisclosure === 'function') {
      const root = document.getElementById('orbisSectionInvestigations');
      if (root) window.initOrbisDisclosure(root);
    }

    if (typeof window.updateWorkspaceAlerts === 'function') {
      window.updateWorkspaceAlerts();
    }
  } catch (error) {
    console.error('[Investigations] Failed to load cases:', error);
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: string }).message)
        : 'Could not load investigations.';

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty">${escapeHtml(message)}</td></tr>`;
    }
    showToast('Could not load investigations.', 'error');
  }
}

async function loadInvestigationInterviews(investigationId: string): Promise<InvestigationInterview[]> {
  const { data, error } = await supabaseClient
    .from('investigation_interviews')
    .select('*')
    .eq('investigation_id', investigationId)
    .order('interview_date', { ascending: false });

  if (error) {
    console.error('[Investigations] Interview load failed:', error);
    return [];
  }

  return (data || []) as InvestigationInterview[];
}

function renderInvestigationInterviews(
  container: HTMLElement | null,
  interviews: InvestigationInterview[]
): void {
  if (!container) return;

  if (!interviews.length) {
    container.innerHTML = '<div class="empty">No interviews logged yet.</div>';
    return;
  }

  container.innerHTML = interviews
    .map((interview) => {
      const when = interview.interview_date
        ? new Date(String(interview.interview_date)).toLocaleDateString()
        : 'No date';
      return `
        <div class="history-item" data-interview-id="${escapeHtml(interview.id || '')}">
          <div class="history-body">
            <strong>${escapeHtml(formatInvestigationLabel(String(interview.interview_type || 'other')))}</strong>
            <div class="muted">${escapeHtml(interview.interviewer_name || interview.interviewer_email || 'HR')} · ${escapeHtml(when)}</div>
            ${interview.notes ? `<div>${escapeHtml(interview.notes)}</div>` : ''}
          </div>
          <div class="table-actions">
            <button type="button" class="button danger sm" data-delete-interview-id="${escapeHtml(interview.id || '')}">Remove</button>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll<HTMLButtonElement>('[data-delete-interview-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteInterviewId;
      const match = interviews.find((row) => row.id === id);
      if (match) void handleDeleteInterview(match);
    });
  });
}

async function handleDeleteInterview(interview: InvestigationInterview): Promise<void> {
  if (!interview.id || !currentInvestigationId) return;

  const confirmed = await showOrbisConfirm('Remove this interview record?', 'Remove interview');
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from('investigation_interviews')
    .delete()
    .eq('id', interview.id);

  if (error) {
    showToast('Could not remove interview.', 'error');
    return;
  }

  await recordInvestigationTimelineEvent(
    currentInvestigationId,
    'note_added',
    `Interview removed (${formatInvestigationLabel(String(interview.interview_type || ''))})`
  );

  cachedInterviews = await loadInvestigationInterviews(currentInvestigationId);
  renderInvestigationInterviews(safeGet('investigationInterviewsList'), cachedInterviews);
  await refreshTimelinePanel(currentInvestigationId);
  showToast('Interview removed.');
}

async function refreshDrawerPanels(investigationId: string): Promise<void> {
  const [evidence, timeline, interviews] = await Promise.all([
    loadInvestigationEvidence(investigationId),
    loadInvestigationTimeline(investigationId),
    loadInvestigationInterviews(investigationId),
  ]);

  cachedInterviews = interviews;
  renderInvestigationEvidence(
    safeGet('investigationEvidenceList'),
    evidence,
    canManageInvestigations() ? handleDeleteEvidence : undefined
  );
  renderInvestigationTimeline(safeGet('investigationTimelineList'), timeline);
  renderInvestigationInterviews(safeGet('investigationInterviewsList'), interviews);
}

async function refreshTimelinePanel(investigationId: string): Promise<void> {
  const timeline = await loadInvestigationTimeline(investigationId);
  renderInvestigationTimeline(safeGet('investigationTimelineList'), timeline);
}

async function handleDeleteEvidence(
  evidence: import('../types/investigationsTypes').InvestigationEvidence
): Promise<void> {
  if (!currentInvestigationId) return;

  const confirmed = await showOrbisConfirm(
    `Remove evidence "${evidence.title || 'item'}"?`,
    'Remove evidence'
  );
  if (!confirmed) return;

  try {
    await deleteInvestigationEvidence(evidence);
    await recordInvestigationTimelineEvent(
      currentInvestigationId,
      'evidence_added',
      `Evidence removed: ${evidence.title || ''}`
    );
    await refreshDrawerPanels(currentInvestigationId);
    showToast('Evidence removed.');
  } catch (error) {
    console.error('[Investigations] Evidence delete failed:', error);
    showToast('Could not remove evidence.', 'error');
  }
}

function fillInvestigationDrawer(investigation: Investigation | null): void {
  populateSelectOptions(
    'invCategoryInput',
    INVESTIGATION_CATEGORIES,
    investigation?.category,
    formatInvestigationLabel
  );
  populateSelectOptions(
    'invStatusInput',
    INVESTIGATION_STATUSES,
    investigation?.status,
    formatInvestigationLabel
  );
  populateSelectOptions(
    'invSeverityInput',
    INVESTIGATION_SEVERITIES,
    investigation?.severity,
    formatInvestigationLabel
  );
  populateSelectOptions(
    'invOutcomeInput',
    ['', ...INVESTIGATION_OUTCOMES],
    investigation?.outcome || '',
    (value) => (value ? formatInvestigationLabel(value) : '— Not set —')
  );
  populateTargetedEmployeeMultiSelect(getTargetedEmployeeIdsFromInvestigation(investigation));
  populateFocusEmployeeMultiSelect(getFocusEmployeeIdsFromInvestigation(investigation));
  populateEmployeeSelect(
    'invReportedByInput',
    investigation?.reported_by_employee_id || ''
  );

  const investigatorDisplay = safeGet('invInvestigatorDisplay');
  if (investigatorDisplay) {
    investigatorDisplay.textContent = `${INVESTIGATION_INVESTIGATOR_NAME} · ${INVESTIGATION_INVESTIGATOR_EMAIL}`;
  }

  const fields: Record<string, string> = {
    invTitleInput: investigation?.title || '',
    invAllegationInput: investigation?.allegation_summary || '',
    invSourceInput: investigation?.source_of_complaint || '',
    invOpenedAtInput: investigation?.opened_at || todayInputValue(),
    invTargetDateInput: investigation?.target_completion_date || '',
    invFindingsInput: investigation?.findings_summary || '',
    invRecommendedActionInput: investigation?.recommended_action || '',
    invFollowUpDateInput: investigation?.follow_up_date || '',
    invConfidentialNotesInput: investigation?.confidential_notes || '',
    invWitnessesInput: investigation?.witnesses || '',
    invAiGuidanceInput: investigation?.ai_guidance || '',
  };

  Object.entries(fields).forEach(([id, value]) => {
    const field = safeGet<HTMLInputElement | HTMLTextAreaElement>(id);
    if (field) field.value = value;
  });

  updateClosedFieldsVisibility(investigation?.status);

  const deleteBtn = safeGet<HTMLButtonElement>('deleteInvestigationBtn');
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !canDeleteInvestigation() || !investigation?.id);
  }

  const title = safeGet('investigationDrawerTitle');
  const sub = safeGet('investigationDrawerSub');
  if (title) {
    title.textContent = investigation?.case_number
      ? `${investigation.case_number} — ${investigation.title || 'Investigation'}`
      : 'New Investigation';
  }
  if (sub) {
    sub.textContent = investigation?.id
      ? `${formatInvestigationLabel(normalizeInvestigationStatus(investigation.status))} · ${formatInvestigationLabel(String(investigation.category || ''))}`
      : 'HR investigation workflow';
  }

  setInvestigationTab(activeInvestigationTab || 'case');
}

export function isInvestigationDrawerOpen(): boolean {
  const drawer = safeGet('investigationDrawer');
  if (!drawer) return false;
  return drawer.classList.contains('open') || drawer.getAttribute('aria-hidden') === 'false';
}

export function closeInvestigationDrawer(): void {
  stopInvestigationDictation();

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('investigationDrawer');
  const employeeDrawer = safeGet('employeeDrawer');
  const candidateDrawer = safeGet('candidateDrawer');
  const operationsDrawer = safeGet('operationsIssueDrawer');

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
  const operationsOpen =
    operationsDrawer?.classList.contains('open') ||
    operationsDrawer?.getAttribute('aria-hidden') === 'false';

  if (backdrop && !candidateOpen && !employeeOpen && !operationsOpen) {
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

  const fileName = safeGet('invEvidenceFileName');
  if (fileName) fileName.textContent = 'No file chosen';

  currentInvestigationId = null;
  cachedInterviews = [];
  activeInvestigationTab = 'case';
}

function hideOtherDrawers(): void {
  ['employeeDrawer', 'candidateDrawer', 'operationsIssueDrawer'].forEach((id) => {
    const drawer = safeGet(id);
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.style.setProperty('display', 'none', 'important');
  });
}

export async function openInvestigationDrawer(investigationId: string): Promise<void> {
  const investigation = cachedInvestigations.find((row) => String(row.id) === String(investigationId));

  if (!investigation?.id) {
    showToast('Investigation not found.', 'error');
    return;
  }

  if (!canViewInvestigation(investigation)) {
    showToast('You do not have access to this investigation.', 'error');
    return;
  }

  currentInvestigationId = String(investigation.id);
  hideOtherDrawers();

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('investigationDrawer');
  if (!drawer) return;

  fillInvestigationDrawer(investigation);
  applyDrawerOpenStyles(drawer, backdrop);
  await refreshDrawerPanels(String(investigation.id));
  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';
  drawer.querySelector('.drawer-body')?.scrollTo(0, 0);
}

export function openNewInvestigationForm(): void {
  if (!canManageInvestigations()) {
    showToast('Investigations requires administrator access.', 'error');
    return;
  }

  currentInvestigationId = null;
  hideOtherDrawers();

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('investigationDrawer');
  if (!drawer) {
    showToast('Could not open investigation form. Refresh and try again.', 'error');
    return;
  }

  fillInvestigationDrawer({
    status: 'intake',
    severity: 'medium',
    category: 'other',
    opened_at: todayInputValue(),
    assigned_investigator_email: INVESTIGATION_INVESTIGATOR_EMAIL,
    assigned_investigator_name: INVESTIGATION_INVESTIGATOR_NAME,
  });

  applyDrawerOpenStyles(drawer, backdrop);
  renderInvestigationInterviews(safeGet('investigationInterviewsList'), []);
  renderInvestigationEvidence(safeGet('investigationEvidenceList'), []);
  renderInvestigationTimeline(safeGet('investigationTimelineList'), []);
  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';
  drawer.querySelector('.drawer-body')?.scrollTo(0, 0);
}

export function cancelInvestigationEdit(): void {
  closeInvestigationDrawer();
}

function readInvestigationField(id: string): string {
  return String(
    safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id)?.value || ''
  ).trim();
}

function buildGuidanceContextFromDrawer(evidenceCount?: number): InvestigationGuidanceContext {
  const investigation = currentInvestigationId
    ? cachedInvestigations.find((row) => String(row.id) === String(currentInvestigationId))
    : null;

  const reportedBy = resolveReportedByFromForm();
  const targetedIds = getSelectedTargetedEmployeeIds();
  const focusIds = getSelectedFocusEmployeeIds();

  const interviews = cachedInterviews
    .map((row) => ({
      type: formatInvestigationLabel(String(row.interview_type || 'other')),
      date: String(row.interview_date || '').trim() || undefined,
      notes: String(row.notes || '').trim(),
      interviewer:
        String(row.interviewer_name || row.interviewer_email || '').trim() || undefined,
    }))
    .filter((row) => row.notes || row.type);

  return {
    caseNumber: investigation?.case_number || undefined,
    title: readInvestigationField('invTitleInput'),
    category: readInvestigationField('invCategoryInput'),
    status: readInvestigationField('invStatusInput'),
    severity: readInvestigationField('invSeverityInput'),
    allegationSummary: readInvestigationField('invAllegationInput'),
    witnesses: readInvestigationField('invWitnessesInput'),
    findingsSummary: readInvestigationField('invFindingsInput'),
    outcome: readInvestigationField('invOutcomeInput'),
    recommendedAction: readInvestigationField('invRecommendedActionInput'),
    targetedEmployees: targetedIds.map((id) => getEmployeeLabel(id)),
    focusEmployees: focusIds.map((id) => getEmployeeLabel(id)),
    reportedBy: reportedBy.displayName || undefined,
    interviews: interviews.length ? interviews : undefined,
    evidenceCount,
  };
}

async function countInvestigationEvidence(investigationId: string): Promise<number> {
  const { count, error } = await supabaseClient
    .from('investigation_evidence')
    .select('id', { count: 'exact', head: true })
    .eq('investigation_id', investigationId);

  if (error) {
    console.warn('[Investigations] Could not count evidence:', error);
    return 0;
  }

  return count || 0;
}

export async function generateInvestigationGuidance(): Promise<void> {
  if (!canManageInvestigations()) {
    showToast('You do not have permission to generate investigation guidance.', 'error');
    return;
  }

  const guidanceEl = safeGet<HTMLTextAreaElement>('invAiGuidanceInput');
  const generateBtn = safeGet<HTMLButtonElement>('generateInvestigationGuidanceBtn');

  if (!guidanceEl) {
    showToast('Guidance field not found.', 'error');
    return;
  }

  let evidenceCount: number | undefined;
  if (currentInvestigationId) {
    cachedInterviews = await loadInvestigationInterviews(currentInvestigationId);
    evidenceCount = await countInvestigationEvidence(currentInvestigationId);
  }

  const rawContext = buildGuidanceContextFromDrawer(evidenceCount);
  const context = collectInvestigationGuidanceContext(rawContext);
  const templateDraft = buildInvestigationGuidanceFallback(rawContext);

  if (!context && !templateDraft) {
    showToast('Add a case title or allegation summary before generating guidance.', 'error');
    return;
  }

  const existing = String(guidanceEl.value || '').trim();
  if (existing) {
    const confirmed = await showOrbisConfirm(
      'Replace the current HR guidance notes with a new AI draft from this case?',
      {
        title: 'Regenerate guidance',
        confirmLabel: 'Replace',
      }
    );
    if (!confirmed) return;
  }

  const originalBtnLabel = generateBtn?.textContent || 'Generate AI guidance';
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating…';
  }

  let draft = '';

  try {
    if (context) {
      try {
        draft = await requestInvestigationAiGuidance(context);
        showToast('AI guidance drafted. Review, edit, and save the case.');
      } catch (err) {
        let reason =
          err instanceof InvestigationAiError ? err.message : 'AI guidance is unavailable.';
        if (/failed to send a request to the edge function|relay error/i.test(reason)) {
          reason =
            'Edge function not reachable — deploy investigation-hr-guidance in Supabase (see DEPLOY.md).';
        }
        console.warn('[Investigations] AI guidance failed:', reason);
        draft = templateDraft;
        showToast(`Using template guidance (${reason})`, 'success');
      }
    } else {
      draft = templateDraft;
      showToast('Template guidance drafted. Review and edit before saving.');
    }

    guidanceEl.value = draft;
    guidanceEl.dispatchEvent(new Event('input', { bubbles: true }));
    setInvestigationTab('guidance');
    guidanceEl.focus();
  } finally {
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.textContent = originalBtnLabel;
    }
  }
}

function readDrawerValues(): Record<string, string> {
  const read = (id: string) =>
    String(
      safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id)?.value || ''
    ).trim();

  const reportedBy = resolveReportedByFromForm();
  const focusEmployeeIds = getSelectedFocusEmployeeIds();
  const targetedEmployeeIds = getSelectedTargetedEmployeeIds();

  return {
    title: read('invTitleInput'),
    allegation_summary: read('invAllegationInput'),
    category: read('invCategoryInput'),
    source_of_complaint: read('invSourceInput'),
    reported_by_name: reportedBy.displayName,
    reported_by_employee_id: reportedBy.employeeId,
    status: read('invStatusInput'),
    severity: read('invSeverityInput'),
    opened_at: read('invOpenedAtInput'),
    target_completion_date: read('invTargetDateInput'),
    findings_summary: read('invFindingsInput'),
    outcome: read('invOutcomeInput'),
    recommended_action: read('invRecommendedActionInput'),
    follow_up_date: read('invFollowUpDateInput'),
    confidential_notes: read('invConfidentialNotesInput'),
    witnesses: read('invWitnessesInput'),
    ai_guidance: read('invAiGuidanceInput'),
    targeted_employee_ids: targetedEmployeeIds.join(','),
    focus_employee_ids: focusEmployeeIds.join(','),
    primary_employee_id: targetedEmployeeIds[0] || focusEmployeeIds[0] || '',
  };
}

export async function saveInvestigationRecord(): Promise<void> {
  if (isInvestigationSaveInProgress) return;

  isInvestigationSaveInProgress = true;
  const saveButton = safeGet<HTMLButtonElement>('saveInvestigationBtn');
  if (saveButton) saveButton.disabled = true;

  try {
    await saveInvestigationRecordInner();
  } finally {
    isInvestigationSaveInProgress = false;
    if (saveButton) saveButton.disabled = false;
  }
}

async function saveInvestigationRecordInner(): Promise<void> {
  if (!canManageInvestigations()) {
    showToast('You do not have permission to manage investigations.', 'error');
    return;
  }

  const values = readDrawerValues();

  if (!values.title) {
    showToast('Case title is required.', 'error');
    return;
  }

  if (!values.allegation_summary) {
    showToast('Allegation summary is required.', 'error');
    return;
  }

  const status = normalizeInvestigationStatus(values.status);
  const email = INVESTIGATION_INVESTIGATOR_EMAIL;
  const focusEmployeeIds = getSelectedFocusEmployeeIds();
  const targetedEmployeeIds = getSelectedTargetedEmployeeIds();
  const reportedBy = resolveReportedByFromForm();

  const existing = currentInvestigationId
    ? cachedInvestigations.find((row) => String(row.id) === String(currentInvestigationId))
    : null;

  const wasClosed = normalizeInvestigationStatus(existing?.status) === 'closed';
  const isClosingNow = status === 'closed' && !wasClosed;

  let outcome = values.outcome || '';
  if (status === 'closed' && !outcome && isClosingNow) {
    outcome = 'inconclusive';
    const outcomeSelect = safeGet<HTMLSelectElement>('invOutcomeInput');
    if (outcomeSelect) {
      outcomeSelect.value = outcome;
    }
    showToast(
      'Outcome was set to Inconclusive so the case could close. Update it in Findings & Outcome if needed.',
      'success'
    );
  }

  const payload: Record<string, unknown> = {
    title: values.title,
    allegation_summary: values.allegation_summary,
    category: values.category || 'other',
    source_of_complaint: values.source_of_complaint || null,
    reported_by_name: reportedBy.displayName || null,
    reported_by_email: null,
    reported_by_employee_id: reportedBy.employeeId || null,
    status,
    severity: values.severity || 'medium',
    assigned_investigator_email: email,
    assigned_investigator_name: INVESTIGATION_INVESTIGATOR_NAME,
    opened_at: values.opened_at || todayInputValue(),
    target_completion_date: values.target_completion_date || null,
    findings_summary: values.findings_summary || null,
    outcome: status === 'closed' ? outcome || null : values.outcome || null,
    recommended_action: values.recommended_action || null,
    follow_up_date: values.follow_up_date || null,
    confidential_notes: values.confidential_notes || null,
    witnesses: values.witnesses || null,
    ai_guidance: values.ai_guidance || null,
    targeted_employee_id: targetedEmployeeIds[0] || null,
    primary_employee_id: targetedEmployeeIds[0] || focusEmployeeIds[0] || null,
    closed_at:
      status === 'closed'
        ? existing?.closed_at || new Date().toISOString()
        : null,
    updated_by_email: email || null,
  };

  try {
    let saved: Investigation | null = null;

    if (currentInvestigationId) {
      const { data, error } = await supabaseClient
        .from('investigations')
        .update(payload)
        .eq('id', currentInvestigationId)
        .select('*, investigation_subjects(*)')
        .maybeSingle();

      if (error) throw error;
      saved = (data as Investigation) || null;

      if (currentInvestigationId) {
        await syncTargetedSubjects(currentInvestigationId, targetedEmployeeIds);
        await syncFocusSubjects(currentInvestigationId, focusEmployeeIds);
        const { data: refreshedSubjects } = await supabaseClient
          .from('investigations')
          .select('*, investigation_subjects(*)')
          .eq('id', currentInvestigationId)
          .maybeSingle();
        if (refreshedSubjects) {
          saved = refreshedSubjects as Investigation;
        }
      }

      if (existing && saved) {
        const summary = summarizeInvestigationChanges(existing, saved);
        if (summary) {
          await recordInvestigationAudit('investigation_updated', saved, summary);
        }

        if (normalizeInvestigationStatus(existing.status) !== status) {
          const timelineType = timelineEventForStatus(status) || 'status_changed';
          await recordInvestigationTimelineEvent(
            currentInvestigationId,
            timelineType,
            `Status: ${formatInvestigationLabel(existing.status || '')} → ${formatInvestigationLabel(status)}`
          );
        }
      }

      showToast('Investigation updated.');
    } else {
      const { data: caseNumber, error: caseError } = await supabaseClient.rpc(
        'next_investigation_case_number'
      );

      if (caseError) throw caseError;

      const insertPayload = {
        ...payload,
        case_number: String(caseNumber || '').trim() || `INV-${new Date().getFullYear()}-0001`,
        created_by_email: email || null,
      };

      const { data, error } = await supabaseClient
        .from('investigations')
        .insert(insertPayload)
        .select('*, investigation_subjects(*)')
        .maybeSingle();

      if (error) throw error;
      saved = (data as Investigation) || null;
      currentInvestigationId = String(saved?.id || '');

      if (currentInvestigationId) {
        await syncTargetedSubjects(currentInvestigationId, targetedEmployeeIds);
        await syncFocusSubjects(currentInvestigationId, focusEmployeeIds);
        const { data: refreshedSubjects } = await supabaseClient
          .from('investigations')
          .select('*, investigation_subjects(*)')
          .eq('id', currentInvestigationId)
          .maybeSingle();
        if (refreshedSubjects) {
          saved = refreshedSubjects as Investigation;
        }

        await recordInvestigationTimelineEvent(currentInvestigationId, 'case_opened', 'Case opened');
        await recordInvestigationAudit(
          'investigation_opened',
          saved,
          `Opened case ${saved?.case_number || ''}`
        );
      }

      showToast('Investigation created.');
    }

    await loadInvestigations();

    if (currentInvestigationId) {
      const refreshed = cachedInvestigations.find(
        (row) => String(row.id) === String(currentInvestigationId)
      );
      if (refreshed) {
        fillInvestigationDrawer(refreshed);
        await refreshDrawerPanels(currentInvestigationId);
      }
    }
  } catch (error) {
    console.error('[Investigations] Save failed:', error);
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: string }).message)
        : 'Could not save investigation.';
    showToast(message, 'error');
  }
}

export async function deleteInvestigationById(investigationId: string): Promise<void> {
  if (!canDeleteInvestigation()) {
    showToast('Delete is restricted to administrators.', 'error');
    return;
  }

  const investigation = cachedInvestigations.find((row) => String(row.id) === String(investigationId));
  const label = String(investigation?.case_number || investigation?.title || 'this case');

  const confirmed = await showOrbisConfirm(
    `Delete ${label} and all related interviews, evidence, and timeline entries?`,
    'Delete investigation'
  );
  if (!confirmed) return;

  const { error } = await supabaseClient.from('investigations').delete().eq('id', investigationId);

  if (error) {
    console.error('[Investigations] Delete failed:', error);
    showToast('Could not delete investigation.', 'error');
    return;
  }

  if (investigation) {
    await recordInvestigationAudit('investigation_deleted', investigation, `Deleted ${label}`);
  }

  if (String(currentInvestigationId) === String(investigationId)) {
    closeInvestigationDrawer();
  }

  showToast('Investigation deleted.');
  await loadInvestigations();
}

export async function deleteInvestigationRecord(): Promise<void> {
  if (!currentInvestigationId) {
    showToast('No investigation selected to delete.', 'error');
    return;
  }

  await deleteInvestigationById(currentInvestigationId);
}

async function handleAddInterview(): Promise<void> {
  if (!currentInvestigationId) {
    showToast('Save the case before logging interviews.', 'error');
    return;
  }

  const interviewType = String(safeGet<HTMLSelectElement>('invInterviewTypeInput')?.value || 'other');
  const interviewDate = String(safeGet<HTMLInputElement>('invInterviewDateInput')?.value || '');
  const notes = String(safeGet<HTMLTextAreaElement>('invInterviewNotesInput')?.value || '').trim();

  if (!notes) {
    showToast('Interview notes are required.', 'error');
    return;
  }

  const email = await resolveInvestigatorEmail();

  const { error } = await supabaseClient.from('investigation_interviews').insert({
    investigation_id: currentInvestigationId,
    interview_type: interviewType,
    interview_date: interviewDate || null,
    interviewer_email: email || null,
    interviewer_name: resolveInvestigatorDisplayName(),
    notes,
  });

  if (error) {
    console.error('[Investigations] Interview save failed:', error);
    showToast('Could not save interview.', 'error');
    return;
  }

  const timelineMap: Record<string, string> = {
    complainant: 'complainant_interviewed',
    respondent: 'respondent_interviewed',
    witness: 'witness_interviewed',
    supervisor: 'supervisor_interviewed',
    other: 'interview_added',
  };

  await recordInvestigationTimelineEvent(
    currentInvestigationId,
    timelineMap[interviewType] || 'interview_added',
    `${formatInvestigationLabel(interviewType)} interview logged`
  );

  stopInvestigationDictation();
  safeGet<HTMLTextAreaElement>('invInterviewNotesInput')!.value = '';
  cachedInterviews = await loadInvestigationInterviews(currentInvestigationId);
  renderInvestigationInterviews(safeGet('investigationInterviewsList'), cachedInterviews);
  await refreshTimelinePanel(currentInvestigationId);
  showToast('Interview saved.');
}

async function handleEvidenceUpload(file: File): Promise<void> {
  if (!currentInvestigationId) {
    showToast('Save the case before uploading evidence.', 'error');
    return;
  }

  try {
    await uploadInvestigationEvidenceFile(currentInvestigationId, file);
    await recordInvestigationTimelineEvent(
      currentInvestigationId,
      'evidence_added',
      `File uploaded: ${file.name}`
    );
    await refreshDrawerPanels(currentInvestigationId);
    showToast('Evidence uploaded.');
  } catch (error) {
    console.error('[Investigations] Upload failed:', error);
    showToast('Could not upload evidence.', 'error');
  }
}

async function handleAddEvidenceLink(): Promise<void> {
  if (!currentInvestigationId) {
    showToast('Save the case before adding evidence.', 'error');
    return;
  }

  const title = String(safeGet<HTMLInputElement>('invEvidenceLinkTitleInput')?.value || '').trim();
  const url = String(safeGet<HTMLInputElement>('invEvidenceLinkUrlInput')?.value || '').trim();

  if (!title) {
    showToast('Evidence title is required.', 'error');
    return;
  }

  try {
    await addInvestigationEvidenceLink(currentInvestigationId, {
      evidence_type: 'link',
      title,
      external_url: url || undefined,
    });
    await recordInvestigationTimelineEvent(
      currentInvestigationId,
      'evidence_added',
      `Link added: ${title}`
    );
    safeGet<HTMLInputElement>('invEvidenceLinkTitleInput')!.value = '';
    safeGet<HTMLInputElement>('invEvidenceLinkUrlInput')!.value = '';
    await refreshDrawerPanels(currentInvestigationId);
    showToast('Evidence link added.');
  } catch (error) {
    console.error('[Investigations] Link evidence failed:', error);
    showToast('Could not add evidence link.', 'error');
  }
}

export function exportInvestigationsCsv(): void {
  if (!canAccessInvestigationsCenter()) {
    showToast('Investigations requires administrator access.', 'error');
    return;
  }

  const rows = filterInvestigations(cachedInvestigations);

  if (!rows.length) {
    showToast('No investigations to export for the current filters.', 'error');
    return;
  }

  const headers = [
    'Case Number',
    'Title',
    'Targeted Employee(s)',
    'Reported By',
    'Category',
    'Status',
    'Severity',
    'Investigator',
    'Opened',
    'Target Completion',
    'Outcome',
    'Allegation Summary',
  ];

  const csvRows = rows.map((row) => {
    const reportedById = String(row.reported_by_employee_id || '').trim();
    const reportedByName = reportedById
      ? formatEmployeeNamesForExport([reportedById])
      : String(row.reported_by_name || '');

    return [
      row.case_number,
      row.title,
      formatEmployeeNamesForExport(getTargetedEmployeeIdsFromInvestigation(row)),
      reportedByName,
      formatInvestigationLabel(String(row.category || '')),
      formatInvestigationLabel(normalizeInvestigationStatus(row.status)),
      formatInvestigationLabel(String(row.severity || '')),
      row.assigned_investigator_name || row.assigned_investigator_email,
      row.opened_at,
      row.target_completion_date,
      row.outcome ? formatInvestigationLabel(String(row.outcome)) : '',
      row.allegation_summary,
    ];
  });

  const csv = [headers, ...csvRows]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `investigations-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showToast(`Exported ${rows.length} case${rows.length === 1 ? '' : 's'}.`);
}

export function ensureInvestigationsLoaded(force = false): void {
  if (!canAccessInvestigationsCenter()) return;

  const tbody = safeGet('investigationsTableBody');
  const stillPlaceholder = Boolean(tbody?.textContent?.includes('Loading investigations'));

  if (!force && investigationsHydrated && !stillPlaceholder) {
    return;
  }

  void loadInvestigations();
}

export function openInvestigationsView(): void {
  if (typeof window.switchMainView === 'function') {
    window.switchMainView('investigationsView');
    return;
  }

  ensureInvestigationsLoaded(true);
}

function bindInvestigationsEvents(): void {
  if ((window as { __investigationsEventsBound?: boolean }).__investigationsEventsBound) {
    return;
  }

  (window as { __investigationsEventsBound?: boolean }).__investigationsEventsBound = true;

  initInvestigationDictation();

  const previousCloseActiveDrawer = window.closeActiveDrawer;
  window.closeActiveDrawer = () => {
    if (isInvestigationDrawerOpen()) {
      closeInvestigationDrawer();
      return;
    }
    previousCloseActiveDrawer?.();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!isInvestigationDrawerOpen()) return;
    event.preventDefault();
    closeInvestigationDrawer();
  });

  document.querySelectorAll('[data-investigation-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = (button as HTMLElement).dataset.investigationTab;
      if (tab) setInvestigationTab(tab);
    });
  });

  safeGet('invStatusInput')?.addEventListener('change', () => {
    const status = normalizeInvestigationStatus(
      safeGet<HTMLSelectElement>('invStatusInput')?.value || ''
    );
    updateClosedFieldsVisibility(status);
    if (status === 'closed') {
      focusClosedOutcomeField();
    }
  });

  ['invSearchInput', 'invStatusFilter', 'invCategoryFilter', 'invSeverityFilter'].forEach((id) => {
    const element = safeGet(id);
    element?.addEventListener('input', () => renderInvestigationsTable(cachedInvestigations));
    element?.addEventListener('change', () => renderInvestigationsTable(cachedInvestigations));
  });

  safeGet('investigationsTableBody')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('[data-open-inv-employee]') as HTMLElement | null;
    const employeeId = button?.getAttribute('data-open-inv-employee');
    if (!employeeId || typeof window.openEmployeeDrawer !== 'function') return;
    event.preventDefault();
    event.stopPropagation();
    void window.openEmployeeDrawer(employeeId);
  });

  safeGet('newInvestigationBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    openNewInvestigationForm();
  });

  safeGet('refreshInvestigationsBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void loadInvestigations();
  });

  safeGet('exportInvestigationsBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    exportInvestigationsCsv();
  });

  safeGet('saveInvestigationBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void saveInvestigationRecord();
  });

  safeGet('cancelInvestigationBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    cancelInvestigationEdit();
  });

  safeGet('deleteInvestigationBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void deleteInvestigationRecord();
  });

  safeGet('addInvestigationInterviewBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void handleAddInterview();
  });

  safeGet('generateInvestigationGuidanceBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void generateInvestigationGuidance();
  });

  safeGet('addInvestigationEvidenceLinkBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    void handleAddEvidenceLink();
  });

  populateSelectOptions(
    'invInterviewTypeInput',
    INTERVIEW_TYPES,
    'complainant',
    formatInvestigationLabel
  );

  const evidenceBtn = safeGet<HTMLButtonElement>('invEvidenceUploadBtn');
  const evidenceInput = safeGet<HTMLInputElement>('invEvidenceUploadInput');
  const evidenceFileName = safeGet('invEvidenceFileName');

  evidenceBtn?.addEventListener('click', () => evidenceInput?.click());
  evidenceInput?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (evidenceFileName) {
      evidenceFileName.textContent = file?.name || 'No file chosen';
    }
    if (!file) return;
    void handleEvidenceUpload(file);
    input.value = '';
    if (evidenceFileName) evidenceFileName.textContent = 'No file chosen';
  });
}

function registerInvestigationsWindowGlobals(): void {
  const globalRef = globalThis as typeof globalThis & Window;

  globalRef.loadInvestigations = loadInvestigations;
  globalRef.ensureInvestigationsLoaded = ensureInvestigationsLoaded;
  globalRef.exportInvestigationsCsv = exportInvestigationsCsv;
  globalRef.openInvestigationsView = openInvestigationsView;
  globalRef.openNewInvestigationForm = openNewInvestigationForm;
  globalRef.openInvestigationDrawer = openInvestigationDrawer;
  globalRef.closeInvestigationDrawer = closeInvestigationDrawer;
  globalRef.saveInvestigationRecord = saveInvestigationRecord;
  globalRef.deleteInvestigationRecord = deleteInvestigationRecord;
  globalRef.deleteInvestigationById = deleteInvestigationById;
  globalRef.cancelInvestigationEdit = cancelInvestigationEdit;
  globalRef.isInvestigationDrawerOpen = isInvestigationDrawerOpen;
  globalRef.applyInvestigationsCenterAccess = applyInvestigationsCenterAccess;
  globalRef.generateInvestigationGuidance = generateInvestigationGuidance;
}

registerInvestigationsWindowGlobals();
bindInvestigationsEvents();
