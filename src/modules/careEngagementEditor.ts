// Care & Engagement editor drawer (Supabase-backed)

import {
  clearMatrixCell,
  deleteCareItem,
  deleteEmployeeCareNote,
  deleteEmployeeFollowUp,
  deleteEmployeeResource,
  deleteRecognition,
  deletePulseSnapshot,
  deleteWellnessCheckIn,
  invalidateCareEngagementCache,
  upsertPulseSnapshot,
  upsertCareItem,
  upsertEmployeeCareNote,
  upsertEmployeeFollowUp,
  upsertEmployeeResource,
  upsertMatrixCell,
  upsertRecognition,
  upsertWellnessCheckIn,
} from '../data/careEngagementStore';
import { clampPulseScore } from '../services/carePulseUtils';
import {
  bindCareEmployeeSelectAutoFill,
  ensureCareEmployeeRosterLoaded,
  findCareEmployeeById,
  populateCareEmployeeSelect,
  readCareEmployeeSelect,
  resolveStoredCareEmployeeId,
} from '../services/careEmployeePicker';
import { applyCareConfidentialitySelectHelp } from '../services/careConfidentiality';
import {
  canManageCareEngagementRecords,
  canViewCareEngagementDetails,
} from '../services/careEngagementAccess';
import {
  formatCareEmployeeAuditLabel,
  recordCareEmployeeAudit,
  recordCareProgramAudit,
} from '../services/careEngagementAudit';
import { showOrbisConfirm } from '../ui/confirmModal';
import type {
  CareCellStatus,
  CareConfidentiality,
  CareItemStatus,
  CareItemType,
  CareMatrixCellEntry,
  CareRecognitionEntry,
  CarePulseSurveySnapshot,
  CareTrackerItem,
  EmployeeCareFollowUp,
  EmployeeCareNote,
  EmployeeCareResource,
  EmployeeWellnessCheckIn,
  RecognitionType,
} from '../types/careEngagementTypes';
import {
  stopAllDictation,
  updateCareDictationTargets,
  type DictationTargetOption,
} from './dictation';

export type CareEditorMode =
  | 'matrix'
  | 'care-item'
  | 'recognition'
  | 'pulse-snapshot'
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

const CARE_DICTATION_TARGETS: Partial<Record<CareEditorMode, DictationTargetOption[]>> = {
  matrix: [
    { id: 'careMatrixInitiativesInput', label: 'Current initiatives' },
    { id: 'careMatrixGapsInput', label: 'Identified gaps' },
    { id: 'careMatrixActionsInput', label: 'Proposed actions' },
  ],
  'care-item': [
    { id: 'careItemNeedInput', label: 'Need or concern' },
    { id: 'careItemActionInput', label: 'Action taken' },
  ],
  recognition: [{ id: 'careRecSummaryInput', label: 'Recognition summary' }],
  'pulse-snapshot': [{ id: 'carePulseCommentsInput', label: 'Themes / comments summary' }],
  'employee-note': [{ id: 'careNoteSummaryInput', label: 'Care note summary' }],
  'employee-wellness': [{ id: 'careWellnessNotesInput', label: 'Check-in notes' }],
};

function syncCareDictationForMode(mode: CareEditorMode): void {
  updateCareDictationTargets(CARE_DICTATION_TARGETS[mode] || []);
}

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

function assertCanMutateCareEditor(): boolean {
  if (!editorState) return false;
  const mode = editorState.mode;
  if (mode === 'matrix' || mode === 'care-item' || mode === 'recognition' || mode === 'pulse-snapshot') {
    if (!canManageCareEngagementRecords()) {
      showToast(
        'HR admin access is required to change Care & Engagement program records.',
        'error'
      );
      return false;
    }
    return true;
  }
  if (!canViewCareEngagementDetails()) {
    showToast('HR admin access is required to change employee care records.', 'error');
    return false;
  }
  return true;
}

function hideAllEditorFieldGroups(): void {
  const groups = [
    'careEditorMatrixFields',
    'careEditorItemFields',
    'careEditorRecognitionFields',
    'careEditorPulseFields',
    'careEditorNoteFields',
    'careEditorFollowUpFields',
    'careEditorResourceFields',
    'careEditorWellnessFields',
  ];
  groups.forEach((id) => safeGet(id)?.classList.add('hidden'));
}

const OTHER_DRAWER_IDS = [
  'employeeDrawer',
  'candidateDrawer',
  'investigationDrawer',
  'operationsIssueDrawer',
] as const;

