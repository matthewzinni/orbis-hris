// Care & Engagement editor drawer (in-memory until Supabase)

import {
  clearMatrixCell,
  deleteCareItem,
  deleteEmployeeCareNote,
  deleteEmployeeFollowUp,
  deleteEmployeeResource,
  deleteRecognition,
  deleteWellnessCheckIn,
  getCareEngagementDataset,
  newCareId,
  upsertCareItem,
  upsertEmployeeCareNote,
  upsertEmployeeFollowUp,
  upsertEmployeeResource,
  upsertMatrixCell,
  upsertRecognition,
  upsertWellnessCheckIn,
} from '../data/careEngagementStore';
import { showOrbisConfirm } from '../ui/confirmModal';
import type {
  CareCellStatus,
  CareConfidentiality,
  CareItemStatus,
  CareItemType,
  CareMatrixCellEntry,
  CareRecognitionEntry,
  CareTrackerItem,
  EmployeeCareFollowUp,
  EmployeeCareNote,
  EmployeeCareResource,
  EmployeeWellnessCheckIn,
  RecognitionType,
} from '../types/careEngagementTypes';

export type CareEditorMode =
  | 'matrix'
  | 'care-item'
  | 'recognition'
  | 'employee-note'
  | 'employee-follow-up'
  | 'employee-resource'
  | 'employee-wellness';

type EditorState = {
  mode: CareEditorMode;
  recordId: string | null;
  employeeId?: string;
  matrixRow?: string;
  matrixColumn?: string;
};

let editorState: EditorState | null = null;
let onSavedCallback: (() => void) | null = null;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeGet<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function hideAllEditorFieldGroups(): void {
  const groups = [
    'careEditorMatrixFields',
    'careEditorItemFields',
    'careEditorRecognitionFields',
    'careEditorNoteFields',
    'careEditorFollowUpFields',
    'careEditorResourceFields',
    'careEditorWellnessFields',
  ];
  groups.forEach((id) => safeGet(id)?.classList.add('hidden'));
}

function setDrawerOpen(open: boolean): void {
  const drawer = safeGet<HTMLElement>('careEngagementDrawer');
  if (!drawer) return;
  drawer.classList.toggle('hidden', !open);
  drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) {
    document.body.classList.add('orbis-drawer-open');
  } else {
    document.body.classList.remove('orbis-drawer-open');
  }
}

function setDeleteVisible(visible: boolean): void {
  safeGet<HTMLElement>('deleteCareEngagementBtn')?.classList.toggle('hidden', !visible);
}

export function setCareEditorOnSaved(callback: () => void): void {
  onSavedCallback = callback;
}

function notifySaved(): void {
  onSavedCallback?.();
  if (typeof window.invalidateEmployeeCareSupportCache === 'function') {
    window.invalidateEmployeeCareSupportCache();
  }
  const employeeId = editorState?.employeeId;
  if (employeeId && typeof window.loadEmployeeCareSupport === 'function') {
    void window.loadEmployeeCareSupport(employeeId);
  }
}

export function closeCareEngagementDrawer(): void {
  editorState = null;
  setDrawerOpen(false);
  setDeleteVisible(false);
}

