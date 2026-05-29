// Employee drawer — Care & Support tab (HR/admin, Supabase-backed)

import {
  deleteCareItem,
  deleteEmployeeCareNote,
  deleteEmployeeFollowUp,
  deleteEmployeeResource,
  deleteWellnessCheckIn,
  fetchCareEngagementDataset,
  invalidateCareEngagementCache,
} from '../data/careEngagementStore';
import {
  findCareEmployeeById,
  resolveCareEmployeeId,
} from '../services/careEmployeePicker';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  bindCareEngagementEditorEvents,
  openCareItemEditor,
  openEmployeeCareNoteEditor,
  openEmployeeFollowUpEditor,
  openEmployeeResourceEditor,
  openEmployeeWellnessEditor,
  setCareEditorOnSaved,
} from './careEngagementEditor';
import {
  canManageCareEngagementRecords,
  canViewCareEngagementDetails,
} from '../services/careEngagementAccess';
import { employeeDisplayName } from '../services/employeeUtils';
import type { CareEngagementDataset } from '../types/careEngagementTypes';

type EmployeeLike = Record<string, unknown>;

let drawerEventsBound = false;

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function resolveEmployeeKeys(employee: EmployeeLike): string[] {
  return [employee.dbId, employee.id, employee.employee_id, employee.displayId]
    .filter(Boolean)
    .map(String);
}

function resolveEmployeeId(employee: EmployeeLike): string {
  return String(
    employee.dbId || employee.id || employee.employee_id || employee.displayId || ''
  ).trim();
}

function itemMatchesEmployee(
  itemEmployeeId: string,
  employee: EmployeeLike,
  itemEmployeeName = ''
): boolean {
  const targetId = resolveCareEmployeeId(employee);
  if (!targetId) return false;

  const storedEmployee = findCareEmployeeById(itemEmployeeId);
  if (storedEmployee) {
    return resolveCareEmployeeId(storedEmployee) === targetId;
  }

  const keys = resolveEmployeeKeys(employee).map(String);
  const id = String(itemEmployeeId || '').trim();
  if (id && keys.includes(id)) return true;

  const rosterName = employeeDisplayName(employee).trim().toLowerCase();
  const itemName = String(itemEmployeeName || '').trim().toLowerCase();
  return Boolean(rosterName && itemName && rosterName === itemName);
}

