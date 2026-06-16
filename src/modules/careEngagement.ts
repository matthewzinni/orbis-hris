// ============================================
// Care & Engagement — culture, support, retention intelligence
// ============================================

import {
  clearMatrixCell,
  deleteCareItem,
  deletePulseSnapshot,
  deleteRecognition,
  fetchCareEngagementDataset,
  invalidateCareEngagementCache,
} from '../data/careEngagementStore';
import {
  bindCareEngagementEditorEvents,
  openCareItemEditor,
  openCareMatrixEditor,
  openCareRecognitionEditor,
  openPulseSnapshotEditor,
  setCareEditorOnSaved,
} from './careEngagementEditor';
import { isPulseDemoSnapshot } from '../services/carePulseUtils';
import {
  ensureCareEmployeeRosterLoaded,
  renderCareEmployeeNameLink,
} from '../services/careEmployeePicker';
import { recordCareProgramAudit } from '../services/careEngagementAudit';
import {
  canAccessCareEngagementCenter,
  canManageCareEngagementRecords,
} from '../services/careEngagementAccess';
import { showOrbisConfirm } from '../ui/confirmModal';
import { switchMainView } from '../ui/navigation';
import {
  computeCareEngagementKpis,
  findMatrixCell,
  loadCareEngagementKpis,
} from '../ui/careEngagementDashboard';
import type {
  CareCellStatus,
  CareEngagementDataset,
  CareMatrixCellEntry,
  CareMatrixColumnKey,
  CareMatrixRowKey,
  CarePulseSurveySnapshot,
  CareTrackerItem,
} from '../types/careEngagementTypes';

const MATRIX_ROWS: { key: CareMatrixRowKey; label: string }[] = [
  { key: 'employees', label: 'Employees' },
  { key: 'employeesFamilies', label: "Employees' Families" },
  { key: 'community', label: 'Community' },
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
];

const MATRIX_COLUMNS: { key: CareMatrixColumnKey; label: string }[] = [
  { key: 'physical', label: 'Physical' },
  { key: 'emotional', label: 'Emotional' },
  { key: 'spiritual', label: 'Spiritual / Values-Based' },
];

const CARE_MATRIX_HELP_MANAGE =
  'Map support across stakeholder groups and care dimensions. Click a cell for details; double-click to edit, or use Edit in the detail panel below.';
const CARE_MATRIX_HELP_VIEW =
  'Map support across stakeholder groups and care dimensions. Click a cell for details. Editing matrix cells requires HR admin access.';

const CELL_STATUS_LABELS: Record<CareCellStatus, string> = {
  current: 'Current',
  gap: 'Gap',
  proposed: 'Proposed',
  in_progress: 'In Progress',
  complete: 'Complete',
};

