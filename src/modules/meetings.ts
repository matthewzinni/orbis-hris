import { initMeetingDictation, stopMeetingDictation } from './dictation';
import {
  clearRecordEditModeUi,
  deleteEmployeeRecordRow,
  getDrawerEmployee,
  getEmployeeId,
  loadEmployeeRecordHistory,
  renderBasicDashboardKpisIfAvailable,
  saveEmployeeRecordRow,
  setDrawerInputValue,
  setRecordEditModeUi,
  bindHistoryItemActions,
  type EmployeeRecordRow,
} from '../services/employeeRecordCrud';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';

interface MeetingRecord extends EmployeeRecordRow {
  meeting_date?: string;
  meeting_type?: string;
  subject?: string;
  follow_up_date?: string | null;
  notes?: string;
}

const TABLE = 'employee_meetings';
const EDIT_UI = {
  saveButtonId: 'saveMeetingBtn',
  saveLabel: 'Save Meeting Record',
  updateLabel: 'Update Meeting Record',
  cancelButtonId: 'cancelMeetingEditBtn',
  editStatusId: 'meetingEditStatus',
  editStatusText: 'Editing saved meeting record',
};

let currentMeetingId: string | null = null;

function resetMeetingForm(): void {
  setDrawerInputValue('meetingDate', todayInputValue());
  setDrawerInputValue('meetingType', '');
  setDrawerInputValue('meetingSubject', '');
  setDrawerInputValue('meetingFollowUpDate', '');
  setDrawerInputValue('meetingNotes', '');

  const consentCheck = safeGet<HTMLInputElement>('meetingDictationConsentCheck');
  if (consentCheck) consentCheck.checked = false;
}

function buildMeetingPayload(employeeId: string): MeetingRecord {
  return {
    employee_id: employeeId,
    meeting_date: safeGet<HTMLInputElement>('meetingDate')?.value || todayInputValue(),
    meeting_type: safeGet<HTMLInputElement>('meetingType')?.value || '',
    subject: safeGet<HTMLInputElement>('meetingSubject')?.value || '',
    follow_up_date: safeGet<HTMLInputElement>('meetingFollowUpDate')?.value || null,
    notes: safeGet<HTMLTextAreaElement>('meetingNotes')?.value || '',
  };
}

function renderMeetingRows(rows: MeetingRecord[]): string {
  return rows
    .map(
      (row) => `
            <div class="history-item" data-meeting-id="${esc(row.id || '')}">
              <div class="history-top">
                <div>
                  <strong>${esc(row.meeting_type || 'Meeting Record')}</strong>
                  <span>${esc(row.meeting_date || row.created_at || '')}</span>
                </div>

                <div style="display:flex; gap:6px; align-items:center;">
                  <button class="button soft sm" type="button" data-edit-meeting-id="${esc(row.id || '')}">Edit</button>
                  <button class="button danger sm" type="button" data-delete-meeting-id="${esc(row.id || '')}">Delete</button>
                </div>
              </div>

              <div class="history-body">
                <strong>Subject:</strong><br>
                ${esc(row.subject || '')}

                <br><br>

                <strong>Notes:</strong><br>
                ${nl2br(row.notes || '')}

                <br><br>

                <strong>Follow-Up Date:</strong><br>
                ${esc(row.follow_up_date || '')}
              </div>
            </div>
          `
    )
    .join('');
}

async function refreshMeetingDependentUi(employeeId: string): Promise<void> {
  await loadEmployeeMeetings(employeeId);
  renderBasicDashboardKpisIfAvailable();
}