function isDrawerVisiblyOpen(drawerId: string): boolean {
  const drawer = safeGet(drawerId);
  if (!drawer) return false;
  return drawer.classList.contains('open') || drawer.getAttribute('aria-hidden') === 'false';
}

export function isCareEngagementDrawerOpen(): boolean {
  return isDrawerVisiblyOpen('careEngagementDrawer');
}

function hideOtherDrawers(): void {
  OTHER_DRAWER_IDS.forEach((id) => {
    const drawer = safeGet(id);
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.removeAttribute('style');
  });
}

function applyCareDrawerOpenStyles(drawer: HTMLElement): void {
  const backdrop = safeGet('drawerBackdrop');
  hideOtherDrawers();

  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.classList.remove('hidden');
    backdrop.removeAttribute('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
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
  drawer.style.setProperty('width', 'min(760px, 94vw)', 'important');
  drawer.style.setProperty('max-width', '94vw', 'important');
  drawer.style.setProperty('z-index', '99999', 'important');

  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';
}

function applyCareDrawerCloseStyles(drawer: HTMLElement): void {
  const backdrop = safeGet('drawerBackdrop');

  drawer.classList.remove('open');
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.removeAttribute('style');

  const anotherDrawerOpen = OTHER_DRAWER_IDS.some((id) => isDrawerVisiblyOpen(id));

  if (backdrop && !anotherDrawerOpen) {
    backdrop.classList.remove('open');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.removeAttribute('style');
  }

  if (!anotherDrawerOpen) {
    document.body.classList.remove('orbis-drawer-open');
    document.body.style.overflow = '';
  }
}

function setDrawerOpen(open: boolean): void {
  const drawer = safeGet<HTMLElement>('careEngagementDrawer');
  if (!drawer) {
    if (open) {
      showToast('Could not open care editor. Refresh and try again.', 'error');
    }
    return;
  }

  if (open) {
    applyCareDrawerOpenStyles(drawer);
    drawer.querySelector('.drawer-body')?.scrollTo(0, 0);
    return;
  }

  applyCareDrawerCloseStyles(drawer);
}

function setDeleteVisible(visible: boolean): void {
  safeGet<HTMLElement>('deleteCareEngagementBtn')?.classList.toggle('hidden', !visible);
}

export function setCareEditorOnSaved(callback: () => void): void {
  onSavedCallback = callback;
}

function notifySaved(): void {
  invalidateCareEngagementCache();
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
  stopAllDictation();
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
    'pulse-snapshot': 'careEditorPulseFields',
    'employee-note': 'careEditorNoteFields',
    'employee-follow-up': 'careEditorFollowUpFields',
    'employee-resource': 'careEditorResourceFields',
    'employee-wellness': 'careEditorWellnessFields',
  };

  safeGet(fieldMap[mode])?.classList.remove('hidden');
  setDeleteVisible(canDelete);
  setDrawerOpen(true);
  syncCareDictationForMode(mode);
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
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to edit the care matrix.', 'error');
    return;
  }
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

export async function openCareItemEditor(
  item: CareTrackerItem | null,
  presetEmployeeId = ''
): Promise<void> {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to add or edit care items.', 'error');
    return;
  }
  await ensureCareEmployeeRosterLoaded();

  const isNew = !item;
  const selectedEmployeeId =
    presetEmployeeId ||
    resolveStoredCareEmployeeId(item?.employeeId || '', item?.employeeName || '');

  editorState = {
    mode: 'care-item',
    recordId: item?.id || null,
    employeeId: selectedEmployeeId || item?.employeeId,
  };

  openEditorDrawer(
    isNew ? 'New Care Item' : 'Edit Care Item',
    'Care item tracker',
    'care-item',
    !isNew
  );

  populateCareEmployeeSelect('careItemEmployeeInput', selectedEmployeeId);
  const selectedEmployee = findCareEmployeeById(selectedEmployeeId);
  setInputValue(
    'careItemDepartmentInput',
    item?.department || (selectedEmployee ? String(selectedEmployee.department || selectedEmployee.dept || '') : '')
  );
  setInputValue('careItemTypeInput', item?.type || 'emotional');
  setInputValue('careItemStatusInput', item?.status || 'open');
  setInputValue('careItemOwnerInput', item?.owner || '');
  setInputValue('careItemFollowUpInput', item?.followUpDate || '');
  setInputValue('careItemConfidentialityInput', item?.confidentiality || 'hr_only');
  setInputValue('careItemNeedInput', item?.needOrConcern || '');
  setInputValue('careItemActionInput', item?.actionTaken || '');
}

