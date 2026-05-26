// ============================================
// Care & Engagement — culture, support, retention intelligence
// ============================================

import {
  clearMatrixCell,
  deleteCareItem,
  deleteRecognition,
  fetchCareEngagementDataset,
  getCareEngagementDataset,
} from '../data/careEngagementStore';
import {
  bindCareEngagementEditorEvents,
  openCareItemEditor,
  openCareMatrixEditor,
  openCareRecognitionEditor,
  setCareEditorOnSaved,
} from './careEngagementEditor';
import { canAccessCareEngagementCenter } from '../services/careEngagementAccess';
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
      <div class="toolbar" style="margin-top:12px;gap:8px;">
        <button type="button" class="button soft sm" data-edit-care-matrix="${esc(cell.id)}">Edit</button>
        <button type="button" class="button danger sm" data-delete-care-matrix="${esc(cell.id)}">Clear cell</button>
      </div>
      <p class="muted" style="margin:12px 0 0;font-size:0.8rem;">In-memory demo — wire to <code>care_matrix_cells</code> in Supabase later.</p>
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

  if (count) {
    count.textContent = `${items.length} care item${items.length === 1 ? '' : 's'}`;
  }

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty">No care items logged.</td></tr>';
    return;
  }

  body.innerHTML = items
    .map(
      (item) => `
      <tr class="care-item-row" data-care-item-id="${esc(item.id)}" tabindex="0">
        <td>${esc(item.employeeName)}</td>
        <td>${esc(item.department)}</td>
        <td>${esc(careTypeLabel(item.type))}</td>
        <td>${esc(item.needOrConcern)}</td>
        <td>${esc(item.actionTaken)}</td>
        <td>${esc(item.owner)}</td>
        <td>${esc(formatDate(item.followUpDate))}</td>
        <td>${esc(careItemStatusLabel(item.status))}</td>
        <td><span class="care-confidentiality-pill ${esc(item.confidentiality)}">${esc(item.confidentiality.replace(/_/g, ' '))}</span></td>
        <td>
          <button type="button" class="button soft sm" data-edit-care-item="${esc(item.id)}">Edit</button>
          <button type="button" class="button danger sm" data-delete-care-item="${esc(item.id)}">Delete</button>
        </td>
      </tr>
    `
    )
    .join('');
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
      <div class="toolbar" style="margin-top:12px;gap:8px;">
        <button type="button" class="button soft sm" data-edit-care-item="${esc(item.id)}">Edit</button>
        <button type="button" class="button danger sm" data-delete-care-item="${esc(item.id)}">Delete</button>
      </div>
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

  if (!dataset.recognition.length) {
    list.innerHTML = '<div class="empty">No recognition logged this period.</div>';
    return;
  }

  list.innerHTML = dataset.recognition
    .map(
      (entry) => `
      <div class="history-item" data-care-recognition-id="${esc(entry.id)}">
        <div class="history-title">${esc(RECOGNITION_LABELS[entry.type] || entry.type)} · ${esc(entry.employeeName)}</div>
        <div class="history-body">${esc(entry.summary)}</div>
        <small class="muted">${esc(entry.department)} · ${esc(formatDate(entry.recognizedOn))} · ${esc(entry.recognizedBy)}</small>
        <div class="toolbar" style="margin-top:8px;gap:8px;">
          <button type="button" class="button soft sm" data-edit-care-recognition="${esc(entry.id)}">Edit</button>
          <button type="button" class="button danger sm" data-delete-care-recognition="${esc(entry.id)}">Delete</button>
        </div>
      </div>
    `
    )
    .join('');
}

function renderPulseSection(dataset: CareEngagementDataset): void {
  const pulse = dataset.pulse;
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

  setText('carePulsePeriod', pulse.periodLabel);
  setText('carePulseResponses', `${pulse.responseCount} responses (anonymous demo)`);
  setText('carePulseComments', pulse.commentsSummary);
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
}

