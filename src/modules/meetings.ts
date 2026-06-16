import { supabaseClient } from '../services/supabaseClient';
import { initMeetingDictation, stopMeetingDictation } from './dictation';
import { showOrbisConfirm } from '../ui/confirmModal';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';

interface MeetingRecord {
  id?: string;
  employee_id?: string;
  meeting_date?: string;
  meeting_type?: string;
  subject?: string;
  follow_up_date?: string | null;
  notes?: string;
  created_at?: string;
  created_by?: string;
  [key: string]: unknown;
}

interface MeetingEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  first_name?: string;
  last_name?: string;
  first?: string;
  last?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    currentEmployee?: MeetingEmployee;
    currentMeetingId?: string | null;

    loadEmployeeMeetings?: (employeeId: string) => Promise<void>;
    loadMeetingRecords?: (employeeId: string) => Promise<void>;

    saveMeetingRecord?: () => Promise<void>;
    saveMeeting?: () => Promise<void>;

    editMeetingRecord?: (record: MeetingRecord) => void;

    deleteMeetingRecord?: (recordId: string, employeeId: string) => Promise<void>;
    cancelMeetingEdit?: () => void;

    showToast?: (message: string, type?: string) => void;

    safeGet?: (id: string) => HTMLElement | null;

    todayInputValue?: () => string;

    getCurrentEmployeeForOrbis?: () => MeetingEmployee | null;

    renderBasicDashboardKpis?: () => void;

  }
}

let currentMeetingId: string | null = null;

function getCurrentEmployee(): MeetingEmployee | null {
  if (typeof window.getCurrentEmployeeForOrbis === 'function') {
    return window.getCurrentEmployeeForOrbis();
  }

  return window.currentEmployee || null;
}

function getEmployeeId(employee: MeetingEmployee | null): string {
  return String(
    employee?.dbId || employee?.employee_id || employee?.id || employee?.displayId || ''
  );
}

function getEmployeeLookupIds(employee: MeetingEmployee | null, fallbackId?: string): string[] {
  return [employee?.dbId, employee?.employee_id, employee?.id, employee?.displayId, fallbackId]
    .filter(Boolean)
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function setInputValue(id: string, value: unknown): void {
  const input = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);

  if (!input) return;

  input.value = String(value ?? '');
}

async function refreshMeetingDependentUi(employeeId: string): Promise<void> {
  await loadEmployeeMeetings(employeeId);

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export async function loadEmployeeMeetings(employeeId: string): Promise<void> {
  const target = safeGet('meetingsHistory');

  if (!target) {
    console.warn('[Meetings] meetingsHistory container not found.');
    return;
  }

  target.innerHTML = '<div class="empty">Loading meetings...</div>';

  try {
    const activeEmployee = getCurrentEmployee();

    const primaryEmployeeId = String(employeeId || getEmployeeId(activeEmployee) || '').trim();

    const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

    if (!primaryEmployeeId && !employeeIds.length) {
      target.innerHTML = '<div class="empty">Open an employee to view meetings.</div>';
      return;
    }

    const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];

    const { data, error } = await supabaseClient
      .from('employee_meetings')
      .select('*')
      .in('employee_id', idsToSearch);

    if (error) {
      console.error('[Meetings] Could not load meeting records:', error);
      target.innerHTML = '<div class="empty">Could not load meeting records.</div>';
      return;
    }

    const rows = ((data || []) as MeetingRecord[]).sort((a, b) => {
      const dateA = String(a.meeting_date || a.created_at || '');
      const dateB = String(b.meeting_date || b.created_at || '');
      return dateB.localeCompare(dateA);
    });

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No meeting records found for this employee.</div>';
      return;
    }

    target.innerHTML = rows
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

    target.querySelectorAll<HTMLButtonElement>('[data-edit-meeting-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const meetingId = button.dataset.editMeetingId;
        const record = rows.find((row) => String(row.id) === String(meetingId));
        if (!record) return;
        editMeetingRecord(record);
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-delete-meeting-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const meetingId = button.dataset.deleteMeetingId;
        if (!meetingId) return;
        await deleteMeetingRecord(meetingId, primaryEmployeeId || idsToSearch[0]);
      });
    });
  } catch (err) {
    console.error('[Meetings] Unexpected meeting history failure:', err);
    target.innerHTML = '<div class="empty">Could not load meeting records.</div>';
  }
}