let cachedDataset: CareEngagementDataset | null = null;
let careEngagementHydrated = false;
let selectedMatrixCellId: string | null = null;
let selectedCareItemId: string | null = null;

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setText(id: string, value: string): void {
  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function formatDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function renderStatusChip(status: CareCellStatus): string {
  const label = CELL_STATUS_LABELS[status] || status;
  return `<span class="care-status-chip ${esc(status)}">${esc(label)}</span>`;
}

function renderMatrixTable(dataset: CareEngagementDataset): void {
  const body = document.getElementById('careMatrixBody');
  if (!body) return;

  const rowsHtml = MATRIX_ROWS.map(({ key: rowKey, label: rowLabel }) => {
    const cells = MATRIX_COLUMNS.map(({ key: colKey }) => {
      const cell =
        findMatrixCell(dataset.matrixCells, rowKey, colKey) ||
        ({
          id: `${rowKey}-${colKey}`,
          row: rowKey,
          column: colKey,
          initiatives: '',
          gaps: '',
          proposedActions: '',
          owner: '',
          dueDate: '',
          status: 'proposed' as const,
        } satisfies CareMatrixCellEntry);

      const summaryParts = [
        cell.initiatives ? `Initiatives: ${cell.initiatives}` : '',
        cell.gaps ? `Gap: ${cell.gaps}` : '',
        cell.proposedActions ? `Action: ${cell.proposedActions}` : '',
      ].filter(Boolean);

      const summary =
        summaryParts.slice(0, 2).join(' · ') || 'No initiatives logged yet — click to plan';

      return `
        <td
          class="care-matrix-cell"
          tabindex="0"
          role="button"
          data-care-matrix-cell="${esc(cell.id)}"
          aria-label="${esc(rowLabel)} ${esc(MATRIX_COLUMNS.find((c) => c.key === colKey)?.label || colKey)} cell"
        >
          <div class="care-matrix-cell-summary">
            ${renderStatusChip(cell.status)}
            <span>${esc(summary)}</span>
            ${cell.owner ? `<span class="care-matrix-cell-owner">${esc(cell.owner)} · Due ${esc(formatDate(cell.dueDate))}</span>` : ''}
          </div>
        </td>
      `;
    }).join('');

    return `
      <tr>
        <th scope="row" class="care-matrix-row-label">${esc(rowLabel)}</th>
        ${cells}
      </tr>
    `;
  }).join('');

  body.innerHTML = rowsHtml;
}

function renderMatrixDetail(cell: CareMatrixCellEntry | null): void {
  const panel = document.getElementById('careMatrixDetailPanel');
  if (!panel) return;

  if (!cell) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');
  const canManage = canManageCareEngagementRecords();
  const actionsToolbar = canManage
    ? `
      <div class="toolbar" style="margin-top:12px;gap:8px;">
        <button type="button" class="button soft sm" data-edit-care-matrix="${esc(cell.id)}">Edit</button>
        <button type="button" class="button danger sm" data-delete-care-matrix="${esc(cell.id)}">Clear cell</button>
      </div>`
    : '';

  panel.innerHTML = `
    <div class="care-detail-panel">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <strong>${esc(MATRIX_ROWS.find((r) => r.key === cell.row)?.label || cell.row)}</strong>
        <span class="muted">·</span>
        <strong>${esc(MATRIX_COLUMNS.find((c) => c.key === cell.column)?.label || cell.column)}</strong>
        ${renderStatusChip(cell.status)}
      </div>
      <div class="detail-grid">
        <div><span class="muted">Current initiatives</span><div>${esc(cell.initiatives || '—')}</div></div>
        <div><span class="muted">Identified gaps</span><div>${esc(cell.gaps || '—')}</div></div>
        <div><span class="muted">Proposed actions</span><div>${esc(cell.proposedActions || '—')}</div></div>
        <div><span class="muted">Owner</span><div>${esc(cell.owner || '—')}</div></div>
        <div><span class="muted">Due date</span><div>${esc(formatDate(cell.dueDate))}</div></div>
      </div>
      ${actionsToolbar}
      <p class="muted" style="margin:12px 0 0;font-size:0.8rem;">Saved to Supabase <code>care_matrix_cells</code>.</p>
    </div>
  `;
}

function careItemStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function careTypeLabel(type: string): string {
  if (type === 'spiritual') return 'Spiritual / Values-Based';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function renderCareTrackerTable(dataset: CareEngagementDataset): void {
  const body = document.getElementById('careTrackerBody');
  const count = document.getElementById('careTrackerCount');
  if (!body) return;

  const items = [...dataset.careItems];
  const canManage = canManageCareEngagementRecords();
  const colspan = canManage ? 10 : 9;

  if (count) {
    count.textContent = `${items.length} care item${items.length === 1 ? '' : 's'}`;
  }

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="${colspan}" class="empty">No care items logged.</td></tr>`;
    window.renderMobileCareCards?.([]);
    return;
  }

  body.innerHTML = items
    .map((item) => {
      const nameCell = renderCareEmployeeNameLink(item.employeeId, item.employeeName);
      const actionsCell = canManage
        ? `<td>
          <button type="button" class="button soft sm" data-edit-care-item="${esc(item.id)}">Edit</button>
          <button type="button" class="button danger sm" data-delete-care-item="${esc(item.id)}">Delete</button>
        </td>`
        : '';

      return `
      <tr class="care-item-row" data-care-item-id="${esc(item.id)}" tabindex="0">
        <td>${nameCell}</td>
        <td>${esc(item.department)}</td>
        <td>${esc(careTypeLabel(item.type))}</td>
        <td>${esc(item.needOrConcern)}</td>
        <td>${esc(item.actionTaken)}</td>
        <td>${esc(item.owner)}</td>
        <td>${esc(formatDate(item.followUpDate))}</td>
        <td>${esc(careItemStatusLabel(item.status))}</td>
        <td><span class="care-confidentiality-pill ${esc(item.confidentiality)}">${esc(item.confidentiality.replace(/_/g, ' '))}</span></td>
        ${actionsCell}
      </tr>
    `;
    })
    .join('');

  window.renderMobileCareCards?.(items);
}

function renderCareItemDetail(item: CareTrackerItem | null): void {
  const panel = document.getElementById('careItemDetailPanel');
  if (!panel) return;

  if (!item) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');
  const canManage = canManageCareEngagementRecords();
  const actionsToolbar = canManage
    ? `
      <div class="toolbar" style="margin-top:12px;gap:8px;">
        <button type="button" class="button soft sm" data-edit-care-item="${esc(item.id)}">Edit</button>
        <button type="button" class="button danger sm" data-delete-care-item="${esc(item.id)}">Delete</button>
      </div>`
    : '';

  panel.innerHTML = `
    <div class="care-detail-panel">
      <strong>${esc(item.employeeName)}</strong>
      <span class="muted"> · ${esc(item.department)}</span>
      <div class="detail-grid" style="margin-top:10px;">
        <div><span class="muted">Type</span><div>${esc(careTypeLabel(item.type))}</div></div>
        <div><span class="muted">Need / concern</span><div>${esc(item.needOrConcern)}</div></div>
        <div><span class="muted">Action taken</span><div>${esc(item.actionTaken)}</div></div>
        <div><span class="muted">Owner</span><div>${esc(item.owner)}</div></div>
        <div><span class="muted">Follow-up</span><div>${esc(formatDate(item.followUpDate))}</div></div>
        <div><span class="muted">Status</span><div>${esc(careItemStatusLabel(item.status))}</div></div>
      </div>
      ${actionsToolbar}
    </div>
  `;
}

const RECOGNITION_LABELS: Record<string, string> = {
  kudos: 'Kudos',
  iron_shift: 'Iron Shift Nomination',
  work_anniversary: 'Work Anniversary',
  above_and_beyond: 'Above & Beyond',
  peer_recognition: 'Peer Recognition',
};

function renderRecognitionPanel(dataset: CareEngagementDataset): void {
  const list = document.getElementById('careRecognitionList');
  if (!list) return;

  const canManage = canManageCareEngagementRecords();

  if (!dataset.recognition.length) {
    list.innerHTML = '<div class="empty">No recognition logged this period.</div>';
    return;
  }

  list.innerHTML = dataset.recognition
    .map(
      (entry) => `
      <div class="history-item" data-care-recognition-id="${esc(entry.id)}">
        <div class="history-title">${esc(RECOGNITION_LABELS[entry.type] || entry.type)} · ${renderCareEmployeeNameLink(entry.employeeId, entry.employeeName)}</div>
        <div class="history-body">${esc(entry.summary)}</div>
        <small class="muted">${esc(entry.department)} · ${esc(formatDate(entry.recognizedOn))} · ${esc(entry.recognizedBy)}</small>
        ${
          canManage
            ? `<div class="toolbar" style="margin-top:8px;gap:8px;">
          <button type="button" class="button soft sm" data-edit-care-recognition="${esc(entry.id)}">Edit</button>
          <button type="button" class="button danger sm" data-delete-care-recognition="${esc(entry.id)}">Delete</button>
        </div>`
            : ''
        }
      </div>
    `
    )
    .join('');
}

function formatPulseRecordedOn(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function renderPulseHistory(snapshots: CarePulseSurveySnapshot[]): void {
  const list = document.getElementById('carePulseHistoryList');
  if (!list) return;

  const canManage = canManageCareEngagementRecords();

  if (!snapshots.length) {
    list.innerHTML = '<div class="empty">No pulse snapshots recorded yet.</div>';
    return;
  }

  list.innerHTML = snapshots
    .map((snapshot) => {
      const demo = isPulseDemoSnapshot(snapshot);
      const recorded = formatPulseRecordedOn(snapshot.createdAt || '');
      const actions = canManage
        ? `<div class="toolbar" style="margin-top:8px;gap:8px;">
            <button type="button" class="button soft sm" data-edit-care-pulse="${esc(snapshot.id || '')}">Edit</button>
            <button type="button" class="button danger sm" data-delete-care-pulse="${esc(snapshot.id || '')}">Delete</button>
          </div>`
        : '';
      return `
        <div class="history-item care-pulse-history-item" data-care-pulse-id="${esc(snapshot.id || '')}">
          <div class="history-title">
            ${esc(snapshot.periodLabel)}
            ${demo ? '<span class="care-pulse-demo-tag">Demo</span>' : ''}
          </div>
          <div class="history-body muted">
            ${esc(snapshot.responseCount)} responses · Support ${snapshot.overallSupport.toFixed(1)} · Stress ${snapshot.workloadStress.toFixed(1)}
            ${recorded ? ` · Saved ${esc(recorded)}` : ''}
          </div>
          ${actions}
        </div>
      `;
    })
    .join('');
}

function renderPulseSection(dataset: CareEngagementDataset): void {
  const pulse = dataset.pulse;
  const isDemo = isPulseDemoSnapshot(pulse);
  const card = document.getElementById('carePulseCard') || document.querySelector('.care-pulse-card');

  if (card) {
    card.classList.toggle('care-pulse-card--demo', isDemo);
  }

  const metrics: { key: string; label: string; value: number }[] = [
    { key: 'carePulseOverall', label: 'Overall support', value: pulse.overallSupport },
    { key: 'carePulseWorkload', label: 'Workload stress', value: pulse.workloadStress },
    { key: 'carePulseCommunication', label: 'Communication', value: pulse.communication },
    { key: 'carePulseRecognition', label: 'Recognition', value: pulse.recognition },
    { key: 'carePulseBelonging', label: 'Belonging', value: pulse.belonging },
  ];

  metrics.forEach(({ key, label, value }) => {
    const el = document.getElementById(key);
    if (!el) return;
    const pct = Math.min(100, Math.round((value / 5) * 100));
    el.innerHTML = `
      <div class="care-pulse-metric">
        <div class="muted" style="font-size:0.78rem;">${esc(label)}</div>
        <div class="care-pulse-score">${value.toFixed(1)}</div>
        <div class="care-pulse-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </div>
    `;
  });

  const periodEl = document.getElementById('carePulsePeriod');
  if (periodEl) {
    periodEl.textContent = pulse.periodLabel;
  }

  const responsesEl = document.getElementById('carePulseResponses');
  if (responsesEl) {
    responsesEl.textContent = `${pulse.responseCount} responses`;
  }

  const commentsEl = document.getElementById('carePulseComments');
  if (commentsEl) {
    commentsEl.textContent = pulse.commentsSummary;
  }

  const banner = document.getElementById('carePulseDemoBanner');
  if (banner) {
    banner.classList.toggle('hidden', !isDemo);
  }

  const liveBanner = document.getElementById('carePulseLiveBanner');
  if (liveBanner) {
    liveBanner.classList.toggle('hidden', isDemo);
  }

  renderPulseHistory(dataset.pulseSnapshots || []);
}

function renderCareEngagementPage(dataset: CareEngagementDataset): void {
  loadCareEngagementKpis(dataset, setText);
  renderMatrixTable(dataset);
  renderCareTrackerTable(dataset);
  renderRecognitionPanel(dataset);
  renderPulseSection(dataset);

  if (selectedMatrixCellId) {
    renderMatrixDetail(resolveMatrixCell(selectedMatrixCellId));
  } else {
    renderMatrixDetail(null);
  }

  if (selectedCareItemId) {
    const item = dataset.careItems.find((c) => c.id === selectedCareItemId) || null;
    renderCareItemDetail(item);
  } else {
    renderCareItemDetail(null);
  }
}

export function applyCareEngagementCenterAccess(): void {
  const allowed = canAccessCareEngagementCenter();
  document.querySelectorAll('[data-care-engagement-access]').forEach((element) => {
    element.classList.toggle('hidden', !allowed);
  });

  const canManage = canManageCareEngagementRecords();
  document.querySelectorAll('[data-care-engagement-manage]').forEach((element) => {
    element.classList.toggle('hidden', !canManage);
  });

  document.querySelectorAll('#careTrackerCard thead th:last-child').forEach((cell) => {
    cell.classList.toggle('hidden', !canManage);
  });

  const readOnlyBanner = document.getElementById('careEngagementReadOnlyBanner');
  if (readOnlyBanner) {
    readOnlyBanner.classList.toggle('hidden', !allowed || canManage);
  }

  const matrixHelp = document.getElementById('careMatrixHelpText');
  if (matrixHelp) {
    matrixHelp.textContent = canManage ? CARE_MATRIX_HELP_MANAGE : CARE_MATRIX_HELP_VIEW;
  }
}

export async function loadCareEngagement(): Promise<void> {
  if (!canAccessCareEngagementCenter()) {
    applyCareEngagementCenterAccess();
    return;
  }

  applyCareEngagementCenterAccess();

  try {
    await ensureCareEmployeeRosterLoaded();
    cachedDataset = await fetchCareEngagementDataset(true);
    renderCareEngagementPage(cachedDataset);
    careEngagementHydrated = true;

    if (typeof window.updateWorkspaceAlerts === 'function') {
      window.updateWorkspaceAlerts();
    }
  } catch (err) {
    console.error('[CareEngagement] Load failed:', err);
    showToast('Could not load Care & Engagement data.', 'error');
  }
}

export function ensureCareEngagementLoaded(force = false): void {
  if (!canAccessCareEngagementCenter()) {
    applyCareEngagementCenterAccess();
    return;
  }

  if (careEngagementHydrated && !force) {
    return;
  }

  void loadCareEngagement();
}

export function openCareEngagementView(): void {
  switchMainView('careEngagementView');
}

async function confirmDeleteCareItem(itemId: string): Promise<void> {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to delete care items.', 'error');
    return;
  }
  const confirmed = await showOrbisConfirm('Delete this care item?', {
    title: 'Delete care item',
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;
  try {
    await deleteCareItem(itemId);
    selectedCareItemId = null;
    showToast('Care item deleted.');
    await refreshCareEngagementView();
  } catch (err) {
    console.error('[CareEngagement] Delete care item failed:', err);
    showToast('Could not delete care item.', 'error');
  }
}

async function confirmDeletePulseSnapshot(snapshotId: string): Promise<void> {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to delete pulse snapshots.', 'error');
    return;
  }
  const snapshot = cachedDataset?.pulseSnapshots.find((row) => row.id === snapshotId);
  const confirmed = await showOrbisConfirm(
    `Delete pulse snapshot${snapshot?.periodLabel ? ` "${snapshot.periodLabel}"` : ''}?`,
    { title: 'Delete pulse snapshot', danger: true, confirmLabel: 'Delete' }
  );
  if (!confirmed || !snapshot?.id) return;

  try {
    await deletePulseSnapshot(snapshot.id);
    await recordCareProgramAudit('Pulse Snapshot Deleted', snapshot.periodLabel);
    showToast('Pulse snapshot deleted.');
    await refreshCareEngagementView();
  } catch (err) {
    console.error('[CareEngagement] Delete pulse snapshot failed:', err);
    showToast('Could not delete pulse snapshot.', 'error');
  }
}

async function confirmDeleteRecognition(entryId: string): Promise<void> {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to delete recognition entries.', 'error');
    return;
  }
  const confirmed = await showOrbisConfirm('Delete this recognition entry?', {
    title: 'Delete recognition',
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;
  try {
    await deleteRecognition(entryId);
    showToast('Recognition deleted.');
    await refreshCareEngagementView();
  } catch (err) {
    console.error('[CareEngagement] Delete recognition failed:', err);
    showToast('Could not delete recognition.', 'error');
  }
}

async function editorDeleteMatrix(cell: CareMatrixCellEntry): Promise<void> {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to clear matrix cells.', 'error');
    return;
  }
  const confirmed = await showOrbisConfirm(
    'Clear this matrix cell? Initiatives and gaps will be removed.',
    { title: 'Clear matrix cell', danger: true, confirmLabel: 'Clear' }
  );
  if (!confirmed) return;

  try {
    await clearMatrixCell(cell.id, cell.row, cell.column);
    await recordCareProgramAudit('Care Matrix Cleared', `${cell.row} · ${cell.column}`);
    selectedMatrixCellId = null;
    showToast('Matrix cell cleared.');
    await refreshCareEngagementView();
  } catch (err) {
    console.error('[CareEngagement] Clear matrix cell failed:', err);
    showToast('Could not clear matrix cell.', 'error');
  }
}

async function refreshCareEngagementView(): Promise<void> {
  cachedDataset = await fetchCareEngagementDataset(true);
  renderCareEngagementPage(cachedDataset);
}

function resolveMatrixCell(cellId: string): CareMatrixCellEntry | null {
  if (!cachedDataset) return null;
  const existing = cachedDataset.matrixCells.find((cell) => cell.id === cellId);
  if (existing) return existing;

  const rowCol = MATRIX_ROWS.flatMap((row) =>
    MATRIX_COLUMNS.map((col) => ({ row: row.key, column: col.key, id: `${row.key}-${col.key}` }))
  ).find((entry) => entry.id === cellId);

  if (!rowCol) return null;

  return {
    id: cellId,
    row: rowCol.row,
    column: rowCol.column,
    initiatives: '',
    gaps: '',
    proposedActions: '',
    owner: '',
    dueDate: '',
    status: 'proposed',
  };
}

function bindCareEngagementEvents(): void {
  setCareEditorOnSaved(() => {
    void refreshCareEngagementView();
  });
  bindCareEngagementEditorEvents();

  document.getElementById('refreshCareEngagementBtn')?.addEventListener('click', () => {
    careEngagementHydrated = false;
    void loadCareEngagement();
  });

  document.getElementById('newCareItemBtn')?.addEventListener('click', () => {
    if (!canManageCareEngagementRecords()) return;
    void openCareItemEditor(null);
  });

  document.getElementById('logCareRecognitionBtn')?.addEventListener('click', () => {
    if (!canManageCareEngagementRecords()) return;
    void openCareRecognitionEditor(null);
  });

  document.getElementById('recordCarePulseBtn')?.addEventListener('click', () => {
    if (!canManageCareEngagementRecords()) return;
    openPulseSnapshotEditor(null);
  });

  document.getElementById('careEngagementCenterTop')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target || !cachedDataset) return;

    if (target.closest('[data-edit-care-matrix]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-edit-care-matrix]')?.getAttribute('data-edit-care-matrix');
      const cell = id ? resolveMatrixCell(id) : null;
      if (cell) openCareMatrixEditor(cell);
      return;
    }

    if (target.closest('[data-delete-care-matrix]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-delete-care-matrix]')?.getAttribute('data-delete-care-matrix');
      const cell = id ? resolveMatrixCell(id) : null;
      if (cell) {
        selectedMatrixCellId = cell.id;
        editorDeleteMatrix(cell);
      }
      return;
    }

    if (target.closest('[data-open-care-employee]')) {
      event.preventDefault();
      const employeeId = target
        .closest('[data-open-care-employee]')
        ?.getAttribute('data-open-care-employee');
      if (employeeId && typeof window.openEmployeeDrawer === 'function') {
        void window.openEmployeeDrawer(employeeId);
      }
      return;
    }

    if (target.closest('[data-edit-care-item]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-edit-care-item]')?.getAttribute('data-edit-care-item');
      const item = cachedDataset.careItems.find((row) => row.id === id);
      if (item) void openCareItemEditor(item);
      return;
    }

    if (target.closest('[data-delete-care-item]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-delete-care-item]')?.getAttribute('data-delete-care-item');
      if (id) void confirmDeleteCareItem(id);
      return;
    }

    if (target.closest('[data-edit-care-recognition]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-edit-care-recognition]')?.getAttribute('data-edit-care-recognition');
      const entry = cachedDataset.recognition.find((row) => row.id === id);
      if (entry) void openCareRecognitionEditor(entry);
      return;
    }

    if (target.closest('[data-delete-care-recognition]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-delete-care-recognition]')?.getAttribute('data-delete-care-recognition');
      if (id) void confirmDeleteRecognition(id);
      return;
    }

    if (target.closest('[data-edit-care-pulse]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-edit-care-pulse]')?.getAttribute('data-edit-care-pulse');
      const snapshot = cachedDataset.pulseSnapshots.find((row) => row.id === id);
      if (snapshot) openPulseSnapshotEditor(snapshot);
      return;
    }

    if (target.closest('[data-delete-care-pulse]')) {
      event.preventDefault();
      if (!canManageCareEngagementRecords()) return;
      const id = target.closest('[data-delete-care-pulse]')?.getAttribute('data-delete-care-pulse');
      if (id) void confirmDeletePulseSnapshot(id);
    }
  });

  document.getElementById('careMatrixBody')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest('button')) return;

    const cellTarget = target?.closest('[data-care-matrix-cell]');
    if (!cellTarget || !cachedDataset) return;
    selectedMatrixCellId = cellTarget.getAttribute('data-care-matrix-cell');
    const cell = selectedMatrixCellId ? resolveMatrixCell(selectedMatrixCellId) : null;
    renderMatrixDetail(cell);

    if (cell && event.detail === 2 && canManageCareEngagementRecords()) {
      openCareMatrixEditor(cell);
    }
  });

  document.getElementById('careMatrixBody')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = (event.target as Element | null)?.closest('[data-care-matrix-cell]');
    if (!target) return;
    event.preventDefault();
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  document.getElementById('careTrackerBody')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest('button')) return;

    const row = target?.closest('[data-care-item-id]');
    if (!row || !cachedDataset) return;
    selectedCareItemId = row.getAttribute('data-care-item-id');
    const item = cachedDataset.careItems.find((c) => c.id === selectedCareItemId) || null;
    renderCareItemDetail(item);
  });

  document.getElementById('careSearchInput')?.addEventListener('input', (event) => {
    if (!cachedDataset) return;
    const query = String((event.target as HTMLInputElement).value || '')
      .trim()
      .toLowerCase();
    const filtered = cachedDataset.careItems.filter((item) => {
      const haystack = [
        item.employeeName,
        item.department,
        item.needOrConcern,
        item.actionTaken,
        item.owner,
      ]
        .join(' ')
        .toLowerCase();
      return !query || haystack.includes(query);
    });
    const subset = { ...cachedDataset, careItems: filtered };
    renderCareTrackerTable(subset);
  });
}

function registerCareEngagementGlobals(): void {
  window.loadCareEngagement = loadCareEngagement;
  window.ensureCareEngagementLoaded = ensureCareEngagementLoaded;
  window.applyCareEngagementCenterAccess = applyCareEngagementCenterAccess;
  window.openCareEngagementView = openCareEngagementView;
  window.getCareEngagementDataset = () => cachedDataset;
}

registerCareEngagementGlobals();
bindCareEngagementEvents();
