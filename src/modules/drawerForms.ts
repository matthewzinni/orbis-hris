// Reset drawer tab forms when opening/closing employee drawer

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

export function resetDrawerForms(): void {
  const setValue = (id: string, value: string) => {
    const el = safeGet(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (el) el.value = value;
  };

  setValue('noteDate', todayInputValue());
  setValue('noteType', '');
  setValue('noteText', '');
  setValue('disciplineDate', todayInputValue());
  setValue('disciplineType', '');
  setValue('disciplineLevel', '');
  setValue('disciplineDescription', '');
  setValue('disciplineAction', '');
  setValue('disciplineStatus', 'Open');

  if (typeof window.sanitizeDisciplineAutofillLeak === 'function') {
    window.sanitizeDisciplineAutofillLeak(true);
  }

  setValue('incidentDate', todayInputValue());
  setValue('incidentType', '');
  setValue('incidentLocation', '');
  setValue('incidentDescription', '');
  setValue('incidentFollowUp', '');
  setValue('incidentStatus', 'Open');
  setValue('meetingDate', todayInputValue());
  setValue('meetingType', '');
  setValue('meetingSubject', '');
  setValue('meetingNotes', '');
  setValue('reviewDate', todayInputValue());
  setValue('reviewType', '');
  setValue('reviewAttendance', '');
  setValue('reviewPerformance', '');
  setValue('reviewTeamwork', '');
  setValue('reviewAttitude', '');
  setValue('reviewReliability', '');
  setValue('reviewOverallResult', '');
  setValue('reviewStrengths', '');
  setValue('reviewImprovements', '');
  setValue('reviewEmployeeComments', '');
  setValue('reviewManagerComments', '');
  setValue('stayInterviewDate', todayInputValue());
  setValue('stayInterviewType', '');
  setValue('stayQ1', '');
  setValue('stayQ2', '');
  setValue('stayQ3', '');
  setValue('stayQ4', '');
  setValue('stayQ5', '');
  setValue('stayQ6', '');
  setValue('stayQ7', '');
  setValue('stayManagerSummary', '');
  setValue('ecName', '');
  setValue('ecRelationship', '');
  setValue('ecPhone', '');
  setValue('ecAltPhone', '');
  setValue('ecNotes', '');
  setValue('atRiskReasonInput', '');
  setValue('impactPlayerReasonInput', '');

  window.currentManualAtRiskState = { flagged: false, reason: '' };
  window.currentManualImpactPlayerState = { flagged: false, reason: '' };

  window.currentDisciplineReportId = null;
  window.currentEmergencyContactId = null;
  window.currentIncidentReportId = null;
  window.currentStayInterviewId = null;
  window.currentNoteId = null;
  window.currentMeetingId = null;
  window.currentReviewId = null;
  window.isCreatingEmployee = false;

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

declare global {
  interface Window {
    resetDrawerForms?: () => void;
    currentDisciplineReportId?: string | null;
    currentNoteId?: string | null;
    currentMeetingId?: string | null;
    currentReviewId?: string | null;
    currentIncidentReportId?: string | null;
    currentStayInterviewId?: string | null;
  }
}

window.resetDrawerForms = resetDrawerForms;