export async function openCareRecognitionEditor(
  entry: CareRecognitionEntry | null,
  presetEmployeeId = ''
): Promise<void> {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to log or edit recognition.', 'error');
    return;
  }
  await ensureCareEmployeeRosterLoaded();

  const isNew = !entry;
  const selectedEmployeeId =
    presetEmployeeId ||
    resolveStoredCareEmployeeId(entry?.employeeId || '', entry?.employeeName || '');

  editorState = {
    mode: 'recognition',
    recordId: entry?.id || null,
    employeeId: selectedEmployeeId || entry?.employeeId,
  };

  openEditorDrawer(
    isNew ? 'Log Recognition' : 'Edit Recognition',
    'Recognition panel',
    'recognition',
    !isNew
  );

  populateCareEmployeeSelect('careRecEmployeeInput', selectedEmployeeId);
  const selectedEmployee = findCareEmployeeById(selectedEmployeeId);
  setInputValue(
    'careRecDepartmentInput',
    entry?.department || (selectedEmployee ? String(selectedEmployee.department || selectedEmployee.dept || '') : '')
  );
  setInputValue('careRecTypeInput', entry?.type || 'kudos');
  setInputValue('careRecDateInput', entry?.recognizedOn || todayIso());
  setInputValue('careRecByInput', entry?.recognizedBy || 'HR');
  setInputValue('careRecSummaryInput', entry?.summary || '');
}

export function openPulseSnapshotEditor(snapshot: CarePulseSurveySnapshot | null): void {
  if (!canManageCareEngagementRecords()) {
    showToast('HR admin access is required to record or edit pulse results.', 'error');
    return;
  }
  const isNew = !snapshot?.id;
  editorState = {
    mode: 'pulse-snapshot',
    recordId: snapshot?.id || null,
  };

  openEditorDrawer(
    isNew ? 'Record Pulse Results' : 'Edit Pulse Snapshot',
    'Aggregate survey scores (1–5)',
    'pulse-snapshot',
    !isNew
  );

  setInputValue('carePulsePeriodInput', snapshot?.periodLabel || '');
  setInputValue(
    'carePulseResponseCountInput',
    snapshot?.responseCount ? String(snapshot.responseCount) : ''
  );
  setInputValue('carePulseOverallInput', snapshot ? String(snapshot.overallSupport) : '');
  setInputValue('carePulseWorkloadInput', snapshot ? String(snapshot.workloadStress) : '');
  setInputValue('carePulseCommunicationInput', snapshot ? String(snapshot.communication) : '');
  setInputValue('carePulseRecognitionInput', snapshot ? String(snapshot.recognition) : '');
  setInputValue('carePulseBelongingInput', snapshot ? String(snapshot.belonging) : '');
  setInputValue('carePulseCommentsInput', snapshot?.commentsSummary || '');
}