export async function loadEmployeeMeetings(employeeId: string): Promise<void> {
  await loadEmployeeRecordHistory<MeetingRecord>({
    historyContainerId: 'meetingsHistory',
    table: TABLE,
    employeeId,
    logPrefix: 'Meetings',
    loadingMessage: 'Loading meetings...',
    noEmployeeMessage: 'Open an employee to view meetings.',
    emptyMessage: 'No meeting records found for this employee.',
    errorMessage: 'Could not load meeting records.',
    dateFields: ['meeting_date', 'created_at'],
    renderRows: renderMeetingRows,
    bindActions: (container, rows, reloadEmployeeId) => {
      bindHistoryItemActions({
        container,
        rows,
        editDataAttribute: 'data-edit-meeting-id',
        deleteDataAttribute: 'data-delete-meeting-id',
        getRowId: (row) => String(row.id || ''),
        onEdit: editMeetingRecord,
        onDelete: (rowId) => deleteMeetingRecord(rowId, reloadEmployeeId),
      });
    },
  });
}

export function editMeetingRecord(record: MeetingRecord): void {
  if (!record) return;

  currentMeetingId = record.id || null;
  window.currentMeetingId = currentMeetingId;

  setDrawerInputValue('meetingDate', record.meeting_date || todayInputValue());
  setDrawerInputValue('meetingType', record.meeting_type || '');
  setDrawerInputValue('meetingSubject', record.subject || '');
  setDrawerInputValue('meetingFollowUpDate', record.follow_up_date || '');
  setDrawerInputValue('meetingNotes', record.notes || '');

  setRecordEditModeUi(EDIT_UI);
  showToast('Meeting record loaded for editing.');
}

export function cancelMeetingEdit(): void {
  stopMeetingDictation();

  currentMeetingId = null;
  window.currentMeetingId = null;

  resetMeetingForm();
  clearRecordEditModeUi(EDIT_UI);
  showToast('Meeting edit cancelled.');
}

export async function deleteMeetingRecord(meetingId: string, employeeId: string): Promise<void> {
  const deleted = await deleteEmployeeRecordRow(
    TABLE,
    meetingId,
    { message: 'Delete this meeting record?', title: 'Delete meeting' },
    'Meetings'
  );

  if (!deleted) return;

  showToast('Meeting record deleted.');

  if (String(currentMeetingId || '') === String(meetingId)) {
    currentMeetingId = null;
    window.currentMeetingId = null;
    clearRecordEditModeUi(EDIT_UI);
  }

  await refreshMeetingDependentUi(employeeId);
}

export async function saveMeetingRecord(): Promise<void> {
  stopMeetingDictation();

  const employeeId = getEmployeeId(getDrawerEmployee());
  if (!employeeId) {
    showToast('Open an employee before saving a meeting record.', 'error');
    return;
  }

  const meetingPayload = buildMeetingPayload(employeeId);
  if (!meetingPayload.meeting_type && !meetingPayload.notes) {
    showToast('Enter a meeting type or notes before saving.', 'error');
    return;
  }

  const meetingId = currentMeetingId || window.currentMeetingId;
  const result = await saveEmployeeRecordRow<MeetingRecord>(
    TABLE,
    meetingPayload,
    meetingId,
    {
      logPrefix: 'Meetings',
      stripMissingColumns: false,
      updateMatch: meetingId ? { employee_id: employeeId } : undefined,
    }
  );

  if (result.error) {
    console.error('Meeting save failed:', result.error);
    showToast(result.error.message || 'Could not save meeting record.', 'error');
    return;
  }

  const savedMeeting = Array.isArray(result.data)
    ? (result.data[0] as MeetingRecord | undefined)
    : undefined;
  const reloadEmployeeId = String(savedMeeting?.employee_id || employeeId);

  showToast(meetingId ? 'Meeting record updated.' : 'Meeting record saved.');

  currentMeetingId = null;
  window.currentMeetingId = null;
  clearRecordEditModeUi(EDIT_UI);
  resetMeetingForm();

  await refreshMeetingDependentUi(reloadEmployeeId);
}

initMeetingDictation();

window.saveMeetingRecord = saveMeetingRecord;
window.saveMeeting = saveMeetingRecord;
window.loadEmployeeMeetings = loadEmployeeMeetings;
window.loadMeetingRecords = loadEmployeeMeetings;
window.editMeetingRecord = editMeetingRecord;
window.deleteMeetingRecord = deleteMeetingRecord;
window.cancelMeetingEdit = cancelMeetingEdit;