export function editMeetingRecord(record: MeetingRecord): void {
  if (!record) return;

  currentMeetingId = record.id || null;
  window.currentMeetingId = currentMeetingId;

  setInputValue('meetingDate', record.meeting_date || todayInputValue());
  setInputValue('meetingType', record.meeting_type || '');
  setInputValue('meetingSubject', record.subject || '');
  setInputValue('meetingFollowUpDate', record.follow_up_date || '');
  setInputValue('meetingNotes', record.notes || '');

  const saveButton = safeGet('saveMeetingBtn');

  if (saveButton) {
    saveButton.textContent = 'Update Meeting Record';
  }

  const editStatus = safeGet('meetingEditStatus');

  if (editStatus) {
    editStatus.textContent = 'Editing saved meeting record';
    editStatus.classList.remove('hidden');
  }

  safeGet('cancelMeetingEditBtn')?.classList.remove('hidden');
  showToast('Meeting record loaded for editing.');
}

export function cancelMeetingEdit(): void {
  stopMeetingDictation();

  currentMeetingId = null;
  window.currentMeetingId = null;

  setInputValue('meetingDate', todayInputValue());
  setInputValue('meetingType', '');
  setInputValue('meetingSubject', '');
  setInputValue('meetingFollowUpDate', '');
  setInputValue('meetingNotes', '');

  const saveButton = safeGet('saveMeetingBtn');
  if (saveButton) {
    saveButton.textContent = 'Save Meeting';
  }

  safeGet('cancelMeetingEditBtn')?.classList.add('hidden');
  safeGet('meetingEditStatus')?.classList.add('hidden');

  const consentCheck = safeGet<HTMLInputElement>('meetingDictationConsentCheck');
  if (consentCheck) {
    consentCheck.checked = false;
  }

  showToast('Meeting edit cancelled.');
}

export async function deleteMeetingRecord(meetingId: string, employeeId: string): Promise<void> {
  if (!meetingId) return;

  if (
    !(await showOrbisConfirm('Delete this meeting record?', {
      title: 'Delete meeting',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const { error } = await supabaseClient.from('employee_meetings').delete().eq('id', meetingId);

  if (error) {
    console.error('Meeting delete failed:', error);
    showToast(error.message || 'Could not delete meeting record.', 'error');
    return;
  }

  showToast('Meeting record deleted.');

  if (String(currentMeetingId || '') === String(meetingId)) {
    currentMeetingId = null;
    window.currentMeetingId = null;

    const saveButton = safeGet('saveMeetingBtn');

    if (saveButton) {
      saveButton.textContent = 'Save Meeting Record';
    }
  }

  await refreshMeetingDependentUi(employeeId);
}

export async function saveMeetingRecord(): Promise<void> {
  stopMeetingDictation();

  const activeEmployee = getCurrentEmployee();
  const employeeId = getEmployeeId(activeEmployee);

  if (!employeeId) {
    showToast('Open an employee before saving a meeting record.', 'error');
    return;
  }

  const meetingPayload: MeetingRecord = {
    employee_id: employeeId,
    meeting_date: safeGet<HTMLInputElement>('meetingDate')?.value || todayInputValue(),
    meeting_type: safeGet<HTMLInputElement>('meetingType')?.value || '',
    subject: safeGet<HTMLInputElement>('meetingSubject')?.value || '',
    follow_up_date: safeGet<HTMLInputElement>('meetingFollowUpDate')?.value || null,
    notes: safeGet<HTMLTextAreaElement>('meetingNotes')?.value || '',
  };

  if (!meetingPayload.meeting_type && !meetingPayload.notes) {
    showToast('Enter a meeting type or notes before saving.', 'error');
    return;
  }

  const meetingId = currentMeetingId || window.currentMeetingId;

  const saveMeetingPayload = async (payloadToSave: MeetingRecord) => {
    if (meetingId) {
      return supabaseClient
        .from('employee_meetings')
        .update(payloadToSave)
        .eq('id', meetingId)
        .select();
    }

    return supabaseClient.from('employee_meetings').insert([payloadToSave]).select();
  };

  const cleanPayload: MeetingRecord = {
    ...meetingPayload,
  };

  const result = await saveMeetingPayload(cleanPayload);

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

  const saveButton = safeGet('saveMeetingBtn');

  if (saveButton) {
    saveButton.textContent = 'Save Meeting Record';
  }

  safeGet('cancelMeetingEditBtn')?.classList.add('hidden');
  safeGet('meetingEditStatus')?.classList.add('hidden');

  setInputValue('meetingDate', todayInputValue());
  setInputValue('meetingType', '');
  setInputValue('meetingSubject', '');
  setInputValue('meetingFollowUpDate', '');
  setInputValue('meetingNotes', '');

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