export function openEmployeeCareNoteEditor(
  employeeId: string,
  note: EmployeeCareNote | null
): void {
  if (!canViewCareEngagementDetails()) {
    showToast('HR admin access is required to edit employee care records.', 'error');
    return;
  }
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
  if (!canViewCareEngagementDetails()) {
    showToast('HR admin access is required to edit employee care records.', 'error');
    return;
  }
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
  if (!canViewCareEngagementDetails()) {
    showToast('HR admin access is required to edit employee care records.', 'error');
    return;
  }
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
  if (!canViewCareEngagementDetails()) {
    showToast('HR admin access is required to edit employee care records.', 'error');
    return;
  }
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
  if (!assertCanMutateCareEditor()) return;

  stopAllDictation();

  const mode = editorState.mode;

  try {
  if (mode === 'matrix') {
    const cell: CareMatrixCellEntry = {
      id: editorState.recordId || '',
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
    await upsertMatrixCell(cell);
    await recordCareProgramAudit(
      editorState.recordId ? 'Care Matrix Updated' : 'Care Matrix Planned',
      `${cell.row} · ${cell.column} · status ${cell.status}${cell.owner ? ` · owner ${cell.owner}` : ''}`
    );
    showToast('Care matrix cell saved.');
  }

  if (mode === 'care-item') {
    const employee = readCareEmployeeSelect('careItemEmployeeInput');
    if (!employee.employeeId) {
      showToast('Select an employee.', 'error');
      return;
    }
    const item: CareTrackerItem = {
      id: editorState.recordId || '',
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      department:
        safeGet<HTMLInputElement>('careItemDepartmentInput')?.value.trim() ||
        employee.department,
      type: (safeGet<HTMLSelectElement>('careItemTypeInput')?.value || 'emotional') as CareItemType,
      needOrConcern: safeGet<HTMLTextAreaElement>('careItemNeedInput')?.value.trim() || '',
      actionTaken: safeGet<HTMLTextAreaElement>('careItemActionInput')?.value.trim() || '',
      owner: safeGet<HTMLInputElement>('careItemOwnerInput')?.value.trim() || '',
      followUpDate: safeGet<HTMLInputElement>('careItemFollowUpInput')?.value || '',
      status: (safeGet<HTMLSelectElement>('careItemStatusInput')?.value || 'open') as CareItemStatus,
      confidentiality: (safeGet<HTMLSelectElement>('careItemConfidentialityInput')?.value ||
        'hr_only') as CareConfidentiality,
    };
    await upsertCareItem(item);
    await recordCareEmployeeAudit(
      editorState.recordId ? 'Care Item Updated' : 'Care Item Created',
      item.employeeId,
      item.employeeName,
      `${item.type} · ${item.status} · ${item.needOrConcern || 'No summary'}`
    );
    showToast('Care item saved.');
  }

  if (mode === 'pulse-snapshot') {
    const periodLabel = safeGet<HTMLInputElement>('carePulsePeriodInput')?.value.trim() || '';
    if (!periodLabel) {
      showToast('Period label is required (e.g. Q3 2026 Pulse).', 'error');
      return;
    }

    const snapshot: CarePulseSurveySnapshot = {
      id: editorState.recordId || '',
      periodLabel,
      responseCount: Math.max(
        0,
        Number.parseInt(safeGet<HTMLInputElement>('carePulseResponseCountInput')?.value || '0', 10) ||
          0
      ),
      overallSupport: clampPulseScore(
        safeGet<HTMLInputElement>('carePulseOverallInput')?.value
      ),
      workloadStress: clampPulseScore(
        safeGet<HTMLInputElement>('carePulseWorkloadInput')?.value
      ),
      communication: clampPulseScore(
        safeGet<HTMLInputElement>('carePulseCommunicationInput')?.value
      ),
      recognition: clampPulseScore(
        safeGet<HTMLInputElement>('carePulseRecognitionInput')?.value
      ),
      belonging: clampPulseScore(safeGet<HTMLInputElement>('carePulseBelongingInput')?.value),
      commentsSummary:
        safeGet<HTMLTextAreaElement>('carePulseCommentsInput')?.value.trim() || '',
    };

    await upsertPulseSnapshot(snapshot);
    await recordCareProgramAudit(
      editorState.recordId ? 'Pulse Snapshot Updated' : 'Pulse Snapshot Recorded',
      `${snapshot.periodLabel} · ${snapshot.responseCount} responses · support ${snapshot.overallSupport}`
    );
    showToast('Pulse snapshot saved.');
  }

  if (mode === 'recognition') {
    const employee = readCareEmployeeSelect('careRecEmployeeInput');
    if (!employee.employeeId) {
      showToast('Select an employee.', 'error');
      return;
    }
    const entry: CareRecognitionEntry = {
      id: editorState.recordId || '',
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      department:
        safeGet<HTMLInputElement>('careRecDepartmentInput')?.value.trim() ||
        employee.department,
      type: (safeGet<HTMLSelectElement>('careRecTypeInput')?.value || 'kudos') as RecognitionType,
      summary: safeGet<HTMLTextAreaElement>('careRecSummaryInput')?.value.trim() || '',
      recognizedOn: safeGet<HTMLInputElement>('careRecDateInput')?.value || todayIso(),
      recognizedBy: safeGet<HTMLInputElement>('careRecByInput')?.value.trim() || 'HR',
    };
    await upsertRecognition(entry);
    await recordCareEmployeeAudit(
      editorState.recordId ? 'Recognition Updated' : 'Recognition Logged',
      entry.employeeId,
      entry.employeeName,
      `${entry.type} · ${entry.summary || 'No summary'}`
    );
    showToast('Recognition saved.');
  }

  if (mode === 'employee-note' && editorState.employeeId) {
    const summary = safeGet<HTMLTextAreaElement>('careNoteSummaryInput')?.value.trim() || '';
    if (!summary) {
      showToast('Note summary is required.', 'error');
      return;
    }
    await upsertEmployeeCareNote({
      id: editorState.recordId || '',
      employeeId: editorState.employeeId,
      date: safeGet<HTMLInputElement>('careNoteDateInput')?.value || todayIso(),
      author: safeGet<HTMLInputElement>('careNoteAuthorInput')?.value.trim() || 'HR',
      summary,
      confidentiality: (safeGet<HTMLSelectElement>('careNoteConfidentialityInput')?.value ||
        'hr_only') as CareConfidentiality,
    });
    await recordCareEmployeeAudit(
      editorState.recordId ? 'Care Note Updated' : 'Care Note Added',
      editorState.employeeId,
      formatCareEmployeeAuditLabel(editorState.employeeId, ''),
      summary
    );
    showToast('Care note saved.');
  }

  if (mode === 'employee-follow-up' && editorState.employeeId) {
    const title = safeGet<HTMLInputElement>('careFollowUpTitleInput')?.value.trim() || '';
    if (!title) {
      showToast('Follow-up title is required.', 'error');
      return;
    }
    await upsertEmployeeFollowUp({
      id: editorState.recordId || '',
      employeeId: editorState.employeeId,
      title,
      dueDate: safeGet<HTMLInputElement>('careFollowUpDueInput')?.value || '',
      owner: safeGet<HTMLInputElement>('careFollowUpOwnerInput')?.value.trim() || '',
      status: (safeGet<HTMLSelectElement>('careFollowUpStatusInput')?.value ||
        'open') as CareItemStatus,
    });
    await recordCareEmployeeAudit(
      editorState.recordId ? 'Care Follow-Up Updated' : 'Care Follow-Up Added',
      editorState.employeeId,
      formatCareEmployeeAuditLabel(editorState.employeeId, ''),
      `${title} · ${safeGet<HTMLInputElement>('careFollowUpDueInput')?.value || 'no due date'}`
    );
    showToast('Follow-up saved.');
  }

  if (mode === 'employee-resource' && editorState.employeeId) {
    const resourceName = safeGet<HTMLInputElement>('careResourceNameInput')?.value.trim() || '';
    if (!resourceName) {
      showToast('Resource name is required.', 'error');
      return;
    }
    await upsertEmployeeResource({
      id: editorState.recordId || '',
      employeeId: editorState.employeeId,
      resourceName,
      sharedOn: safeGet<HTMLInputElement>('careResourceDateInput')?.value || todayIso(),
      sharedBy: safeGet<HTMLInputElement>('careResourceByInput')?.value.trim() || 'HR',
    });
    await recordCareEmployeeAudit(
      editorState.recordId ? 'Care Resource Updated' : 'Care Resource Shared',
      editorState.employeeId,
      formatCareEmployeeAuditLabel(editorState.employeeId, ''),
      resourceName
    );
    showToast('Resource saved.');
  }

  if (mode === 'employee-wellness' && editorState.employeeId) {
    const wellnessType =
      safeGet<HTMLInputElement>('careWellnessTypeInput')?.value.trim() || 'Check-in';
    const wellnessNotes =
      safeGet<HTMLTextAreaElement>('careWellnessNotesInput')?.value.trim() || '';

    await upsertWellnessCheckIn({
      id: editorState.recordId || '',
      employeeId: editorState.employeeId,
      checkInDate: safeGet<HTMLInputElement>('careWellnessDateInput')?.value || todayIso(),
      type: wellnessType,
      notes: wellnessNotes,
      owner: safeGet<HTMLInputElement>('careWellnessOwnerInput')?.value.trim() || '',
    });
    await recordCareEmployeeAudit(
      editorState.recordId ? 'Wellness Check-In Updated' : 'Wellness Check-In Added',
      editorState.employeeId,
      formatCareEmployeeAuditLabel(editorState.employeeId, ''),
      `${wellnessType}${wellnessNotes ? ` · ${wellnessNotes}` : ''}`
    );
    showToast('Check-in saved.');
  }

  closeCareEngagementDrawer();
  notifySaved();
  } catch (err) {
    console.error('[CareEngagement] Save failed:', err);
    showToast('Could not save care record. Check Supabase migration and admin access.', 'error');
  }
}

export async function deleteCareEngagementEditor(): Promise<void> {
  if (!editorState?.recordId) return;
  if (!assertCanMutateCareEditor()) return;

  const confirmed = await showOrbisConfirm(
    'Delete this record? This cannot be undone.',
    { title: 'Delete care record', danger: true, confirmLabel: 'Delete' }
  );

  if (!confirmed) return;

  const { mode, recordId } = editorState;

  try {
    if (mode === 'matrix') {
      const row = editorState.matrixRow || '';
      const column = editorState.matrixColumn || '';
      await clearMatrixCell(
        recordId,
        editorState.matrixRow as CareMatrixCellEntry['row'],
        editorState.matrixColumn as CareMatrixCellEntry['column']
      );
      await recordCareProgramAudit('Care Matrix Cleared', `${row} · ${column}`);
      showToast('Matrix cell cleared.');
    } else if (mode === 'pulse-snapshot') {
      await deletePulseSnapshot(recordId);
      await recordCareProgramAudit('Pulse Snapshot Deleted', `Record ${recordId}`);
      showToast('Pulse snapshot deleted.');
    } else if (mode === 'care-item') {
      await deleteCareItem(recordId);
      await recordCareProgramAudit('Care Item Deleted', `Record ${recordId}`);
      showToast('Care item deleted.');
    } else if (mode === 'recognition') {
      await deleteRecognition(recordId);
      await recordCareProgramAudit('Recognition Deleted', `Record ${recordId}`);
      showToast('Recognition deleted.');
    } else if (mode === 'employee-note') {
      await deleteEmployeeCareNote(recordId);
      if (editorState.employeeId) {
        await recordCareEmployeeAudit(
          'Care Note Deleted',
          editorState.employeeId,
          formatCareEmployeeAuditLabel(editorState.employeeId, ''),
          `Record ${recordId}`
        );
      }
      showToast('Care note deleted.');
    } else if (mode === 'employee-follow-up') {
      await deleteEmployeeFollowUp(recordId);
      if (editorState.employeeId) {
        await recordCareEmployeeAudit(
          'Care Follow-Up Deleted',
          editorState.employeeId,
          formatCareEmployeeAuditLabel(editorState.employeeId, ''),
          `Record ${recordId}`
        );
      }
      showToast('Follow-up deleted.');
    } else if (mode === 'employee-resource') {
      await deleteEmployeeResource(recordId);
      if (editorState.employeeId) {
        await recordCareEmployeeAudit(
          'Care Resource Deleted',
          editorState.employeeId,
          formatCareEmployeeAuditLabel(editorState.employeeId, ''),
          `Record ${recordId}`
        );
      }
      showToast('Resource deleted.');
    } else if (mode === 'employee-wellness') {
      await deleteWellnessCheckIn(recordId);
      if (editorState.employeeId) {
        await recordCareEmployeeAudit(
          'Wellness Check-In Deleted',
          editorState.employeeId,
          formatCareEmployeeAuditLabel(editorState.employeeId, ''),
          `Record ${recordId}`
        );
      }
      showToast('Check-in deleted.');
    }

    closeCareEngagementDrawer();
    notifySaved();
  } catch (err) {
    console.error('[CareEngagement] Delete failed:', err);
    showToast('Could not delete care record.', 'error');
  }
}

let editorEventsBound = false;

export function bindCareEngagementEditorEvents(): void {
  if (editorEventsBound) return;
  editorEventsBound = true;

  const previousCloseActiveDrawer = window.closeActiveDrawer;
  window.closeActiveDrawer = () => {
    if (isCareEngagementDrawerOpen()) {
      closeCareEngagementDrawer();
      return;
    }
    previousCloseActiveDrawer?.();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isCareEngagementDrawerOpen()) return;
    event.preventDefault();
    closeCareEngagementDrawer();
  });

  document.getElementById('careEngagementDrawerClose')?.addEventListener('click', closeCareEngagementDrawer);
  document.getElementById('cancelCareEngagementBtn')?.addEventListener('click', closeCareEngagementDrawer);
  document.getElementById('saveCareEngagementBtn')?.addEventListener('click', () => {
    void saveCareEngagementEditor();
  });
  document.getElementById('deleteCareEngagementBtn')?.addEventListener('click', () => {
    void deleteCareEngagementEditor();
  });

  bindCareEmployeeSelectAutoFill('careItemEmployeeInput', 'careItemDepartmentInput');
  bindCareEmployeeSelectAutoFill('careRecEmployeeInput', 'careRecDepartmentInput');

  applyCareConfidentialitySelectHelp('careItemConfidentialityInput');
  applyCareConfidentialitySelectHelp('careNoteConfidentialityInput');
}

window.closeCareEngagementDrawer = closeCareEngagementDrawer;