function careTypeLabel(type: string): string {
  if (type === 'spiritual') return 'Spiritual / Values-Based';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function careItemStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

const RECOGNITION_LABELS: Record<string, string> = {
  kudos: 'Kudos',
  iron_shift: 'Iron Shift',
  work_anniversary: 'Anniversary',
  above_and_beyond: 'Above & Beyond',
  peer_recognition: 'Peer Recognition',
};

function renderList(targetId: string, html: string, emptyMessage: string): void {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = html || `<div class="empty">${esc(emptyMessage)}</div>`;
}

function actionButtons(editAttr: string, editId: string, deleteAttr: string): string {
  return `
    <div class="toolbar" style="margin-top:8px;gap:8px;">
      <button type="button" class="button soft sm" data-${editAttr}="${esc(editId)}">Edit</button>
      <button type="button" class="button danger sm" data-${deleteAttr}="${esc(editId)}">Delete</button>
    </div>
  `;
}

export function invalidateEmployeeCareSupportCache(): void {
  invalidateCareEngagementCache();
}

function bindDrawerCareEvents(employeeId: string): void {
  if (drawerEventsBound) return;
  drawerEventsBound = true;

  setCareEditorOnSaved(() => {
    void loadEmployeeCareSupport(employeeId);
  });

  if (!document.getElementById('careEngagementDrawer')) return;

  const panel = document.getElementById('tab-care-support');
  if (!panel) return;

  panel.addEventListener('click', (event) => {
    void handleCareSupportPanelClick(event);
  });
}

async function handleCareSupportPanelClick(event: Event): Promise<void> {
    const target = event.target as Element | null;
    if (!target) return;

    const employee =
      typeof window.getCurrentEmployeeForOrbis === 'function'
        ? window.getCurrentEmployeeForOrbis()
        : window.currentEmployee;

    if (!employee) return;

    const recordId = resolveEmployeeId(employee);
    const dataset = await fetchCareEngagementDataset(true);

    if (target.closest('[data-add-care-item]')) {
      void openCareItemEditor(null, recordId);
      return;
    }

    const editCareItemId = target
      .closest('[data-edit-care-item]')
      ?.getAttribute('data-edit-care-item');
    if (editCareItemId) {
      const item = dataset.careItems.find((row) => row.id === editCareItemId);
      if (item) void openCareItemEditor(item);
      return;
    }

    const deleteCareItemId = target
      .closest('[data-delete-care-item]')
      ?.getAttribute('data-delete-care-item');
    if (deleteCareItemId) {
      void confirmDeleteDrawerRecord(
        'care item',
        async () => deleteCareItem(deleteCareItemId),
        recordId
      );
      return;
    }

    if (target.closest('[data-add-care-note]')) {
      openEmployeeCareNoteEditor(recordId, null);
      return;
    }
    if (target.closest('[data-add-care-follow-up]')) {
      openEmployeeFollowUpEditor(recordId, null);
      return;
    }
    if (target.closest('[data-add-care-resource]')) {
      openEmployeeResourceEditor(recordId, null);
      return;
    }
    if (target.closest('[data-add-care-wellness]')) {
      openEmployeeWellnessEditor(recordId, null);
      return;
    }

    const editNoteId = target.closest('[data-edit-care-note]')?.getAttribute('data-edit-care-note');
    if (editNoteId) {
      const note = dataset.employeeNotes.find((row) => row.id === editNoteId);
      if (note) openEmployeeCareNoteEditor(recordId, note);
      return;
    }

    const deleteNoteId = target
      .closest('[data-delete-care-note]')
      ?.getAttribute('data-delete-care-note');
    if (deleteNoteId) {
      void confirmDeleteDrawerRecord(
        'care note',
        async () => deleteEmployeeCareNote(deleteNoteId),
        recordId
      );
      return;
    }

    const editFuId = target
      .closest('[data-edit-care-follow-up]')
      ?.getAttribute('data-edit-care-follow-up');
    if (editFuId) {
      const item = dataset.followUps.find((row) => row.id === editFuId);
      if (item) openEmployeeFollowUpEditor(recordId, item);
      return;
    }

    const deleteFuId = target
      .closest('[data-delete-care-follow-up]')
      ?.getAttribute('data-delete-care-follow-up');
    if (deleteFuId) {
      void confirmDeleteDrawerRecord(
        'follow-up',
        async () => deleteEmployeeFollowUp(deleteFuId),
        recordId
      );
      return;
    }

    const editResId = target
      .closest('[data-edit-care-resource]')
      ?.getAttribute('data-edit-care-resource');
    if (editResId) {
      const item = dataset.resources.find((row) => row.id === editResId);
      if (item) openEmployeeResourceEditor(recordId, item);
      return;
    }

    const deleteResId = target
      .closest('[data-delete-care-resource]')
      ?.getAttribute('data-delete-care-resource');
    if (deleteResId) {
      void confirmDeleteDrawerRecord(
        'resource',
        async () => deleteEmployeeResource(deleteResId),
        recordId
      );
      return;
    }

    const editWcId = target
      .closest('[data-edit-care-wellness]')
      ?.getAttribute('data-edit-care-wellness');
    if (editWcId) {
      const item = dataset.wellnessCheckIns.find((row) => row.id === editWcId);
      if (item) openEmployeeWellnessEditor(recordId, item);
      return;
    }

    const deleteWcId = target
      .closest('[data-delete-care-wellness]')
      ?.getAttribute('data-delete-care-wellness');
    if (deleteWcId) {
      void confirmDeleteDrawerRecord(
        'check-in',
        async () => deleteWellnessCheckIn(deleteWcId),
        recordId
      );
    }
}

async function confirmDeleteDrawerRecord(
  label: string,
  onDelete: () => void | Promise<void>,
  employeeId: string
): Promise<void> {
  const confirmed = await showOrbisConfirm(`Delete this ${label}?`, `Delete ${label}`, {
    danger: true,
    confirmLabel: 'Delete',
  });
  if (!confirmed) return;
  await onDelete();
  invalidateEmployeeCareSupportCache();
  if (typeof window.ensureCareEngagementLoaded === 'function') {
    window.ensureCareEngagementLoaded(true);
  }
  await loadEmployeeCareSupport(employeeId);
}

bindCareEngagementEditorEvents();

export async function loadEmployeeCareSupport(employeeId: string): Promise<void> {
  const notesEl = document.getElementById('employeeCareNotesList');
  if (!notesEl) return;

  if (!canViewCareEngagementDetails()) {
    renderList('employeeCareNotesList', '', 'Care & Support is available to HR administrators only.');
    return;
  }

  const employee =
    typeof window.getCurrentEmployeeForOrbis === 'function'
      ? window.getCurrentEmployeeForOrbis()
      : window.currentEmployee;

  if (!employee) {
    renderList('employeeCareNotesList', '', 'Open an employee to view care & support history.');
    return;
  }

  const recordId = String(employeeId || resolveEmployeeId(employee)).trim();
  if (!recordId) {
    renderList('employeeCareNotesList', '', 'Employee record not found.');
    return;
  }

  bindDrawerCareEvents(recordId);

  const loadingHtml = '<div class="empty">Loading care & support...</div>';
  notesEl.innerHTML = loadingHtml;
  const itemsListEl = document.getElementById('employeeCareItemsList');
  if (itemsListEl) itemsListEl.innerHTML = loadingHtml;

  try {
    const dataset = await fetchCareEngagementDataset(true);

    const careItems = dataset.careItems.filter((item) =>
      itemMatchesEmployee(item.employeeId, employee, item.employeeName)
    );
    const notes = dataset.employeeNotes.filter((n) => itemMatchesEmployee(n.employeeId, employee));
    const followUps = dataset.followUps.filter((f) => itemMatchesEmployee(f.employeeId, employee));
    const recognition = dataset.recognition.filter((r) => itemMatchesEmployee(r.employeeId, employee));
    const resources = dataset.resources.filter((r) => itemMatchesEmployee(r.employeeId, employee));
    const wellness = dataset.wellnessCheckIns.filter((w) =>
      itemMatchesEmployee(w.employeeId, employee)
    );

    const name = employeeDisplayName(employee);
    const canManage = canManageCareEngagementRecords();

    const sectionHeader = (title: string, addAttr: string) => `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>${esc(title)}</strong>
        <button type="button" class="button soft sm" data-${addAttr}="1">Add</button>
      </div>
    `;

    renderList(
      'employeeCareItemsList',
      `${canManage ? sectionHeader('Care items', 'add-care-item') : '<strong>Care items</strong>'}${careItems
        .map((item) => {
          const actions = canManage
            ? actionButtons('edit-care-item', item.id, 'delete-care-item', item.id)
            : '';
          return `
        <div class="history-item">
          <div class="history-title">${esc(careTypeLabel(item.type))}
            <span class="care-confidentiality-pill ${esc(item.confidentiality)}">${esc(item.confidentiality.replace(/_/g, ' '))}</span>
          </div>
          <div class="history-body">
            <strong>Need:</strong> ${esc(item.needOrConcern || '—')}<br />
            ${item.actionTaken ? `<strong>Action:</strong> ${esc(item.actionTaken)}<br />` : ''}
            <strong>Owner:</strong> ${esc(item.owner || '—')} ·
            <strong>Follow-up:</strong> ${esc(formatDate(item.followUpDate))} ·
            ${esc(careItemStatusLabel(item.status))}
          </div>
          ${actions}
        </div>
      `;
        })
        .join('')}`,
      `No care items in the tracker for ${name} yet.`
    );

    renderList(
      'employeeCareNotesList',
      `${sectionHeader('Care notes', 'add-care-note')}${notes
        .map(
          (note) => `
        <div class="history-item">
          <div class="history-title">${esc(formatDate(note.date))} · ${esc(note.author)}
            <span class="care-confidentiality-pill ${esc(note.confidentiality)}">${esc(note.confidentiality.replace(/_/g, ' '))}</span>
          </div>
          <div class="history-body">${esc(note.summary)}</div>
          ${actionButtons('edit-care-note', note.id, 'delete-care-note', note.id)}
        </div>
      `
        )
        .join('')}`,
      `No care notes for ${name} yet.`
    );

    renderList(
      'employeeCareFollowUpsList',
      `${sectionHeader('Follow-ups', 'add-care-follow-up')}${followUps
        .map(
          (item) => `
        <div class="history-item">
          <div class="history-title">${esc(item.title)}</div>
          <div class="history-body">Due ${esc(formatDate(item.dueDate))} · Owner: ${esc(item.owner)} · ${esc(item.status.replace(/_/g, ' '))}</div>
          ${actionButtons('edit-care-follow-up', item.id, 'delete-care-follow-up', item.id)}
        </div>
      `
        )
        .join('')}`,
      'No follow-up items scheduled.'
    );

    renderList(
      'employeeCareRecognitionList',
      recognition
        .map(
          (entry) => `
        <div class="history-item">
          <div class="history-title">${esc(RECOGNITION_LABELS[entry.type] || entry.type)}</div>
          <div class="history-body">${esc(entry.summary)}</div>
          <small class="muted">${esc(formatDate(entry.recognizedOn))} · ${esc(entry.recognizedBy)}</small>
        </div>
      `
        )
        .join(''),
      'No recognition history logged.'
    );

    renderList(
      'employeeCareResourcesList',
      `${sectionHeader('Resources', 'add-care-resource')}${resources
        .map(
          (res) => `
        <div class="history-item">
          <div class="history-title">${esc(res.resourceName)}</div>
          <small class="muted">Shared ${esc(formatDate(res.sharedOn))} by ${esc(res.sharedBy)}</small>
          ${actionButtons('edit-care-resource', res.id, 'delete-care-resource', res.id)}
        </div>
      `
        )
        .join('')}`,
      'No support resources shared yet.'
    );

    renderList(
      'employeeCareWellnessList',
      `${sectionHeader('Wellness check-ins', 'add-care-wellness')}${wellness
        .map(
          (check) => `
        <div class="history-item">
          <div class="history-title">${esc(check.type)}</div>
          <div class="history-body">${esc(check.notes)}</div>
          <small class="muted">${esc(formatDate(check.checkInDate))} · ${esc(check.owner)}</small>
          ${actionButtons('edit-care-wellness', check.id, 'delete-care-wellness', check.id)}
        </div>
      `
        )
        .join('')}`,
      'No wellness or check-in history yet.'
    );
  } catch (err) {
    console.error('[EmployeeCareSupport] Load failed:', err);
    renderList('employeeCareNotesList', '', 'Could not load care & support data.');
  }
}

declare global {
  interface Window {
    loadEmployeeCareSupport?: (employeeId: string) => Promise<void>;
    invalidateEmployeeCareSupportCache?: () => void;
    ensureCareEngagementLoaded?: (force?: boolean) => void;
    getCurrentEmployeeForOrbis?: () => EmployeeLike | null;
    currentEmployee?: EmployeeLike | null;
  }
}

window.loadEmployeeCareSupport = loadEmployeeCareSupport;
window.invalidateEmployeeCareSupportCache = invalidateEmployeeCareSupportCache;