export async function loadCareEngagement(): Promise<void> {
  if (!canAccessCareEngagementCenter()) {
    applyCareEngagementCenterAccess();
    return;
  }

  applyCareEngagementCenterAccess();

  try {
    await fetchCareEngagementDataset();
    cachedDataset = getCareEngagementDataset();
    renderCareEngagementPage(cachedDataset);
    careEngagementHydrated = true;
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
  const confirmed = await showOrbisConfirm('Delete this care item?', 'Delete care item', {
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;
  deleteCareItem(itemId);
  selectedCareItemId = null;
  showToast('Care item deleted.');
  refreshCareEngagementView();
}

async function confirmDeleteRecognition(entryId: string): Promise<void> {
  const confirmed = await showOrbisConfirm('Delete this recognition entry?', 'Delete recognition', {
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;
  deleteRecognition(entryId);
  showToast('Recognition deleted.');
  refreshCareEngagementView();
}

async function editorDeleteMatrix(cell: CareMatrixCellEntry): Promise<void> {
  const confirmed = await showOrbisConfirm(
    'Clear this matrix cell? Initiatives and gaps will be removed.',
    'Clear matrix cell',
    { danger: true, confirmLabel: 'Clear' }
  );
  if (!confirmed) return;

  if (cachedDataset?.matrixCells.some((entry) => entry.id === cell.id)) {
    clearMatrixCell(cell.id);
  }

  selectedMatrixCellId = null;
  showToast('Matrix cell cleared.');
  refreshCareEngagementView();
}

function refreshCareEngagementView(): void {
  cachedDataset = getCareEngagementDataset();
  if (!cachedDataset) return;
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
  setCareEditorOnSaved(() => refreshCareEngagementView());
  bindCareEngagementEditorEvents();

  document.getElementById('refreshCareEngagementBtn')?.addEventListener('click', () => {
    careEngagementHydrated = false;
    void loadCareEngagement();
  });

  document.getElementById('newCareItemBtn')?.addEventListener('click', () => {
    openCareItemEditor(null);
  });

  document.getElementById('logCareRecognitionBtn')?.addEventListener('click', () => {
    openCareRecognitionEditor(null);
  });

  document.getElementById('careEngagementCenterTop')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target || !cachedDataset) return;

    if (target.closest('[data-edit-care-matrix]')) {
      event.preventDefault();
      const id = target.closest('[data-edit-care-matrix]')?.getAttribute('data-edit-care-matrix');
      const cell = id ? resolveMatrixCell(id) : null;
      if (cell) openCareMatrixEditor(cell);
      return;
    }

    if (target.closest('[data-delete-care-matrix]')) {
      event.preventDefault();
      const id = target.closest('[data-delete-care-matrix]')?.getAttribute('data-delete-care-matrix');
      const cell = id ? resolveMatrixCell(id) : null;
      if (cell) {
        selectedMatrixCellId = cell.id;
        editorDeleteMatrix(cell);
      }
      return;
    }

    if (target.closest('[data-edit-care-item]')) {
      event.preventDefault();
      const id = target.closest('[data-edit-care-item]')?.getAttribute('data-edit-care-item');
      const item = cachedDataset.careItems.find((row) => row.id === id);
      if (item) openCareItemEditor(item);
      return;
    }

    if (target.closest('[data-delete-care-item]')) {
      event.preventDefault();
      const id = target.closest('[data-delete-care-item]')?.getAttribute('data-delete-care-item');
      if (id) void confirmDeleteCareItem(id);
      return;
    }

    if (target.closest('[data-edit-care-recognition]')) {
      event.preventDefault();
      const id = target.closest('[data-edit-care-recognition]')?.getAttribute('data-edit-care-recognition');
      const entry = cachedDataset.recognition.find((row) => row.id === id);
      if (entry) openCareRecognitionEditor(entry);
      return;
    }

    if (target.closest('[data-delete-care-recognition]')) {
      event.preventDefault();
      const id = target.closest('[data-delete-care-recognition]')?.getAttribute('data-delete-care-recognition');
      if (id) void confirmDeleteRecognition(id);
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

declare global {
  interface Window {
    loadCareEngagement?: () => Promise<void>;
    ensureCareEngagementLoaded?: (force?: boolean) => void;
    applyCareEngagementCenterAccess?: () => void;
    openCareEngagementView?: () => void;
    getCareEngagementDataset?: () => CareEngagementDataset | null;
  }
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
