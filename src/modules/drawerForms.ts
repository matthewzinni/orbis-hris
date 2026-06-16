// Reset drawer tab forms when opening/closing employee drawer

import { stopAllDictation } from './dictation';

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function todayInputValue(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }
  return new Date().toISOString().slice(0, 10);
}

export function getEmployeeAdminPanel(): HTMLElement | null {
  return (
    document.querySelector('#employeeDrawer #tab-employee') ||
    document.getElementById('tab-employee')
  );
}

function setFieldValue(id: string, value: string): void {
  const el = safeGet(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (el) el.value = value;
}

/** Clears add/edit forms on drawer tabs (not Employee Admin). */
export function resetDrawerEntryForms(): void {
  setFieldValue('noteDate', todayInputValue());
  setFieldValue('noteType', '');
  setFieldValue('noteText', '');
  setFieldValue('disciplineDate', todayInputValue());
  setFieldValue('disciplineType', '');
  setFieldValue('disciplineLevel', '');
  setFieldValue('disciplineDescription', '');
  setFieldValue('disciplineAction', '');
  setFieldValue('disciplineStatus', 'Open');

  if (typeof window.sanitizeDisciplineAutofillLeak === 'function') {
    window.sanitizeDisciplineAutofillLeak(true);
  }

  setFieldValue('incidentDate', todayInputValue());
  setFieldValue('incidentType', '');
  setFieldValue('incidentLocation', '');
  setFieldValue('incidentDescription', '');
  setFieldValue('incidentFollowUp', '');
  setFieldValue('incidentStatus', 'Open');
  stopAllDictation();
  setFieldValue('meetingDate', todayInputValue());
  setFieldValue('meetingType', '');
  setFieldValue('meetingSubject', '');
  setFieldValue('meetingNotes', '');
  setFieldValue('meetingFollowUpDate', '');
  setFieldValue('reviewDate', todayInputValue());
  setFieldValue('reviewType', '');
  setFieldValue('reviewAttendance', '');
  setFieldValue('reviewPerformance', '');
  setFieldValue('reviewTeamwork', '');
  setFieldValue('reviewAttitude', '');
  setFieldValue('reviewReliability', '');
  setFieldValue('reviewOverallResult', '');
  setFieldValue('reviewStrengths', '');
  setFieldValue('reviewImprovements', '');
  setFieldValue('reviewEmployeeComments', '');
  setFieldValue('reviewManagerComments', '');
  setFieldValue('stayInterviewDate', todayInputValue());
  setFieldValue('stayInterviewType', '');
  setFieldValue('stayQ1', '');
  setFieldValue('stayQ2', '');
  setFieldValue('stayQ3', '');
  setFieldValue('stayQ4', '');
  setFieldValue('stayQ5', '');
  setFieldValue('stayQ6', '');
  setFieldValue('stayQ7', '');
  setFieldValue('stayManagerSummary', '');

  window.currentDisciplineReportId = null;
  window.currentIncidentReportId = null;
  window.currentStayInterviewId = null;
  window.currentNoteId = null;
  window.currentMeetingId = null;
  window.currentReviewId = null;
  window.reviewAttachmentContextId = null;
}

export function resetDrawerForms(): void {
  const preserveCreateMode = Boolean(window.isCreatingEmployee);

  resetDrawerEntryForms();

  if (typeof window.resetEmergencyContactForm === 'function') {
    window.resetEmergencyContactForm();
  }

  setFieldValue('atRiskReasonInput', '');
  setFieldValue('impactPlayerReasonInput', '');

  window.currentManualAtRiskState = { flagged: false, reason: '' };
  window.currentManualImpactPlayerState = { flagged: false, reason: '' };

  window.isCreatingEmployee = preserveCreateMode;

  const saveLabels: [string, string][] = [
    ['saveDisciplineBtn', 'Save Discipline Report'],
    ['saveIncidentBtn', 'Save Incident Report'],
    ['saveStayInterviewBtn', 'Save Stay Interview'],
    ['saveNoteBtn', 'Save Note'],
    ['saveMeetingBtn', 'Save Meeting'],
    ['saveReviewBtn', 'Save Review'],
  ];
  saveLabels.forEach(([id, label]) => {
    const btn = safeGet(id);
    if (btn) btn.textContent = label;
  });

  [
    'cancelDisciplineEditBtn',
    'disciplineEditStatus',
    'cancelIncidentEditBtn',
    'incidentEditStatus',
    'cancelStayInterviewEditBtn',
    'stayInterviewEditStatus',
    'cancelMeetingEditBtn',
    'meetingEditStatus',
    'cancelReviewEditBtn',
    'reviewEditStatus',
  ].forEach((id) => safeGet(id)?.classList.add('hidden'));
}

window.getEmployeeAdminPanel = getEmployeeAdminPanel;
window.resetDrawerEntryForms = resetDrawerEntryForms;
window.resetDrawerForms = resetDrawerForms;