function openEditorDrawer(title: string, subtitle: string, mode: CareEditorMode, canDelete: boolean): void {
  setText('careEngagementDrawerTitle', title);
  setText('careEngagementDrawerSub', subtitle);
  setText('careEditorCardTitle', canDelete ? 'Edit record' : 'New record');
  hideAllEditorFieldGroups();

  const fieldMap: Record<CareEditorMode, string> = {
    matrix: 'careEditorMatrixFields',
    'care-item': 'careEditorItemFields',
    recognition: 'careEditorRecognitionFields',
    'employee-note': 'careEditorNoteFields',
    'employee-follow-up': 'careEditorFollowUpFields',
    'employee-resource': 'careEditorResourceFields',
    'employee-wellness': 'careEditorWellnessFields',
  };

  safeGet(fieldMap[mode])?.classList.remove('hidden');
  setDeleteVisible(canDelete);
  setDrawerOpen(true);
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setInputValue(id: string, value: string): void {
  const el = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  if (el) el.value = value;
}

export function openCareMatrixEditor(cell: CareMatrixCellEntry): void {
  editorState = {
    mode: 'matrix',
    recordId: cell.id,
    matrixRow: cell.row,
    matrixColumn: cell.column,
  };

  openEditorDrawer('Care Matrix Cell', `${cell.row} · ${cell.column}`, 'matrix', true);
  setInputValue('careMatrixInitiativesInput', cell.initiatives || '');
  setInputValue('careMatrixGapsInput', cell.gaps || '');
  setInputValue('careMatrixActionsInput', cell.proposedActions || '');
  setInputValue('careMatrixOwnerInput', cell.owner || '');
  setInputValue('careMatrixDueInput', cell.dueDate || '');
  setInputValue('careMatrixStatusInput', cell.status || 'proposed');
}

export function openCareItemEditor(item: CareTrackerItem | null): void {
  const isNew = !item;
  editorState = {
    mode: 'care-item',
    recordId: item?.id || null,
    employeeId: item?.employeeId,
  };

  openEditorDrawer(
    isNew ? 'New Care Item' : 'Edit Care Item',
    'Care item tracker',
    'care-item',
    !isNew
  );

  setInputValue('careItemEmployeeInput', item?.employeeName || '');
  setInputValue('careItemDepartmentInput', item?.department || '');
  setInputValue('careItemTypeInput', item?.type || 'emotional');
  setInputValue('careItemStatusInput', item?.status || 'open');
  setInputValue('careItemOwnerInput', item?.owner || '');
  setInputValue('careItemFollowUpInput', item?.followUpDate || '');
  setInputValue('careItemConfidentialityInput', item?.confidentiality || 'hr_only');
  setInputValue('careItemNeedInput', item?.needOrConcern || '');
  setInputValue('careItemActionInput', item?.actionTaken || '');
}

export function openCareRecognitionEditor(entry: CareRecognitionEntry | null): void {
  const isNew = !entry;
  editorState = {
    mode: 'recognition',
    recordId: entry?.id || null,
    employeeId: entry?.employeeId,
  };

  openEditorDrawer(
    isNew ? 'Log Recognition' : 'Edit Recognition',
    'Recognition panel',
    'recognition',
    !isNew
  );

  setInputValue('careRecEmployeeInput', entry?.employeeName || '');
  setInputValue('careRecDepartmentInput', entry?.department || '');
  setInputValue('careRecTypeInput', entry?.type || 'kudos');
  setInputValue('careRecDateInput', entry?.recognizedOn || todayIso());
  setInputValue('careRecByInput', entry?.recognizedBy || 'HR');
  setInputValue('careRecSummaryInput', entry?.summary || '');
}

export function openEmployeeCareNoteEditor(
  employeeId: string,
  note: EmployeeCareNote | null
): void {
  const isNew = !note;
  editorState = {
    mode: 'employee-note',
    recordId: note?.id || null,
    employeeId,
  };

  openEditorDrawer(isNew ? 'Add Care Note' : 'Edit Care Note', 'Employee care & support', 'employee-note', !isNew);
  setInputValue('careNoteDateInput', note?.date || todayIso());
  setInputValue('careNoteAuthorInput', note?.author || 'HR');
  setInputValue('careNoteConfidentialityInput', note?.confidentiality || 'hr_only');
  setInputValue('careNoteSummaryInput', note?.summary || '');
}

export function openEmployeeFollowUpEditor(
  employeeId: string,
  item: EmployeeCareFollowUp | null
): void {
  const isNew = !item;
  editorState = {
    mode: 'employee-follow-up',
    recordId: item?.id || null,
    employeeId,
  };

  openEditorDrawer(
    isNew ? 'Add Follow-Up' : 'Edit Follow-Up',
    'Employee care & support',
    'employee-follow-up',
    !isNew
  );
  setInputValue('careFollowUpTitleInput', item?.title || '');
  setInputValue('careFollowUpDueInput', item?.dueDate || '');
  setInputValue('careFollowUpOwnerInput', item?.owner || '');
  setInputValue('careFollowUpStatusInput', item?.status || 'open');
}

export function openEmployeeResourceEditor(
  employeeId: string,
  item: EmployeeCareResource | null
): void {
  const isNew = !item;
  editorState = {
    mode: 'employee-resource',
    recordId: item?.id || null,
    employeeId,
  };

  openEditorDrawer(
    isNew ? 'Add Resource' : 'Edit Resource',
    'Employee care & support',
    'employee-resource',
    !isNew
  );
  setInputValue('careResourceNameInput', item?.resourceName || '');
  setInputValue('careResourceDateInput', item?.sharedOn || todayIso());
  setInputValue('careResourceByInput', item?.sharedBy || 'HR');
}

export function openEmployeeWellnessEditor(
  employeeId: string,
  item: EmployeeWellnessCheckIn | null
): void {
  const isNew = !item;
  editorState = {
    mode: 'employee-wellness',
    recordId: item?.id || null,
    employeeId,
  };

  openEditorDrawer(
    isNew ? 'Add Check-In' : 'Edit Check-In',
    'Employee care & support',
    'employee-wellness',
    !isNew
  );
  setInputValue('careWellnessTypeInput', item?.type || '');
  setInputValue('careWellnessDateInput', item?.checkInDate || todayIso());
  setInputValue('careWellnessOwnerInput', item?.owner || '');
  setInputValue('careWellnessNotesInput', item?.notes || '');
}

export async function saveCareEngagementEditor(): Promise<void> {
  if (!editorState) return;

  const mode = editorState.mode;

  if (mode === 'matrix') {
    const cell: CareMatrixCellEntry = {
      id: editorState.recordId || newCareId('cell'),
      row: editorState.matrixRow as CareMatrixCellEntry['row'],
      column: editorState.matrixColumn as CareMatrixCellEntry['column'],
      initiatives: safeGet<HTMLTextAreaElement>('careMatrixInitiativesInput')?.value.trim() || '',
      gaps: safeGet<HTMLTextAreaElement>('careMatrixGapsInput')?.value.trim() || '',
      proposedActions: safeGet<HTMLTextAreaElement>('careMatrixActionsInput')?.value.trim() || '',
      owner: safeGet<HTMLInputElement>('careMatrixOwnerInput')?.value.trim() || '',
      dueDate: safeGet<HTMLInputElement>('careMatrixDueInput')?.value || '',
      status: (safeGet<HTMLSelectElement>('careMatrixStatusInput')?.value ||
        'proposed') as CareCellStatus,
    };
    upsertMatrixCell(cell);
    showToast('Care matrix cell saved.');
  }

  if (mode === 'care-item') {
    const employeeName = safeGet<HTMLInputElement>('careItemEmployeeInput')?.value.trim() || '';
    if (!employeeName) {
      showToast('Employee name is required.', 'error');
      return;
    }
    const item: CareTrackerItem = {
      id: editorState.recordId || newCareId('care'),
      employeeId: editorState.employeeId || newCareId('emp'),
      employeeName,
      department: safeGet<HTMLInputElement>('careItemDepartmentInput')?.value.trim() || '',
      type: (safeGet<HTMLSelectElement>('careItemTypeInput')?.value || 'emotional') as CareItemType,
      needOrConcern: safeGet<HTMLTextAreaElement>('careItemNeedInput')?.value.trim() || '',
      actionTaken: safeGet<HTMLTextAreaElement>('careItemActionInput')?.value.trim() || '',
      owner: safeGet<HTMLInputElement>('careItemOwnerInput')?.value.trim() || '',
      followUpDate: safeGet<HTMLInputElement>('careItemFollowUpInput')?.value || '',
      status: (safeGet<HTMLSelectElement>('careItemStatusInput')?.value || 'open') as CareItemStatus,
      confidentiality: (safeGet<HTMLSelectElement>('careItemConfidentialityInput')?.value ||
        'hr_only') as CareConfidentiality,
    };
    upsertCareItem(item);
    showToast('Care item saved.');
  }

  if (mode === 'recognition') {
    const employeeName = safeGet<HTMLInputElement>('careRecEmployeeInput')?.value.trim() || '';
    if (!employeeName) {
      showToast('Employee name is required.', 'error');
      return;
    }
    const entry: CareRecognitionEntry = {
      id: editorState.recordId || newCareId('rec'),
      employeeId: editorState.employeeId || newCareId('emp'),
      employeeName,
      department: safeGet<HTMLInputElement>('careRecDepartmentInput')?.value.trim() || '',
      type: (safeGet<HTMLSelectElement>('careRecTypeInput')?.value || 'kudos') as RecognitionType,
      summary: safeGet<HTMLTextAreaElement>('careRecSummaryInput')?.value.trim() || '',
      recognizedOn: safeGet<HTMLInputElement>('careRecDateInput')?.value || todayIso(),
      recognizedBy: safeGet<HTMLInputElement>('careRecByInput')?.value.trim() || 'HR',
    };
    upsertRecognition(entry);
    showToast('Recognition saved.');
  }

  if (mode === 'employee-note' && editorState.employeeId) {
    const summary = safeGet<HTMLTextAreaElement>('careNoteSummaryInput')?.value.trim() || '';
    if (!summary) {
      showToast('Note summary is required.', 'error');
      return;
    }
    upsertEmployeeCareNote({
      id: editorState.recordId || newCareId('note'),
      employeeId: editorState.employeeId,
      date: safeGet<HTMLInputElement>('careNoteDateInput')?.value || todayIso(),
      author: safeGet<HTMLInputElement>('careNoteAuthorInput')?.value.trim() || 'HR',
      summary,
      confidentiality: (safeGet<HTMLSelectElement>('careNoteConfidentialityInput')?.value ||
        'hr_only') as CareConfidentiality,
    });
    showToast('Care note saved.');
  }

  if (mode === 'employee-follow-up' && editorState.employeeId) {
    const title = safeGet<HTMLInputElement>('careFollowUpTitleInput')?.value.trim() || '';
    if (!title) {
      showToast('Follow-up title is required.', 'error');
      return;
    }
    upsertEmployeeFollowUp({
      id: editorState.recordId || newCareId('fu'),
      employeeId: editorState.employeeId,
      title,
      dueDate: safeGet<HTMLInputElement>('careFollowUpDueInput')?.value || '',
      owner: safeGet<HTMLInputElement>('careFollowUpOwnerInput')?.value.trim() || '',
      status: (safeGet<HTMLSelectElement>('careFollowUpStatusInput')?.value ||
        'open') as CareItemStatus,
    });
    showToast('Follow-up saved.');
  }

  if (mode === 'employee-resource' && editorState.employeeId) {
    const resourceName = safeGet<HTMLInputElement>('careResourceNameInput')?.value.trim() || '';
    if (!resourceName) {
      showToast('Resource name is required.', 'error');
      return;
    }
    upsertEmployeeResource({
      id: editorState.recordId || newCareId('res'),
      employeeId: editorState.employeeId,
      resourceName,
      sharedOn: safeGet<HTMLInputElement>('careResourceDateInput')?.value || todayIso(),
      sharedBy: safeGet<HTMLInputElement>('careResourceByInput')?.value.trim() || 'HR',
    });
    showToast('Resource saved.');
  }

  if (mode === 'employee-wellness' && editorState.employeeId) {
    upsertWellnessCheckIn({
      id: editorState.recordId || newCareId('wc'),
      employeeId: editorState.employeeId,
      checkInDate: safeGet<HTMLInputElement>('careWellnessDateInput')?.value || todayIso(),
      type: safeGet<HTMLInputElement>('careWellnessTypeInput')?.value.trim() || 'Check-in',
      notes: safeGet<HTMLTextAreaElement>('careWellnessNotesInput')?.value.trim() || '',
      owner: safeGet<HTMLInputElement>('careWellnessOwnerInput')?.value.trim() || '',
    });
    showToast('Check-in saved.');
  }

  closeCareEngagementDrawer();
  notifySaved();
}

export async function deleteCareEngagementEditor(): Promise<void> {
  if (!editorState?.recordId) return;

  const confirmed = await showOrbisConfirm(
    'Delete this record? This cannot be undone.',
    'Delete care record',
    { danger: true, confirmLabel: 'Delete' }
  );

  if (!confirmed) return;

  const { mode, recordId } = editorState;

  if (mode === 'matrix') {
    clearMatrixCell(recordId);
    showToast('Matrix cell cleared.');
  } else if (mode === 'care-item') {
    deleteCareItem(recordId);
    showToast('Care item deleted.');
  } else if (mode === 'recognition') {
    deleteRecognition(recordId);
    showToast('Recognition deleted.');
  } else if (mode === 'employee-note') {
    deleteEmployeeCareNote(recordId);
    showToast('Care note deleted.');
  } else if (mode === 'employee-follow-up') {
    deleteEmployeeFollowUp(recordId);
    showToast('Follow-up deleted.');
  } else if (mode === 'employee-resource') {
    deleteEmployeeResource(recordId);
    showToast('Resource deleted.');
  } else if (mode === 'employee-wellness') {
    deleteWellnessCheckIn(recordId);
    showToast('Check-in deleted.');
  }

  closeCareEngagementDrawer();
  notifySaved();
}

let editorEventsBound = false;

export function bindCareEngagementEditorEvents(): void {
  if (editorEventsBound) return;
  editorEventsBound = true;

  document.getElementById('careEngagementDrawerClose')?.addEventListener('click', closeCareEngagementDrawer);
  document.getElementById('cancelCareEngagementBtn')?.addEventListener('click', closeCareEngagementDrawer);
  document.getElementById('saveCareEngagementBtn')?.addEventListener('click', () => {
    void saveCareEngagementEditor();
  });
  document.getElementById('deleteCareEngagementBtn')?.addEventListener('click', () => {
    void deleteCareEngagementEditor();
  });
}

declare global {
  interface Window {
    closeCareEngagementDrawer?: () => void;
    invalidateEmployeeCareSupportCache?: () => void;
    loadEmployeeCareSupport?: (employeeId: string) => Promise<void>;
  }
}

window.closeCareEngagementDrawer = closeCareEngagementDrawer;

// Ensure dataset export for debugging
export function readCareDataset() {
  return getCareEngagementDataset();
}
