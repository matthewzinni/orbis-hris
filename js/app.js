window.addEventListener('DOMContentLoaded', async () => {
  getSupabaseClient();

  const hasActiveSupabaseSession = async () => {
    const db = window.supabaseClient || window.supabase || null;
    if (!db?.auth?.getSession) return false;

    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      return Boolean(session);
    } catch (err) {
      console.warn('Could not check Supabase session before legacy dashboard load.', err);
      return false;
    }
  };

  const showAuthenticatedOrbisView = () => {
    const authViews = document.querySelectorAll('#authView, #loginView, .auth-shell, .login-shell');
    authViews.forEach((el) => {
      el.classList.add('hidden');
      el.style.display = 'none';
    });

    const appViews = document.querySelectorAll(
      '#appView, #dashboardView, #mainApp, .app-shell, .dashboard-shell, main'
    );
    appViews.forEach((el) => {
      el.classList.remove('hidden');
      el.style.display = '';
    });

    document.body.classList.add('authenticated');
    document.body.classList.remove('auth-only');
  };
  const currentDateEl = safeGet('currentDate');
  if (currentDateEl) {
    currentDateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (typeof initializeAuth === 'function') {
    initializeAuth();
  }
  const renderRosterIfAvailable = () => {
    if (typeof renderRoster === 'function') {
      renderRoster();
      return;
    }

    if (typeof renderEmployeeRoster === 'function') {
      renderEmployeeRoster();
    }
  };

  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const nextColumn = th.dataset.sort;
      if (!nextColumn) return;
      if (currentSort.column === nextColumn) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = nextColumn;
        currentSort.direction = 'asc';
      }
      renderRosterIfAvailable();
    });
  });
  safeGet('globalSearch')?.addEventListener('input', renderRosterIfAvailable);
  safeGet('deptFilter')?.addEventListener('change', renderRosterIfAvailable);
  safeGet('statusFilter')?.addEventListener('change', renderRosterIfAvailable);
  bindRosterClickOpenFallback();
  if (typeof window.bindDrawerEvents === 'function') {
    window.bindDrawerEvents();
  }
  const backdrop = safeGet('drawerBackdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      if (typeof window.closeDrawer === 'function') {
        window.closeDrawer();
      }
    });
  }
  if (typeof initCommandPalette === 'function') {
    initCommandPalette();
  }

  const canLoadProtectedLegacyData = await hasActiveSupabaseSession();

  if (canLoadProtectedLegacyData) {
    showAuthenticatedOrbisView();

    if (typeof loadAllDashboardData === 'function') {
      await loadAllDashboardData();
    } else if (typeof loadEmployees === 'function') {
      await loadEmployees();
    }

    renderRosterIfAvailable();
  } else {
    console.log('Legacy app.js protected data load skipped until sign in.');
  }
});
let supabaseClient = null;

function getSupabaseClient() {
  supabaseClient = window.supabaseClient || window.supabase || supabaseClient || null;
  if (supabaseClient) {
    window.supabaseClient = supabaseClient;
  }
  return supabaseClient;
}

let EMPLOYEES = [];
let CANDIDATES = [];
let currentCandidate = null;
let isCreatingCandidate = false;
let currentFilteredEmployees = [];
let currentEmployee = null;
window.currentEmployee = window.currentEmployee || null;

window.setCurrentEmployeeForOrbis = function (employee) {
  currentEmployee = employee || null;
  window.currentEmployee = currentEmployee;
};

function getCurrentEmployeeForOrbis() {
  return currentEmployee || window.currentEmployee || null;
}
function ensureDrawerTabFallbacks(employee = getCurrentEmployeeForOrbis()) {
  if (!employee) return;

  const fallbacks = {
    notesHistory: 'No notes found for this employee.',
    disciplineHistory: 'No discipline records found for this employee.',
    incidentHistory: 'No incident reports found for this employee.',
    reviewsHistory: 'No reviews found for this employee.',
    meetingsHistory: 'No meetings found for this employee.',
    ecHistory: 'No emergency contacts found for this employee.',
    stayInterviewHistory: 'No stay interviews found for this employee.',
    docHistory: 'No documents found for this employee.',
    historyTimeline: 'No HR history found for this employee.',
    onboardingChecklist: 'No onboarding tasks found for this employee.',
  };

  Object.entries(fallbacks).forEach(([id, message]) => {
    const el = safeGet(id);
    if (el && !String(el.innerHTML || '').trim()) {
      el.innerHTML = `<div class="empty">${esc(message)}</div>`;
    }
  });
}
let currentDisciplineReportId = null;
let currentNoteId = null;
let currentMeetingId = null;
let currentReviewId = null;
let currentEmergencyContactId = null;
let currentIncidentReportId = null;
let currentStayInterviewId = null;
let isCreatingEmployee = false;
let currentSort = {
  column: 'name',
  direction: 'asc',
};
let currentUserRole = 'user';
let currentUserAccess = null;
let currentManualAtRiskState = { flagged: false, reason: '' };
let currentAtRiskRosterMap = {};
let currentManualImpactPlayerState = { flagged: false, reason: '' };
let currentImpactPlayerRosterMap = {};

window.currentAtRiskRosterMap = currentAtRiskRosterMap;
window.currentImpactPlayerRosterMap = currentImpactPlayerRosterMap;

// Shared helper, formatting, toast, and print functions now live in:
// js/utils/helpers.js
// =========================
// UI / NAVIGATION
// =========================
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });

  if (tabName === 'discipline') {
    sanitizeDisciplineAutofillLeak(true);
    setTimeout(() => sanitizeDisciplineAutofillLeak(true), 100);
    setTimeout(() => sanitizeDisciplineAutofillLeak(true), 300);
  }
}

function sanitizeDisciplineAutofillLeak(forceClear = false) {
  const activeEmployee =
    getCurrentEmployeeForOrbis?.() || currentEmployee || window.currentEmployee || null;

  const descriptionField = safeGet('disciplineDescription');
  const actionField = safeGet('disciplineAction');

  if (forceClear) {
    if (descriptionField) descriptionField.value = '';
    if (actionField) actionField.value = '';
    return;
  }

  if (!activeEmployee) return;

  const supervisorValue = String(activeEmployee.supervisor || activeEmployee.supervisor_name || '')
    .trim()
    .toLowerCase();
  const payTypeValue = String(activeEmployee.pay_type || activeEmployee.payType || '')
    .trim()
    .toLowerCase();

  if (descriptionField) {
    const descriptionValue = String(descriptionField.value || '')
      .trim()
      .toLowerCase();
    if (
      descriptionValue &&
      (descriptionValue === supervisorValue || descriptionValue === payTypeValue)
    ) {
      descriptionField.value = '';
    }
  }

  if (actionField) {
    const actionValue = String(actionField.value || '')
      .trim()
      .toLowerCase();
    if (actionValue && (actionValue === supervisorValue || actionValue === payTypeValue)) {
      actionField.value = '';
    }
  }
}
function openNewEmployeeForm() {
  if (typeof startNewEmployee === 'function') {
    try {
      startNewEmployee();
      return;
    } catch (err) {
      console.error(err);
    }
  }
  currentEmployee = null;
  isCreatingEmployee = true;
  resetDrawerForms();
  switchTab('employee');
  setText('drawerTitle', 'New Employee');
  setText('drawerSub', 'Create employee record');
  if (typeof resetEmployeeForm === 'function') resetEmployeeForm();
  if (safeGet('saveEmployeeBtn')) safeGet('saveEmployeeBtn').textContent = 'Save Employee';
  if (safeGet('notesHistory'))
    safeGet('notesHistory').innerHTML =
      '<div class="empty">Save the employee before adding notes.</div>';
  if (safeGet('disciplineHistory'))
    safeGet('disciplineHistory').innerHTML =
      '<div class="empty">Save the employee before adding discipline records.</div>';
  if (safeGet('meetingsHistory'))
    safeGet('meetingsHistory').innerHTML =
      '<div class="empty">Save the employee before adding meetings.</div>';
  if (safeGet('ecHistory'))
    safeGet('ecHistory').innerHTML =
      '<div class="empty">Save the employee before adding an emergency contact.</div>';
  if (safeGet('reviewsHistory'))
    safeGet('reviewsHistory').innerHTML =
      '<div class="empty">Save the employee before adding reviews.</div>';
  if (safeGet('incidentHistory'))
    safeGet('incidentHistory').innerHTML =
      '<div class="empty">Save the employee before adding incident reports.</div>';
  if (safeGet('stayInterviewHistory'))
    safeGet('stayInterviewHistory').innerHTML =
      '<div class="empty">Save the employee before adding stay interviews.</div>';
  if (safeGet('docHistory'))
    safeGet('docHistory').innerHTML =
      '<div class="empty">Save the employee before uploading documents.</div>';
  if (safeGet('onboardingChecklist'))
    safeGet('onboardingChecklist').innerHTML =
      '<div class="empty">Save the employee before loading onboarding tasks.</div>';
  if (safeGet('onboardingSummary')) safeGet('onboardingSummary').textContent = '0 of 0 complete';
  if (safeGet('onboardingProgressBar')) safeGet('onboardingProgressBar').style.width = '0%';
  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('employeeDrawer');
  if (backdrop) backdrop.classList.add('open');
  if (drawer) drawer.classList.add('open');
  applyRolePermissions();
}

function createEmployee() {
  const activeEmployee = getCurrentEmployeeForOrbis();

  if (activeEmployee && typeof window.saveEmployeeForm === 'function') {
    return window.saveEmployeeForm();
  }

  if (activeEmployee && typeof saveEmployeeForm === 'function') {
    return saveEmployeeForm();
  }

  return openNewEmployeeForm();
}

window.openNewEmployeeForm = openNewEmployeeForm;
window.createEmployee = createEmployee;
async function deleteEmployeeById(employeeId) {
  const db = window.supabaseClient || supabaseClient;
  if (!db) {
    return { error: new Error('Supabase client not available') };
  }
  const targetId = String(employeeId || '').trim();
  if (!targetId) {
    return { error: new Error('No employee ID provided') };
  }
  // Permanent delete: removes the employee record completely.
  // Termination/archiving is handled separately by runTerminateEmployee().
  const relatedTables = [
    'onboarding_tasks',
    'employee_notes',
    'employee_meetings',
    'employee_reviews',
    'discipline_reports',
    'incident_reports',
    'stay_interviews',
    'emergency_contacts',
    'employee_audit_log',
  ];
  for (const table of relatedTables) {
    const { error } = await db.from(table).delete().eq('employee_id', targetId);
    if (error) {
      console.warn(`Could not delete related rows from ${table}:`, error);
    }
  }
  const { error } = await db.from('employees').delete().eq('id', targetId);
  if (error) {
    console.error('Employee delete failed:', error);
    return { error };
  }
  return { error: null };
}
window.deleteEmployeeById = deleteEmployeeById;
async function runDeleteEmployee() {
  if (!currentEmployee) {
    showToast('Open an employee first.', 'error');
    return;
  }
  const employeeName =
    `${currentEmployee.first || currentEmployee.first_name || ''} ${currentEmployee.last || currentEmployee.last_name || ''}`.trim() ||
    'this employee';
  const confirmed = confirm(
    `Permanently delete ${employeeName}'s employee file? This removes the record completely and cannot be undone.`
  );
  if (!confirmed) return;
  const employeeId = currentEmployee.id || currentEmployee.employee_id || currentEmployee.dbId;
  const { error } = await deleteEmployeeById(employeeId);
  if (error) {
    showToast(error.message || 'Could not archive employee.', 'error');
    return;
  }
  recordAuditEvent('Deleted Employee', currentEmployee, 'Employee record permanently deleted.');
  showToast('Employee deleted permanently.', 'success');
  await loadEmployees();
  await loadSummaryMetrics();
  await loadReviewDashboard();
  if (typeof window.closeDrawer === 'function') {
    window.closeDrawer();
  }
}
async function runTerminateEmployee() {
  if (!currentEmployee) {
    showToast('Open an employee first.', 'error');
    return;
  }
  const employeeName =
    `${currentEmployee.first || currentEmployee.first_name || ''} ${currentEmployee.last || currentEmployee.last_name || ''}`.trim() ||
    'this employee';
  const confirmed = confirm(
    `Terminate ${employeeName}? This will mark them as TERMINATED but keep their file.`
  );
  if (!confirmed) return;
  const employeeId = currentEmployee.id || currentEmployee.employee_id || currentEmployee.dbId;
  const targetId = String(employeeId || '').trim();
  const isUuid = /^[0-9a-f-]{36}$/i.test(targetId);
  let query = supabaseClient.from('employees').update({
    // Terminated employees stay in the roster with TERMINATED status so their file is retained,
    // they do not count toward active headcount, and termination fields remain available for turnover reporting.
    status: 'TERMINATED',
    termination_date: new Date().toISOString().slice(0, 10),
    termination_reason: 'Not specified',
    notes: currentEmployee.notes
      ? `${currentEmployee.notes}\n\nTerminated employee file retained for turnover history.`
      : 'Terminated employee file retained for turnover history.',
  });
  query = query.eq('id', targetId);
  const { error } = await query;
  if (error) {
    console.error(error);
    showToast('Could not terminate employee.', 'error');
    return;
  }
  recordAuditEvent(
    'Terminated Employee',
    currentEmployee,
    'Employee marked terminated with file retained for turnover reporting.'
  );
  showToast('Employee terminated. File retained for turnover reporting.', 'success');
  await loadEmployees();
  await loadSummaryMetrics();
  await loadReviewDashboard();
  if (typeof window.closeDrawer === 'function') {
    window.closeDrawer();
  }
}
window.runTerminateEmployee = runTerminateEmployee;
async function updateEmployeeById(employeeId, payload) {
  const db = window.supabaseClient || supabaseClient;
  if (!db) {
    return { data: null, error: new Error('Supabase client not available') };
  }
  const targetId = String(
    employeeId || payload?.id || payload?.employee_id || payload?.dbId || ''
  ).trim();
  if (!targetId) {
    return { data: null, error: new Error('No employee ID provided') };
  }
  const cleanPayload = { ...payload };

  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'nextReviewDate')) {
    cleanPayload.next_review_date = cleanPayload.nextReviewDate || null;
  }

  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'nextReview')) {
    cleanPayload.next_review_date = cleanPayload.nextReview || null;
  }

  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'next_review')) {
    cleanPayload.next_review_date = cleanPayload.next_review || null;
  }

  delete cleanPayload.nextReviewDate;
  delete cleanPayload.nextReview;
  delete cleanPayload.next_review;
  delete cleanPayload.dbId;
  delete cleanPayload.displayId;
  delete cleanPayload.displayName;
  delete cleanPayload.displayStatus;
  delete cleanPayload.displayStatusLabel;
  delete cleanPayload.displayDepartment;
  delete cleanPayload.displayPosition;
  delete cleanPayload.displaySupervisor;
  delete cleanPayload.hireDate;
  delete cleanPayload.tenureMonths;
  delete cleanPayload.tenureYears;
  delete cleanPayload.payType;
  delete cleanPayload.benefitsStatus;
  delete cleanPayload.first;
  delete cleanPayload.last;
  delete cleanPayload.dept;
  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'first_name')) {
    cleanPayload.first_name = cleanEmployeeNameValue(cleanPayload.first_name);
  }
  if (Object.prototype.hasOwnProperty.call(cleanPayload, 'last_name')) {
    cleanPayload.last_name = cleanEmployeeNameValue(cleanPayload.last_name);
  }
  const { data, error } = await db
    .from('employees')
    .update(cleanPayload)
    .eq('id', targetId)
    .select();
  if (error) {
    console.error('Employee update failed:', error);
    return { data: null, error };
  }
  return { data: Array.isArray(data) ? data[0] : data, error: null };
}
window.updateEmployeeById = updateEmployeeById;
window.createEmployee = window.createEmployee || createEmployee;
window.openNewEmployeeForm = window.openNewEmployeeForm || openNewEmployeeForm;

async function saveDisciplineReportSafe() {
  const activeEmployee =
    getCurrentEmployeeForOrbis?.() || currentEmployee || window.currentEmployee || null;
  const employeeId =
    activeEmployee?.employee_id || activeEmployee?.id || activeEmployee?.dbId || '';

  if (!employeeId) {
    console.error('Discipline save failed: no active employee found.', { activeEmployee });
    showToast('Open an employee before saving discipline.', 'error');
    return;
  }

  // sanitizeDisciplineAutofillLeak(); (removed as requested)
  const issueTypeValue = String(
    safeGet('disciplineType')?.value ||
      safeGet('disciplineIssueType')?.value ||
      safeGet('disciplineIssueTypeInput')?.value ||
      safeGet('disciplineIssueTypeSelect')?.value ||
      getDisciplineFieldValue(['disciplineType', 'disciplineIssueType']) ||
      ''
  ).trim();

  const levelValue = String(
    safeGet('disciplineLevel')?.value ||
      safeGet('disciplineLevelInput')?.value ||
      safeGet('disciplineLevelSelect')?.value ||
      getDisciplineFieldValue(['disciplineLevel']) ||
      ''
  ).trim();

  const payload = {
    employee_id: employeeId,
    date: safeGet('disciplineDate')?.value || todayInputValue(),
    type: issueTypeValue,
    issue_type: issueTypeValue,
    level: levelValue,
    description: safeGet('disciplineDescription')?.value || '',
    action_taken: safeGet('disciplineAction')?.value || '',
    status: safeGet('disciplineStatus')?.value || 'Open',
  };

  console.log('Saving discipline payload:', payload);

  if (!payload.description.trim() && !payload.action_taken.trim()) {
    showToast('Enter a description or action taken before saving.', 'error');
    return;
  }

  let result = currentDisciplineReportId
    ? await supabaseClient
        .from('discipline_reports')
        .update(payload)
        .eq('id', currentDisciplineReportId)
        .select()
    : await supabaseClient.from('discipline_reports').insert([payload]).select();

  if (result.error && String(result.error.message || '').includes("'issue_type'")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.issue_type;
    result = currentDisciplineReportId
      ? await supabaseClient
          .from('discipline_reports')
          .update(fallbackPayload)
          .eq('id', currentDisciplineReportId)
          .select()
      : await supabaseClient.from('discipline_reports').insert([fallbackPayload]).select();
  }

  if (result.error) {
    console.error('Discipline save failed:', result.error);
    showToast(result.error.message || 'Could not save discipline report.', 'error');
    return;
  }

  const savedDisciplineReport = Array.isArray(result.data) ? result.data[0] : result.data;

  if (savedDisciplineReport) {
    renderSavedDisciplineReportImmediately(savedDisciplineReport);
  }

  showToast(currentDisciplineReportId ? 'Discipline report updated.' : 'Discipline report saved.');

  if (!currentDisciplineReportId && typeof resetDisciplineForm === 'function') {
    resetDisciplineForm();
  } else if (!currentDisciplineReportId) {
    if (safeGet('disciplineDate')) safeGet('disciplineDate').value = todayInputValue();
    if (safeGet('disciplineType')) safeGet('disciplineType').value = '';
    if (safeGet('disciplineLevel')) safeGet('disciplineLevel').value = '';
    if (safeGet('disciplineDescription')) safeGet('disciplineDescription').value = '';
    if (safeGet('disciplineAction')) safeGet('disciplineAction').value = '';
    if (safeGet('disciplineStatus')) safeGet('disciplineStatus').value = 'Open';
  }

  const disciplineEmployeeIds = Array.from(
    new Set(
      [employeeId, activeEmployee?.id, activeEmployee?.employee_id, activeEmployee?.dbId]
        .filter(Boolean)
        .map(String)
    )
  );

  if (typeof loadDisciplineReports === 'function') {
    for (const id of disciplineEmployeeIds) {
      await loadDisciplineReports(id);
    }
    setTimeout(() => {
      disciplineEmployeeIds.forEach((id) => loadDisciplineReports(id));
    }, 250);
    setTimeout(() => {
      disciplineEmployeeIds.forEach((id) => loadDisciplineReports(id));
    }, 800);
  }

  currentDisciplineReportId = null;
}

function getDisciplineFieldValue(ids) {
  for (const id of ids) {
    const field = safeGet(id);
    if (field && typeof field.value === 'string' && field.value.trim()) {
      return field.value.trim();
    }
  }

  const disciplinePanel = safeGet('tab-discipline') || document.querySelector('#tab-discipline');
  if (!disciplinePanel) return '';

  const labels = ids.map((id) => id.toLowerCase()).join(' ');
  const candidates = Array.from(disciplinePanel.querySelectorAll('select, input'));

  if (labels.includes('type')) {
    const typeField = candidates.find((field) => {
      const text =
        `${field.id || ''} ${field.name || ''} ${field.getAttribute('aria-label') || ''} ${field.closest('label')?.textContent || ''}`.toLowerCase();
      return text.includes('type') || text.includes('issue');
    });
    return typeField?.value?.trim() || '';
  }

  if (labels.includes('level')) {
    const levelField = candidates.find((field) => {
      const text =
        `${field.id || ''} ${field.name || ''} ${field.getAttribute('aria-label') || ''} ${field.closest('label')?.textContent || ''}`.toLowerCase();
      return text.includes('level');
    });
    return levelField?.value?.trim() || '';
  }

  return '';
}
window.saveDisciplineReport = saveDisciplineReportSafe;

// Discipline Report Delete Handler
async function deleteDisciplineRecord(reportId) {
  const disciplineId = String(reportId || '').trim();

  if (!disciplineId) {
    showToast('Could not delete discipline report. Missing report ID.', 'error');
    return;
  }

  const confirmed = confirm('Delete this discipline report?');
  if (!confirmed) return;

  const activeEmployee =
    getCurrentEmployeeForOrbis?.() || currentEmployee || window.currentEmployee || null;
  const employeeIds = Array.from(
    new Set(
      [activeEmployee?.employee_id, activeEmployee?.id, activeEmployee?.dbId]
        .filter(Boolean)
        .map(String)
    )
  );

  const matchingCards = document.querySelectorAll(`[data-discipline-id="${disciplineId}"]`);
  matchingCards.forEach((card) => card.remove());

  const { error } = await supabaseClient.from('discipline_reports').delete().eq('id', disciplineId);

  if (error) {
    console.error('Discipline delete failed:', error);
    showToast(error.message || 'Could not delete discipline report.', 'error');
    if (typeof loadDisciplineReports === 'function') {
      for (const employeeId of employeeIds) {
        await loadDisciplineReports(employeeId);
      }
    }
    return;
  }

  showToast('Discipline report deleted.');

  if (typeof loadDisciplineReports === 'function') {
    for (const employeeId of employeeIds) {
      await loadDisciplineReports(employeeId);
    }
    setTimeout(() => {
      employeeIds.forEach((employeeId) => loadDisciplineReports(employeeId));
    }, 250);
  }
}

window.deleteDisciplineRecord = deleteDisciplineRecord;
// =========================
// FORM RESET / STATE MANAGEMENT
// =========================
function resetDrawerForms() {
  if (safeGet('noteDate')) safeGet('noteDate').value = todayInputValue();
  if (safeGet('noteType')) safeGet('noteType').value = '';
  if (safeGet('noteText')) safeGet('noteText').value = '';
  if (safeGet('disciplineDate')) safeGet('disciplineDate').value = todayInputValue();
  if (safeGet('disciplineType')) safeGet('disciplineType').value = '';
  if (safeGet('disciplineLevel')) safeGet('disciplineLevel').value = '';
  if (safeGet('disciplineDescription')) safeGet('disciplineDescription').value = '';
  if (safeGet('disciplineAction')) safeGet('disciplineAction').value = '';
  if (safeGet('disciplineStatus')) safeGet('disciplineStatus').value = 'Open';
  sanitizeDisciplineAutofillLeak(true);
  if (safeGet('incidentDate')) safeGet('incidentDate').value = todayInputValue();
  if (safeGet('incidentType')) safeGet('incidentType').value = '';
  if (safeGet('incidentLocation')) safeGet('incidentLocation').value = '';
  if (safeGet('incidentDescription')) safeGet('incidentDescription').value = '';
  if (safeGet('incidentFollowUp')) safeGet('incidentFollowUp').value = '';
  if (safeGet('incidentStatus')) safeGet('incidentStatus').value = 'Open';
  if (safeGet('meetingDate')) safeGet('meetingDate').value = todayInputValue();
  if (safeGet('meetingType')) safeGet('meetingType').value = '';
  if (safeGet('meetingSubject')) safeGet('meetingSubject').value = '';
  if (safeGet('meetingNotes')) safeGet('meetingNotes').value = '';
  if (safeGet('reviewDate')) safeGet('reviewDate').value = todayInputValue();
  if (safeGet('reviewType')) safeGet('reviewType').value = '';
  if (safeGet('reviewAttendance')) safeGet('reviewAttendance').value = '';
  if (safeGet('reviewPerformance')) safeGet('reviewPerformance').value = '';
  if (safeGet('reviewTeamwork')) safeGet('reviewTeamwork').value = '';
  if (safeGet('reviewAttitude')) safeGet('reviewAttitude').value = '';
  if (safeGet('reviewReliability')) safeGet('reviewReliability').value = '';
  if (safeGet('reviewOverallResult')) safeGet('reviewOverallResult').value = '';
  if (safeGet('reviewStrengths')) safeGet('reviewStrengths').value = '';
  if (safeGet('reviewImprovements')) safeGet('reviewImprovements').value = '';
  if (safeGet('reviewEmployeeComments')) safeGet('reviewEmployeeComments').value = '';
  if (safeGet('reviewManagerComments')) safeGet('reviewManagerComments').value = '';
  if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = todayInputValue();
  if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = '';
  if (safeGet('stayQ1')) safeGet('stayQ1').value = '';
  if (safeGet('stayQ2')) safeGet('stayQ2').value = '';
  if (safeGet('stayQ3')) safeGet('stayQ3').value = '';
  if (safeGet('stayQ4')) safeGet('stayQ4').value = '';
  if (safeGet('stayQ5')) safeGet('stayQ5').value = '';
  if (safeGet('stayQ6')) safeGet('stayQ6').value = '';
  if (safeGet('stayQ7')) safeGet('stayQ7').value = '';
  if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = '';
  if (safeGet('ecName')) safeGet('ecName').value = '';
  if (safeGet('ecRelationship')) safeGet('ecRelationship').value = '';
  if (safeGet('ecPhone')) safeGet('ecPhone').value = '';
  if (safeGet('ecAltPhone')) safeGet('ecAltPhone').value = '';
  if (safeGet('ecNotes')) safeGet('ecNotes').value = '';
  if (safeGet('atRiskReasonInput')) safeGet('atRiskReasonInput').value = '';
  currentManualAtRiskState = { flagged: false, reason: '' };
  if (safeGet('impactPlayerReasonInput')) safeGet('impactPlayerReasonInput').value = '';
  currentManualImpactPlayerState = { flagged: false, reason: '' };
  currentDisciplineReportId = null;
  currentEmergencyContactId = null;
  currentIncidentReportId = null;
  currentStayInterviewId = null;
  currentNoteId = null;
  currentMeetingId = null;
  currentReviewId = null;
  isCreatingEmployee = false;
  if (safeGet('saveDisciplineBtn'))
    safeGet('saveDisciplineBtn').textContent = 'Save Discipline Report';
  if (safeGet('saveIncidentBtn')) safeGet('saveIncidentBtn').textContent = 'Save Incident Report';
  if (safeGet('saveStayInterviewBtn'))
    safeGet('saveStayInterviewBtn').textContent = 'Save Stay Interview';
  if (safeGet('saveNoteBtn')) safeGet('saveNoteBtn').textContent = 'Save Note';
  if (safeGet('saveMeetingBtn')) safeGet('saveMeetingBtn').textContent = 'Save Meeting';
  if (safeGet('saveReviewBtn')) safeGet('saveReviewBtn').textContent = 'Save Review';
  safeGet('cancelDisciplineEditBtn')?.classList.add('hidden');
  safeGet('disciplineEditStatus')?.classList.add('hidden');
  safeGet('cancelIncidentEditBtn')?.classList.add('hidden');
  safeGet('incidentEditStatus')?.classList.add('hidden');
  safeGet('cancelStayInterviewEditBtn')?.classList.add('hidden');
  safeGet('stayInterviewEditStatus')?.classList.add('hidden');
  safeGet('cancelMeetingEditBtn')?.classList.add('hidden');
  safeGet('meetingEditStatus')?.classList.add('hidden');
  safeGet('cancelReviewEditBtn')?.classList.add('hidden');
  safeGet('reviewEditStatus')?.classList.add('hidden');
}
function cleanEmployeeNameValue(value) {
  return String(value || '')
    .replace(/\bAt[-\s]*Risk\b/gi, '')
    .replace(/\bImpact\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function sanitizeVisibleEmployeeNameFields() {
  const ids = [
    'empFirstName',
    'firstName',
    'employeeFirstName',
    'empLastName',
    'lastName',
    'employeeLastName',
  ];
  ids.forEach((id) => {
    const field = safeGet(id);
    if (!field || typeof field.value !== 'string') return;
    const cleaned = cleanEmployeeNameValue(field.value);
    if (field.value !== cleaned) {
      field.value = cleaned;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}
function normalizeEmployee(employee) {
  if (!employee) return null;
  const first = cleanEmployeeNameValue(employee.first || employee.first_name || '');
  const last = cleanEmployeeNameValue(employee.last || employee.last_name || '');
  const dept = employee.dept || employee.department || '';
  const status = String(employee.status || 'ACTIVE').toUpperCase();
  const hireDateRaw = employee.hire_date || employee.hireDate || '';
  const nextReviewRaw = employee.next_review_date || employee.nextReviewDate || '';
  const hireDate = hireDateRaw ? new Date(`${hireDateRaw}T00:00:00`) : null;
  const nextReview = nextReviewRaw ? new Date(`${nextReviewRaw}T00:00:00`) : null;
  return {
    ...employee,
    id: employee.id || employee.employee_id || '',
    dbId: employee.id || '',
    employee_id: employee.employee_id || employee.id || '',
    first,
    last,
    first_name: first,
    last_name: last,
    displayName: `${first} ${last}`.trim(),
    dept,
    department: dept,
    position: employee.position || '',
    supervisor: employee.supervisor || '',
    status,
    displayStatus: status,
    payType: employee.payType || employee.pay_type || '',
    pay_type: employee.pay_type || employee.payType || '',
    hireDate,
    hire_date: hireDateRaw,
    nextReview,
    next_review_date: nextReviewRaw,
    tenureMonths: Number(employee.tenureMonths || employee.tenure_months || 0),
    tenure_months: Number(employee.tenure_months || employee.tenureMonths || 0),
    benefitsStatus: employee.benefitsStatus || employee.benefits_status || '',
    benefits_status: employee.benefits_status || employee.benefitsStatus || '',
  };
}
function populateEmployeeAdminForm(employee) {
  if (!employee) return;
  employee = normalizeEmployee(employee);
  if (!employee) return;
  const drawerTitleName = String(safeGet('drawerTitle')?.textContent || '').trim();
  const drawerSubParts = String(safeGet('drawerSub')?.textContent || '')
    .split('•')
    .map((part) => part.trim());
  const fallbackName =
    `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || drawerTitleName;
  const nameParts = String(fallbackName).trim().split(/\s+/).filter(Boolean);
  const values = {
    employeeId: employee.employee_id || employee.id || employee.dbId || '',
    status: employee.status || 'Active',
    firstName: cleanEmployeeNameValue(employee.first_name || nameParts[0] || ''),
    lastName: cleanEmployeeNameValue(
      employee.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '')
    ),
    department: employee.department || drawerSubParts[1] || '',
    position: employee.position || drawerSubParts[0] || '',
    supervisor: employee.supervisor || '',
    payType: employee.pay_type || '',
    standardHours: employee.standard_hours || '',
    benefitsStatus: employee.benefits_status || '',
    hireDate: employee.hire_date || '',
    nextReviewDate: employee.next_review_date || '',
    anniversaryDate: employee.anniversary_date || '',
    tenureBracket: employee.tenure_bracket || '',
    workEmail: employee.work_email || '',
    personalEmail: employee.personal_email || '',
    phone: employee.phone || '',
    notes: employee.notes || '',
  };
  const employeeAdminRoot =
    safeGet('tab-employee') ||
    safeGet('tab-profile') ||
    document.querySelector('#tab-employee, #tab-profile');

  const findEmployeeAdminField = (id) => {
    if (!employeeAdminRoot) return null;

    try {
      return employeeAdminRoot.querySelector(`#${CSS.escape(id)}`);
    } catch (_err) {
      return employeeAdminRoot.querySelector(`#${id}`);
    }
  };

  const setField = (id, value) => {
    const el = findEmployeeAdminField(id);
    if (!el) return;

    el.value = value ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const setByPlaceholder = (placeholder, value) => {
    if (!employeeAdminRoot) return;

    const el = employeeAdminRoot.querySelector(
      `input[placeholder="${placeholder}"], select[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`
    );

    if (!el) return;

    el.value = value ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setField('empId', values.employeeId);
  setField('employeeId', values.employeeId);
  setField('empEmployeeId', values.employeeId);
  setByPlaceholder('Employee ID', values.employeeId);
  setField('empStatus', values.status);
  setField('status', values.status);
  setField('empFirstName', values.firstName);
  setField('firstName', values.firstName);
  setField('employeeFirstName', values.firstName);
  setByPlaceholder('First name', values.firstName);
  setField('empLastName', values.lastName);
  setField('lastName', values.lastName);
  setField('employeeLastName', values.lastName);
  setByPlaceholder('Last name', values.lastName);
  setField('empDepartment', values.department);
  setField('department', values.department);
  setField('employeeDepartment', values.department);
  setByPlaceholder('Department', values.department);
  setField('empPosition', values.position);
  setField('position', values.position);
  setField('employeePosition', values.position);
  setByPlaceholder('Position', values.position);
  setField('empSupervisor', values.supervisor);
  setField('supervisor', values.supervisor);
  setByPlaceholder('Supervisor', values.supervisor);
  setField('empPayType', values.payType);
  setField('payType', values.payType);
  setByPlaceholder('Hourly, Salary, etc.', values.payType);
  setField('empStandardHours', values.standardHours);
  setField('standardHours', values.standardHours);
  setByPlaceholder('40', values.standardHours);
  setField('empBenefitsStatus', values.benefitsStatus);
  setField('benefitsStatus', values.benefitsStatus);
  setByPlaceholder('Benefits status', values.benefitsStatus);
  setField('empHireDate', values.hireDate);
  setField('hireDate', values.hireDate);
  setField('empNextReviewDate', values.nextReviewDate);
  setField('nextReviewDate', values.nextReviewDate);
  setField('employeeNextReviewInput', values.nextReviewDate);
  setField('empAnniversaryDate', values.anniversaryDate);
  setField('anniversaryDate', values.anniversaryDate);
  setField('empTenureBracket', values.tenureBracket);
  setField('tenureBracket', values.tenureBracket);
  setField('empWorkEmail', values.workEmail);
  setField('workEmail', values.workEmail);
  setField('empPersonalEmail', values.personalEmail);
  setField('personalEmail', values.personalEmail);
  setField('empPhone', values.phone);
  setField('phone', values.phone);
  setField('empNotes', values.notes);
  setField('notes', values.notes);
  const drawer = safeGet('employeeDrawer') || document.querySelector('#employeeDrawer');
  const statusSelect =
    safeGet('empStatus') ||
    safeGet('status') ||
    drawer?.querySelector('select#empStatus') ||
    drawer?.querySelector('select#status') ||
    Array.from(drawer?.querySelectorAll('select') || []).find((select) => {
      return Array.from(select.options || []).some((option) => {
        const optionText = option.textContent.trim().toLowerCase();
        return (
          optionText === 'active' ||
          optionText === 'inactive' ||
          optionText === 'leave' ||
          optionText === 'terminated'
        );
      });
    });
  if (statusSelect) {
    const requiredStatuses = [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
      { value: 'LEAVE', label: 'Leave' },
      { value: 'TERMINATED', label: 'Terminated' },
    ];
    const existingStatuses = Array.from(statusSelect.options || []).map((option) =>
      String(option.value || option.textContent || '')
        .trim()
        .toUpperCase()
    );
    requiredStatuses.forEach((statusOption) => {
      if (!existingStatuses.includes(statusOption.value)) {
        const option = document.createElement('option');
        option.value = statusOption.value;
        option.textContent = statusOption.label;
        statusSelect.appendChild(option);
      }
    });
    const normalizedStatus = String(values.status || '')
      .trim()
      .toUpperCase();
    const matchingOption = Array.from(statusSelect.options || []).find((option) => {
      return (
        String(option.value || '')
          .trim()
          .toUpperCase() === normalizedStatus ||
        String(option.textContent || '')
          .trim()
          .toUpperCase() === normalizedStatus
      );
    });
    statusSelect.value = matchingOption ? matchingOption.value : 'ACTIVE';
    statusSelect.dispatchEvent(new Event('input', { bubbles: true }));
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
// =========================
// EDIT CANCEL HANDLERS
// =========================
function cancelStayInterviewEdit() {
  currentStayInterviewId = null;
  if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = todayInputValue();
  if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = '';
  if (safeGet('stayQ1')) safeGet('stayQ1').value = '';
  if (safeGet('stayQ2')) safeGet('stayQ2').value = '';
  if (safeGet('stayQ3')) safeGet('stayQ3').value = '';
  if (safeGet('stayQ4')) safeGet('stayQ4').value = '';
  if (safeGet('stayQ5')) safeGet('stayQ5').value = '';
  if (safeGet('stayQ6')) safeGet('stayQ6').value = '';
  if (safeGet('stayQ7')) safeGet('stayQ7').value = '';
  if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = '';
  if (safeGet('saveStayInterviewBtn'))
    safeGet('saveStayInterviewBtn').textContent = 'Save Stay Interview';
  safeGet('cancelStayInterviewEditBtn')?.classList.add('hidden');
  safeGet('stayInterviewEditStatus')?.classList.add('hidden');
}
function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}
let isLoadingDashboard = false;
async function getUserRole() {
  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return null;
    const userEmail = String(user.email || '')
      .trim()
      .toLowerCase();
    currentUserAccess = null;
    const { data: accessRows, error: accessError } = await supabaseClient
      .from('user_access')
      .select('email, display_name, role, supervisor_name, can_delete')
      .eq('email', userEmail)
      .limit(1);
    if (!accessError && accessRows && accessRows[0]) {
      currentUserAccess = accessRows[0];
      const accessRole = String(accessRows[0].role || '')
        .toLowerCase()
        .trim();
      if (accessRole) return accessRole;
    }
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('hr_role')
      .eq('id', user.id);
    if (error) {
      console.error(error);
      return null;
    }
    const roles = (data || [])
      .map((row) =>
        String(row.hr_role || '')
          .toLowerCase()
          .trim()
      )
      .filter(Boolean);
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('supervisor')) return 'supervisor';
    if (roles.includes('user')) return 'user';
    return roles[0] || 'user';
  } catch (err) {
    console.error(err);
    return null;
  }
}
function canManageEmployeeRecords() {
  return String(currentUserRole || '').toLowerCase() === 'admin';
}
function isSupervisorUser() {
  return String(currentUserRole || '').toLowerCase() === 'supervisor';
}
function employeeMatchesSupervisorAccess(employee) {
  if (!isSupervisorUser()) return true;
  const supervisorName = String(currentUserAccess?.supervisor_name || '')
    .trim()
    .toLowerCase();
  if (!supervisorName) {
    console.warn(
      '[Supervisor Match Fail] No supervisor_name on currentUserAccess:',
      currentUserAccess
    );
    return false;
  }
  const employeeSupervisor = String(employee?.supervisor || employee?.displaySupervisor || '')
    .trim()
    .toLowerCase();
  if (!employeeSupervisor) {
    console.warn('[Supervisor Match Fail] No supervisor on employee:', employee);
    return false;
  }
  const compactAccessName = supervisorName.replace(/[^a-z0-9]/g, '');
  const compactEmployeeSupervisor = employeeSupervisor.replace(/[^a-z0-9]/g, '');
  const isMatch =
    employeeSupervisor.includes(supervisorName) ||
    supervisorName.includes(employeeSupervisor) ||
    compactEmployeeSupervisor.includes(compactAccessName) ||
    compactAccessName.includes(compactEmployeeSupervisor);
  console.log('[Supervisor Match Check]', {
    employeeSupervisor,
    supervisorName,
    isMatch,
  });
  return isMatch;
}
function applySupervisorDashboardView() {
  if (!isSupervisorUser()) return;
  const name =
    currentUserAccess?.display_name || currentUserAccess?.supervisor_name || 'Supervisor';
  const title = safeGet('dashboardTitle') || document.querySelector('h1');
  if (title) title.textContent = `${name}'s Team Dashboard`;
  const rosterTitle =
    safeGet('rosterTitle') ||
    document.querySelector('#employeeRosterCard h2, #employeeRosterCard h3, .roster-title');
  if (rosterTitle) rosterTitle.textContent = 'My Team';
  // KPI LABEL UPDATES
  const activeLabel = document
    .querySelector('#kActiveHC')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (activeLabel) activeLabel.textContent = 'My Team Size';
  const reviewsLabel = document
    .querySelector('#kReviewsDue')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (reviewsLabel) reviewsLabel.textContent = 'My Reviews Due';
  const riskLabel = document
    .querySelector('#kTurnoverRisk')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (riskLabel) riskLabel.textContent = 'My Team Risk';
  const leaveLabel = document
    .querySelector('#kOnLeave')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (leaveLabel) leaveLabel.textContent = 'My Team On Leave';
  // HIDE COMPANY-WIDE KPIs
  const deptCard = document.querySelector('#kDepartments')?.closest('.kpi-card');
  if (deptCard) deptCard.classList.add('hidden');
  // ADMIN UI LOCK
  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    el.classList.add('hidden');
    el.disabled = true;
  });
  // OPTIONAL: add simple supervisor insight banner
  const existingBanner = document.getElementById('supervisorBanner');
  if (!existingBanner) {
    const banner = document.createElement('div');
    banner.id = 'supervisorBanner';
    banner.style.padding = '10px';
    banner.style.marginBottom = '10px';
    banner.style.borderRadius = '6px';
    banner.style.background = '#eef2ff';
    banner.style.fontSize = '14px';
    const atRisk = (window.EMPLOYEES || []).filter((e) => {
      const key = String(e.dbId || e.id || '');
      const risk = currentAtRiskRosterMap?.[key];
      return risk && (risk.lowReview || risk.openIncidentCount > 0 || risk.manualReason);
    }).length;
    banner.textContent = `You have ${EMPLOYEES.length} employees. ${atRisk} may need attention.`;
    const container = document.querySelector('.dashboard') || document.body;
    if (container) container.prepend(banner);
  }
}
function getAuditTrail() {
  try {
    const raw = localStorage.getItem('btw_hris_audit_trail');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}
function buildEmployeeChangeLog(oldEmployee, newEmployee) {
  const oldData = normalizeEmployee(oldEmployee || {});
  const newData = normalizeEmployee(newEmployee || {});
  const fields = [
    ['Status', 'status'],
    ['First Name', 'first_name'],
    ['Last Name', 'last_name'],
    ['Department', 'department'],
    ['Position', 'position'],
    ['Supervisor', 'supervisor'],
    ['Pay Type', 'pay_type'],
    ['Standard Hours', 'standard_hours'],
    ['Benefits Status', 'benefits_status'],
    ['Hire Date', 'hire_date'],
    ['Next Review Date', 'next_review_date'],
    ['Anniversary Date', 'anniversary_date'],
    ['Tenure Bracket', 'tenure_bracket'],
    ['Work Email', 'work_email'],
    ['Personal Email', 'personal_email'],
    ['Phone', 'phone'],
  ];
  const formatValue = (value) => {
    const text = String(value ?? '').trim();
    return text || 'Blank';
  };
  return fields
    .map(([label, key]) => {
      const oldValue = formatValue(oldData?.[key]);
      const newValue = formatValue(newData?.[key]);
      return oldValue !== newValue ? `${label}: ${oldValue} → ${newValue}` : '';
    })
    .filter(Boolean)
    .join(' | ');
}
function recordAuditEvent(action, employee, details = '') {
  try {
    const audit = getAuditTrail();
    // Prevent useless or empty audit entries like "Blank → Blank"
    const cleanDetails = String(details || '').trim();
    if (!cleanDetails || cleanDetails === 'Blank → Blank') {
      console.warn('Skipped empty audit log entry.');
      return;
    }
    const entry = {
      action,
      employeeId: employee?.id || employee?.dbId || '',
      employeeName: employee ? `${employee.first || ''} ${employee.last || ''}`.trim() : '',
      details: cleanDetails,
      userRole: currentUserRole || 'user',
      timestamp: new Date().toISOString(),
    };
    audit.unshift(entry);
    localStorage.setItem('btw_hris_audit_trail', JSON.stringify(audit.slice(0, 75)));
  } catch (err) {
    console.error('Could not write audit trail.', err);
  }
}
function applyRoleLocks() {
  const adminOnlyIds = ['deleteEmployeeBtn', 'terminateEmployeeBtn'];
  adminOnlyIds.forEach((id) => {
    const el = safeGet(id);
    if (!el) return;
    const locked = !canManageEmployeeRecords();
    el.disabled = locked;
    el.title = locked ? 'Locked: admin access required' : '';
  });
}
function applyRolePermissions() {
  const supervisorMode = isSupervisorUser();
  const deleteEmployeeBtn = ensureDeleteEmployeeButton();
  const terminateBtn = safeGet('terminateEmployeeBtn');
  if (currentEmployee) {
    const status = String(currentEmployee.status || '').toUpperCase();
    if (deleteEmployeeBtn) {
      const shouldHideDeleteEmployee = isCreatingEmployee || supervisorMode;
      deleteEmployeeBtn.classList.toggle('hidden', shouldHideDeleteEmployee);
    }
    if (terminateBtn) {
      console.log('Status:', status, 'isCreatingEmployee:', isCreatingEmployee);
      const shouldHideTerminate = status === 'TERMINATED' || supervisorMode;
      terminateBtn.classList.toggle('hidden', shouldHideTerminate);
    }
  } else {
    if (deleteEmployeeBtn) deleteEmployeeBtn.classList.add('hidden');
    if (terminateBtn) terminateBtn.classList.add('hidden');
  }
  const deleteECBtn = safeGet('deleteECBtn');
  if (deleteECBtn) {
    const shouldHideDeleteEC = !currentEmergencyContactId;
    deleteECBtn.classList.toggle('hidden', shouldHideDeleteEC);
  }
  if (supervisorMode) {
    document
      .querySelectorAll(
        '#deleteEmployeeBtn, #terminateEmployeeBtn, .delete-btn, .danger-delete, [data-admin-only="true"]'
      )
      .forEach((el) => {
        el.classList.add('hidden');
        el.disabled = true;
        el.title = 'Locked: supervisors cannot delete or terminate records';
      });
  }
  if (supervisorMode) {
    const employeeAdminFieldIds = [
      'empId',
      'employeeId',
      'empEmployeeId',
      'empStatus',
      'status',
      'empFirstName',
      'firstName',
      'employeeFirstName',
      'empLastName',
      'lastName',
      'employeeLastName',
      'empDepartment',
      'department',
      'employeeDepartment',
      'empPosition',
      'position',
      'employeePosition',
      'empSupervisor',
      'supervisor',
      'empPayType',
      'payType',
      'empStandardHours',
      'standardHours',
      'empBenefitsStatus',
      'benefitsStatus',
      'empHireDate',
      'hireDate',
      'empNextReviewDate',
      'nextReviewDate',
      'empAnniversaryDate',
      'anniversaryDate',
      'empTenureBracket',
      'tenureBracket',
      'empWorkEmail',
      'workEmail',
      'empPersonalEmail',
      'personalEmail',
      'empPhone',
      'phone',
      'empNotes',
      'notes',
    ];
    employeeAdminFieldIds.forEach((id) => {
      const field = safeGet(id);
      if (!field) return;
      field.disabled = true;
      field.readOnly = true;
      field.title = 'Locked: supervisors cannot edit core employee profile fields';
    });
    const saveEmployeeBtn = safeGet('saveEmployeeBtn');
    if (saveEmployeeBtn) {
      saveEmployeeBtn.disabled = true;
      saveEmployeeBtn.classList.add('hidden');
      saveEmployeeBtn.title = 'Locked: supervisors cannot edit core employee profile fields';
    }
    const newEmployeeBtn =
      safeGet('newEmployeeBtn') ||
      document.querySelector("button[onclick='openNewEmployeeForm()']");
    if (newEmployeeBtn) {
      newEmployeeBtn.disabled = true;
      newEmployeeBtn.classList.add('hidden');
      newEmployeeBtn.title = 'Locked: supervisors cannot create employee records';
    }
  }
}
function ensureDeleteEmployeeButton() {
  const drawer =
    safeGet('employeeDrawer') ||
    document.querySelector('#employeeDrawer') ||
    document.querySelector('.drawer.open');
  const searchRoot = drawer || document;
  const findButtonByText = (labels) => {
    const normalizedLabels = labels.map((label) => String(label).trim().toLowerCase());
    return Array.from(searchRoot.querySelectorAll('button')).find((button) =>
      normalizedLabels.includes(
        String(button.textContent || '')
          .trim()
          .toLowerCase()
      )
    );
  };
  const newBtn =
    (drawer && drawer.querySelector("button[onclick='openNewEmployeeForm()']")) ||
    (drawer && drawer.querySelector('#newEmployeeBtn')) ||
    findButtonByText(['New Employee']);
  const saveBtn =
    (drawer && drawer.querySelector('#saveEmployeeBtn')) ||
    findButtonByText(['Update Employee', 'Save Employee']);
  const actionsRow =
    (newBtn && newBtn.parentElement) ||
    (saveBtn && saveBtn.parentElement) ||
    (drawer && drawer.querySelector('.form-actions')) ||
    (drawer && drawer.querySelector('.actions')) ||
    (drawer && drawer.querySelector('#tab-employee')) ||
    (drawer && drawer.querySelector('#tab-profile')) ||
    drawer;
  if (!actionsRow) {
    console.warn('Could not find employee action row for Archive/Terminate buttons.');
    return null;
  }
  let archiveBtn = safeGet('deleteEmployeeBtn');
  if (!archiveBtn) {
    archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.id = 'deleteEmployeeBtn';
    archiveBtn.className = 'button danger';
    archiveBtn.textContent = 'Delete Employee';
    archiveBtn.onclick = () => runDeleteEmployee();
  }
  let terminateBtn = safeGet('terminateEmployeeBtn');
  if (!terminateBtn) {
    terminateBtn = document.createElement('button');
    terminateBtn.type = 'button';
    terminateBtn.id = 'terminateEmployeeBtn';
    terminateBtn.className = 'button danger';
    terminateBtn.textContent = 'Terminate Employee';
    terminateBtn.onclick = () => runTerminateEmployee();
  }
  if (!actionsRow.contains(archiveBtn)) {
    if (newBtn && newBtn.nextSibling) {
      actionsRow.insertBefore(archiveBtn, newBtn.nextSibling);
    } else {
      actionsRow.appendChild(archiveBtn);
    }
  }
  if (!actionsRow.contains(terminateBtn)) {
    if (archiveBtn && archiveBtn.nextSibling) {
      actionsRow.insertBefore(terminateBtn, archiveBtn.nextSibling);
    } else {
      actionsRow.appendChild(terminateBtn);
    }
  }
  archiveBtn.classList.remove('hidden');
  terminateBtn.classList.remove('hidden');
  applyRoleLocks();
  return archiveBtn;
}
async function loadAllDashboardData() {
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;
  try {
    await loadEmployees();

    if (typeof renderRoster === 'function') {
      renderRoster();
    } else if (typeof renderEmployeeRoster === 'function') {
      renderEmployeeRoster();
    }

    await Promise.allSettled([
      loadCandidates(),
      loadSummaryMetricsFallback(),
      loadRecentActivityFallback(),
    ]);

    try {
      await loadReviewDashboardFallback();
    } catch (err) {
      console.warn('Review dashboard fallback failed.', err);
    }

    try {
      await loadExecutiveInsightFallback();
    } catch (err) {
      console.warn('Executive insight fallback failed.', err);
    }

    try {
      await loadRiskEmployeesFallback();
    } catch (err) {
      console.warn('Risk employees fallback failed.', err);
    }

    try {
      await loadImpactPlayersFallback();
    } catch (err) {
      console.warn('Impact players fallback failed.', err);
    }

    cleanReviewDashboardLooseCount();

    if (typeof renderBasicDashboardKpis === 'function') {
      renderBasicDashboardKpis();
    }

    setText(
      'lastRefresh',
      new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    );
  } catch (err) {
    console.error(err);
    showToast('Could not refresh dashboard data.', 'error');
  } finally {
    if (typeof renderBasicDashboardKpis === 'function') {
      renderBasicDashboardKpis();
    }
    cleanReviewDashboardLooseCount();
    isLoadingDashboard = false;
  }
  if (typeof initKpiHoverUi === 'function') {
    initKpiHoverUi();
  }

  if (typeof buildKpiHoverDetails === 'function') {
    buildKpiHoverDetails();
  }
  if (typeof buildRiskPreview !== 'function') {
    window.buildRiskPreview = function () {
      console.warn('buildRiskPreview fallback loaded');
    };
  }

  if (typeof buildKpiHoverDetails !== 'function') {
    window.buildKpiHoverDetails = function () {
      console.warn('buildKpiHoverDetails fallback loaded');
    };
  }
}
function setEmployeeRosterLoadingState(message = 'Loading employees…') {
  const rosterBody =
    safeGet('employeeTableBody') ||
    safeGet('employeeRosterBody') ||
    safeGet('rosterBody') ||
    document.querySelector('#employeeRoster tbody, #employeeTable tbody, table tbody');

  if (!rosterBody) {
    return;
  }

  const isErrorState = String(message || '')
    .toLowerCase()
    .includes('could not');

  if (isErrorState) {
    rosterBody.innerHTML = `<tr><td colspan="8" class="empty">${esc(message)}</td></tr>`;

    return;
  }

  rosterBody.innerHTML = `
        <tr class="skeleton-row">
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line long"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line short"></span></td>
        </tr>
        <tr class="skeleton-row">
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line long"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line short"></span></td>
        </tr>
        <tr class="skeleton-row">
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line long"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line medium"></span></td>
            <td><span class="skeleton-line short"></span></td>
            <td><span class="skeleton-line short"></span></td>
        </tr>
    `;
}

async function loadEmployees() {
  setEmployeeRosterLoadingState('Loading employees…');
  const db = getSupabaseClient();
  if (!db) {
    console.warn('Supabase client not ready in loadEmployees.');
    setEmployeeRosterLoadingState('Could not load employees.');
    return [];
  }

  try {
    const {
      data: { user },
    } = await db.auth.getUser();
    const userEmail = String(user?.email || '')
      .trim()
      .toLowerCase();
    if (userEmail) {
      const { data: accessRows, error: accessError } = await db
        .from('user_access')
        .select('email, display_name, role, supervisor_name, can_delete')
        .eq('email', userEmail)
        .limit(1);
      if (!accessError && accessRows && accessRows[0]) {
        currentUserAccess = accessRows[0];
        currentUserRole = String(accessRows[0].role || currentUserRole || 'user')
          .trim()
          .toLowerCase();
        console.log('[Access Loaded In loadEmployees]', currentUserRole, currentUserAccess);
      }
    }
  } catch (accessErr) {
    console.warn('Could not load user access before employee scope.', accessErr);
  }
  const { data, error } = await db.from('employees').select('*');
  if (error) {
    console.error(error);

    setEmployeeRosterLoadingState('Could not load employees.');

    showToast('Could not load employees.', 'error');

    return [];
  }
  const normalizedEmployees = (Array.isArray(data) ? data : [])
    .map((employee) =>
      typeof normalizeEmployee === 'function' ? normalizeEmployee(employee) : employee
    )
    .filter(Boolean);
  window.ALL_EMPLOYEES = normalizedEmployees;
  if (isSupervisorUser()) {
    if (!currentUserAccess?.supervisor_name) {
      showToast('No employee access assigned. Contact HR.', 'error');
      EMPLOYEES = [];
    } else {
      EMPLOYEES = normalizedEmployees.filter(employeeMatchesSupervisorAccess);
    }
    console.log('[Supervisor Filter Applied]', {
      supervisorName: currentUserAccess?.supervisor_name,
      before: normalizedEmployees.length,
      after: EMPLOYEES.length,
      visible: EMPLOYEES.map((e) => ({
        id: e.id,
        name: `${e.first || e.first_name || ''} ${e.last || e.last_name || ''}`.trim(),
        supervisor: e.supervisor,
      })),
    });
  } else {
    EMPLOYEES = normalizedEmployees;
  }
  currentFilteredEmployees = EMPLOYEES;
  window.EMPLOYEES = EMPLOYEES;
  window.currentFilteredEmployees = currentFilteredEmployees;
  console.log(
    '[Access Scope]',
    currentUserRole,
    currentUserAccess,
    'visible employees:',
    EMPLOYEES.length
  );
  if (typeof renderRoster === 'function') {
    renderRoster();
  } else if (typeof renderEmployeeRoster === 'function') {
    renderEmployeeRoster();
  }
  if (typeof renderKpiEmployeeMetrics === 'function') {
    renderKpiEmployeeMetrics();
  }
  if (typeof populateDepartmentFilter === 'function') {
    populateDepartmentFilter();
  }
  if (typeof renderDepartmentSummary === 'function') {
    renderDepartmentSummary();
  }
  if (typeof applySupervisorDashboardView === 'function') {
    applySupervisorDashboardView();
  }
  if (typeof renderBasicDashboardKpis === 'function') {
    renderBasicDashboardKpis();
  }

  return EMPLOYEES;
}

function renderBasicDashboardKpis() {
  const employees =
    Array.isArray(EMPLOYEES) && EMPLOYEES.length
      ? EMPLOYEES
      : Array.isArray(window.ALL_EMPLOYEES)
        ? window.ALL_EMPLOYEES
        : [];

  const activeEmployees = employees.filter((e) => {
    const status = String(e.status || e.displayStatus || '').toUpperCase();
    return status !== 'TERMINATED' && status !== 'INACTIVE' && status !== 'ARCHIVED';
  });

  const departments = new Set(
    activeEmployees.map((e) => String(e.department || e.dept || '').trim()).filter(Boolean)
  );

  setText('kActiveHC', String(activeEmployees.length));

  const rosterCount = safeGet('employeeRosterCount');
  if (rosterCount) {
    rosterCount.textContent = `Showing ${activeEmployees.length} employee${activeEmployees.length === 1 ? '' : 's'}`;
  }
  setText('kDepartments', String(departments.size));
  setText(
    'kOnLeave',
    String(employees.filter((e) => String(e.status || '').toUpperCase() === 'LEAVE').length)
  );
  fillEmptyKpiValue('kOpenDiscipline', '0');
  fillEmptyKpiValue('kReviewsDue', '0');
  fillEmptyKpiValue('kImpactPlayers', '0');
  fillEmptyKpiValue('kAtRiskEmployees', '0');
  fillEmptyKpiValue('kTurnoverRisk', '0');
  fillEmptyKpiValue('kTurnoverRate', '0.0%');
  fillEmptyKpiValue('kNewHireTurnover', '0.0%');
}

function fillEmptyKpiValue(id, fallbackValue = '0') {
  const el = safeGet(id);
  if (!el) return;

  const currentValue = String(el.textContent || '').trim();

  if (!currentValue || currentValue === '—' || currentValue === '-') {
    el.textContent = fallbackValue;
  }
}

function cleanReviewDashboardLooseCount() {
  const reviewCard =
    findDashboardCardByTitle('Review Dashboard') ||
    document.querySelector('#reviewDashboardCard, .review-dashboard-card');
  if (!reviewCard) return;

  Array.from(reviewCard.childNodes || []).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = String(node.textContent || '').trim();
    if (/^\d+$/.test(text)) {
      node.textContent = '';
    }
  });

  Array.from(reviewCard.querySelectorAll('div, span, p')).forEach((el) => {
    if (el.children.length) return;
    const text = String(el.textContent || '').trim();
    if (/^\d+$/.test(text) && !el.id.startsWith('k')) {
      el.classList.add('hidden');
      el.textContent = '';
    }
  });
}

function bindRosterClickOpenFallback() {
  const rosterRoot =
    safeGet('employeeTableBody') ||
    safeGet('employeeRosterBody') ||
    safeGet('rosterBody') ||
    document;

  rosterRoot.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const clickable = target.closest(
      '[data-employee-id], .employee-row, .roster-row, .employee-name, .link-button'
    );
    if (!clickable) return;

    const row = clickable.closest('tr, [data-employee-id]');
    const employeeId =
      clickable.getAttribute('data-employee-id') ||
      row?.getAttribute('data-employee-id') ||
      row?.dataset?.employeeId ||
      '';
    const nameText = String(clickable.textContent || row?.textContent || '')
      .trim()
      .toLowerCase();

    const employee = getDashboardEmployees().find((emp) => {
      const ids = [emp.id, emp.dbId, emp.employee_id, emp.displayId].filter(Boolean).map(String);
      if (employeeId && ids.includes(String(employeeId))) return true;
      return (
        employeeId === '' &&
        nameText &&
        employeeDisplayName(emp).toLowerCase() &&
        nameText.includes(employeeDisplayName(emp).toLowerCase())
      );
    });

    if (!employee) return;

    event.preventDefault();
    event.stopPropagation();

    if (typeof window.openEmployeeDrawer === 'function') {
      window.openEmployeeDrawer(employee.id || employee.dbId || employee.employee_id);
      setTimeout(() => ensureDrawerTabFallbacks(employee), 150);
      return;
    }

    if (typeof openEmployeeDrawer === 'function') {
      openEmployeeDrawer(employee.id || employee.dbId || employee.employee_id);
      setTimeout(() => ensureDrawerTabFallbacks(employee), 150);
      return;
    }

    if (typeof window.openEmployeeDetails === 'function') {
      window.openEmployeeDetails(employee.id || employee.dbId || employee.employee_id);
      setTimeout(() => ensureDrawerTabFallbacks(employee), 150);
      return;
    }

    if (typeof openEmployeeDetails === 'function') {
      openEmployeeDetails(employee.id || employee.dbId || employee.employee_id);
      setTimeout(() => ensureDrawerTabFallbacks(employee), 150);
      return;
    }
  });
}

window.renderBasicDashboardKpis = renderBasicDashboardKpis;
window.cleanReviewDashboardLooseCount = cleanReviewDashboardLooseCount;
window.bindRosterClickOpenFallback = bindRosterClickOpenFallback;

function getDashboardEmployees() {
  if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) return EMPLOYEES;
  if (Array.isArray(window.EMPLOYEES) && window.EMPLOYEES.length) return window.EMPLOYEES;
  if (Array.isArray(window.ALL_EMPLOYEES) && window.ALL_EMPLOYEES.length)
    return window.ALL_EMPLOYEES;
  return [];
}

function isActiveDashboardEmployee(employee) {
  const status = String(employee?.status || employee?.displayStatus || '')
    .trim()
    .toUpperCase();
  return status !== 'TERMINATED' && status !== 'INACTIVE' && status !== 'ARCHIVED';
}

function findDashboardCardByTitle(titleText) {
  const normalizedTitle = String(titleText || '')
    .trim()
    .toLowerCase();
  return (
    Array.from(document.querySelectorAll('.card, .panel, section, article, div')).find((el) => {
      const heading = el.querySelector(
        'h1, h2, h3, h4, h5, h6, .card-title, .section-title, .panel-title, .dashboard-card-title'
      );
      const headingText = String(heading?.textContent || '')
        .trim()
        .toLowerCase();
      if (headingText === normalizedTitle) return true;

      const ownText = Array.from(el.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return ownText === normalizedTitle;
    }) || null
  );
}

function getOrCreateDashboardSectionBody(titleText, preferredId) {
  const existing = safeGet(preferredId);
  if (existing && !existing.closest('.kpi-card, .metric-card, .stat-card, .review-stat')) {
    return existing;
  }

  const normalizedTitle = String(titleText || '')
    .trim()
    .toLowerCase();
  const cards = Array.from(document.querySelectorAll('.dashboard-card, .dashboard-section'));
  const card = cards.find((el) => {
    if (el.closest('.kpi-card, .metric-card, .stat-card, .review-stat')) return false;

    const heading = el.querySelector(
      'h1, h2, h3, h4, h5, h6, .card-title, .section-title, .panel-title, .dashboard-card-title'
    );
    const headingText = String(heading?.textContent || '')
      .trim()
      .toLowerCase();
    return headingText === normalizedTitle;
  });

  if (!card) return null;

  let body = card.querySelector(
    '.card-body, .panel-body, .dashboard-card-body, .section-body, [data-dashboard-body="true"]'
  );
  if (body) {
    body.id = preferredId;
    return body;
  }

  return null;
}

function findDashboardValueCardByLabel(labelText) {
  const normalizedLabel = String(labelText || '')
    .trim()
    .toLowerCase();

  return (
    Array.from(document.querySelectorAll('.review-stat, .metric-card, .dashboard-stat')).find(
      (el) => {
        const text = String(el.textContent || '')
          .trim()
          .toLowerCase();

        return text.includes(normalizedLabel);
      }
    ) || null
  );
}

function setDashboardMetricByLabel(labelText, value) {
  const card = findDashboardValueCardByLabel(labelText);
  if (!card) return;
  const valueEl =
    card.querySelector('.kpi-value, .metric-value, .stat-value, strong, b') ||
    Array.from(card.children || []).find((child) =>
      /^[-—\d]+$/.test(String(child.textContent || '').trim())
    );
  if (valueEl) {
    valueEl.textContent = String(value);
    return;
  }
  const labelNode = Array.from(card.childNodes || []).find((node) =>
    String(node.textContent || '')
      .trim()
      .toLowerCase()
      .includes(
        String(labelText || '')
          .trim()
          .toLowerCase()
      )
  );
  if (labelNode && labelNode.nextSibling) {
    labelNode.nextSibling.textContent = String(value);
  }
}

function employeeDisplayName(employee) {
  return (
    String(
      employee?.displayName ||
        `${employee?.first || employee?.first_name || ''} ${employee?.last || employee?.last_name || ''}`
    ).trim() || 'Employee'
  );
}

function daysUntilDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date - today) / 86400000);
}

async function loadSummaryMetricsFallback() {
  renderBasicDashboardKpis();
}

async function loadReviewDashboardFallback() {
  const employees = getDashboardEmployees().filter(isActiveDashboardEmployee);
  const reviewRows = employees
    .map((employee) => {
      const nextReview =
        employee.next_review_date || employee.nextReviewDate || employee.nextReview || '';
      const days = daysUntilDate(nextReview);
      return { employee, nextReview, days };
    })
    .filter((row) => row.nextReview)
    .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999));

  const overdue = reviewRows.filter((row) => row.days !== null && row.days < 0).length;
  const dueSoon = reviewRows.filter(
    (row) => row.days !== null && row.days >= 0 && row.days <= 30
  ).length;

  fillEmptyKpiValue('kReviewsDue', String(dueSoon));
  cleanReviewDashboardLooseCount();
  setDashboardMetricByLabel('Overdue Reviews', overdue);
  setDashboardMetricByLabel('Due in 30 Days', dueSoon);
  setDashboardMetricByLabel('Completed in 30 Days', '0');

  const tableBody =
    safeGet('reviewDashboardBody') ||
    safeGet('reviewsDashboardBody') ||
    document.querySelector(
      '#reviewDashboard tbody, #reviewsDashboard tbody, #tab-reviews-dashboard tbody'
    );

  if (!tableBody) return;

  const rowsToShow = reviewRows.slice(0, 8);
  if (!rowsToShow.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No review dates found.</td></tr>';
    return;
  }

  tableBody.innerHTML = rowsToShow
    .map((row) => {
      const employee = row.employee;
      const status = row.days < 0 ? 'Overdue' : row.days <= 30 ? 'Due Soon' : 'Scheduled';
      return `
            <tr>
                <td><button class="link-button" type="button" data-employee-id="${esc(employee.id || employee.dbId || employee.employee_id || '')}">${esc(employeeDisplayName(employee))}</button></td>
                <td>${esc(employee.department || employee.dept || '')}</td>
                <td>${esc(row.nextReview || '—')}</td>
                <td>—</td>
                <td>—</td>
                <td>${esc(status)}</td>
            </tr>
        `;
    })
    .join('');
}

async function loadExecutiveInsightFallback() {
  const employees = getDashboardEmployees();
  const activeEmployees = employees.filter(isActiveDashboardEmployee);
  const onLeave = employees.filter(
    (employee) => String(employee.status || '').toUpperCase() === 'LEAVE'
  ).length;
  const departments = new Set(
    activeEmployees
      .map((employee) => String(employee.department || employee.dept || '').trim())
      .filter(Boolean)
  );

  const insightEl = getOrCreateDashboardSectionBody('Executive Insight', 'executiveInsight');

  if (!insightEl) return;

  insightEl.innerHTML = `
        <div class="insight-line"><strong>${activeEmployees.length}</strong> active employees across <strong>${departments.size}</strong> department${departments.size === 1 ? '' : 's'}.</div>
        <div class="insight-line">${onLeave} employee${onLeave === 1 ? '' : 's'} currently marked on leave.</div>
        <div class="insight-line">Review, risk, and impact lists are being calculated from current employee records.</div>
    `;
}

async function loadRiskEmployeesFallback() {
  const employees = getDashboardEmployees().filter(isActiveDashboardEmployee);
  const riskEmployees = employees.filter((employee) => {
    const key = String(employee.dbId || employee.id || employee.employee_id || '');
    const manualRisk =
      currentAtRiskRosterMap?.[key]?.manualReason ||
      employee.at_risk_reason ||
      employee.risk_reason;
    const status = String(employee.risk_status || employee.turnover_risk || '').toLowerCase();
    return Boolean(manualRisk) || status.includes('risk') || status === 'high';
  });

  setText('kAtRiskEmployees', String(riskEmployees.length));

  const container =
    safeGet('riskEmployees') ||
    getOrCreateDashboardSectionBody('At-Risk Employees', 'riskEmployees');

  if (!container) return;

  if (!riskEmployees.length) {
    container.innerHTML = '<div class="empty">No at-risk employees currently flagged.</div>';
    return;
  }

  container.innerHTML = riskEmployees
    .slice(0, 8)
    .map(
      (employee) => `
        <div class="dashboard-list-item">
            <strong>${esc(employeeDisplayName(employee))}</strong>
            <span>${esc(employee.department || employee.dept || '')}</span>
        </div>
    `
    )
    .join('');
}

async function loadImpactPlayersFallback() {
  const employees = getDashboardEmployees().filter(isActiveDashboardEmployee);
  const impactPlayers = employees.filter((employee) => {
    const key = String(employee.dbId || employee.id || employee.employee_id || '');
    const manualImpact =
      currentImpactPlayerRosterMap?.[key]?.manualReason || employee.impact_reason;
    const flag = employee.impact_player || employee.is_impact_player || employee.impactPlayer;
    return Boolean(manualImpact) || flag === true || String(flag || '').toLowerCase() === 'true';
  });

  setText('kImpactPlayers', String(impactPlayers.length));

  const container = getOrCreateDashboardSectionBody('Impact Players', 'impactPlayersDashboardList');

  if (!container) return;

  if (!impactPlayers.length) {
    container.innerHTML = '<div class="empty">No impact players currently flagged.</div>';
    return;
  }

  container.innerHTML = impactPlayers
    .slice(0, 8)
    .map(
      (employee) => `
        <div class="dashboard-list-item">
            <strong>${esc(employeeDisplayName(employee))}</strong>
            <span>${esc(employee.department || employee.dept || '')}</span>
        </div>
    `
    )
    .join('');
}

async function loadRecentActivityFallback() {
  const audit = typeof getAuditTrail === 'function' ? getAuditTrail() : [];
  const container = getOrCreateDashboardSectionBody('Recent HR Activity', 'recentHrActivityList');

  if (!container) return;

  if (!audit.length) {
    container.innerHTML = '<div class="empty">No recent HR activity yet.</div>';
    return;
  }

  container.innerHTML = audit
    .slice(0, 8)
    .map(
      (item) => `
        <div class="dashboard-list-item">
            <strong>${esc(item.action || 'Activity')}</strong>
            <span>${esc(item.employeeName || '')}</span>
            <small>${item.timestamp ? esc(new Date(item.timestamp).toLocaleString()) : ''}</small>
        </div>
    `
    )
    .join('');
}

window.loadReviewDashboardFallback = loadReviewDashboardFallback;
window.loadExecutiveInsightFallback = loadExecutiveInsightFallback;
window.loadRiskEmployeesFallback = loadRiskEmployeesFallback;
window.loadImpactPlayersFallback = loadImpactPlayersFallback;
window.loadRecentActivityFallback = loadRecentActivityFallback;

// =========================
// CANDIDATES
// =========================
async function loadCandidates() {
  const body = safeGet('candidateBody');
  if (body) {
    body.innerHTML = `
            <tr class="skeleton-row">
                <td><span class="skeleton-line medium"></span></td>
                <td><span class="skeleton-line medium"></span></td>
                <td><span class="skeleton-line short"></span></td>
                <td><span class="skeleton-line short"></span></td>
                <td><span class="skeleton-line medium"></span></td>
            </tr>
            <tr class="skeleton-row">
                <td><span class="skeleton-line medium"></span></td>
                <td><span class="skeleton-line medium"></span></td>
                <td><span class="skeleton-line short"></span></td>
                <td><span class="skeleton-line short"></span></td>
                <td><span class="skeleton-line medium"></span></td>
            </tr>
        `;
  }
  try {
    const { data, error } = await supabaseClient
      .from('candidates')
      .select('*')
      .neq('stage', 'Hired')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      if (body) {
        body.innerHTML = '<tr><td colspan="5" class="empty">Could not load candidates.</td></tr>';
      }
      setText('candidateCount', 'Candidates unavailable');
      return;
    }
    CANDIDATES = data || [];
    renderCandidates();
  } catch (err) {
    console.error(err);
    if (body) {
      body.innerHTML = '<tr><td colspan="5" class="empty">Could not load candidates.</td></tr>';
    }
    setText('candidateCount', 'Candidates unavailable');
  }
}
function buildCandidateInterviewNotice(candidate) {
  const status = String(candidate?.interview_status || '').toLowerCase();
  if (status === 'cancelled' || status === 'completed' || status === 'no show') return '';
  if (!candidate?.interview_date || !candidate?.interview_time) return '';
  const interviewDateTime = new Date(`${candidate.interview_date}T${candidate.interview_time}`);
  const now = new Date();
  if (Number.isNaN(interviewDateTime.getTime())) return '';
  if (interviewDateTime <= now) return '';
  const date = interviewDateTime.toLocaleDateString();
  const time = interviewDateTime.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const type = candidate.interview_type ? ` • ${candidate.interview_type}` : '';
  return `Upcoming Interview: ${date} at ${time}${type}`;
}
function renderCandidates() {
  const pipeline = safeGet('candidatePipeline');
  const tableBody = safeGet('candidateBody');
  const stages = ['Applied', 'Screening', 'Interviewing', 'Offer'];
  setText('candidateCount', `${CANDIDATES.length} candidate${CANDIDATES.length === 1 ? '' : 's'}`);
  if (tableBody) {
    if (!CANDIDATES.length) {
      tableBody.innerHTML = '<tr><td colspan="5" class="empty">No candidates in pipeline</td></tr>';
    } else {
      tableBody.innerHTML = CANDIDATES.map((candidate) => {
        const candidateName =
          `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'Candidate';
        const appliedDate = candidate.applied_date || candidate.created_at || '';
        const interviewNotice = buildCandidateInterviewNotice(candidate);
        return `
                    <tr class="candidate-row" data-candidate-id="${esc(candidate.id)}" style="cursor:pointer;">
                        <td>
                            <button class="link-button" type="button" data-candidate-id="${esc(candidate.id)}">
                                ${esc(candidateName)}
                            </button>
                        </td>
                        <td>${esc(candidate.position || '')}</td>
                        <td>
                          ${esc(candidate.stage || 'Applied')}
                          ${interviewNotice ? `<div class="candidate-interview-alert">${esc(interviewNotice)}</div>` : ''}
                        </td>
                        <td>${esc(candidate.source || '')}</td>
                        <td>${appliedDate ? esc(new Date(appliedDate).toLocaleDateString()) : '—'}</td>
                    </tr>
                `;
      }).join('');
      tableBody.querySelectorAll('[data-candidate-id]').forEach((el) => {
        el.addEventListener('click', async (event) => {
          event.stopPropagation();
          if (typeof window.openCandidateDetails === 'function') {
            await window.openCandidateDetails(el.dataset.candidateId);
            return;
          }
          await openCandidateDrawer(el.dataset.candidateId);
        });
      });
    }
  }
  if (!pipeline) return;
}
async function updateCandidateStage(candidateId, stage) {
  // If a candidate is moved to Hired, convert them into a real employee record instead of only hiding them from the candidate pipeline.
  if (
    String(stage || '')
      .trim()
      .toLowerCase() === 'hired'
  ) {
    await convertCandidateToEmployee(candidateId);
    return;
  }
  const { error } = await supabaseClient.from('candidates').update({ stage }).eq('id', candidateId);
  if (error) {
    console.error(error);
    showToast('Could not update candidate stage.', 'error');
    await loadCandidates();
    return;
  }
  showToast('Candidate stage updated.');
  await loadCandidates();
}
function generateEmployeeId() {
  const maxExisting = EMPLOYEES.reduce((max, employee) => {
    const match = String(employee.employee_id || employee.displayId || employee.id || '').match(
      /(\d+)$/
    );
    const numeric = match ? Number(match[1]) : 0;
    return Math.max(max, numeric);
  }, 0);
  return `BTW${maxExisting + 1}`;
}
async function generateAvailableEmployeeId() {
  const usedNumbers = new Set();
  const collectNumber = (value) => {
    const match = String(value || '').match(/(\d+)$/);
    if (match) usedNumbers.add(Number(match[1]));
  };
  EMPLOYEES.forEach((employee) => {
    collectNumber(employee.employee_id || employee.displayId || employee.id);
  });
  try {
    const [employeeRes, onboardingRes] = await Promise.all([
      supabaseClient.from('employees').select('id'),
      supabaseClient.from('onboarding_tasks').select('employee_id'),
    ]);
    if (!employeeRes.error) {
      (employeeRes.data || []).forEach((row) => {
        collectNumber(row.id);
      });
    }
    if (!onboardingRes.error) {
      (onboardingRes.data || []).forEach((row) => {
        collectNumber(row.employee_id);
      });
    }
  } catch (err) {
    console.warn(
      'Could not check existing employee/onboarding IDs. Falling back to local employee list.',
      err
    );
  }
  let nextNumber = usedNumbers.size ? Math.max(...usedNumbers) + 1 : 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }
  return `BTW${nextNumber}`;
}
async function createDefaultOnboardingTasks(employeeId) {
  if (!employeeId) return;
  const defaultTasks = [
    'Complete I-9',
    'Complete W-4',
    'Sign Employee Handbook',
    'Safety Training',
    'Set Up System Access',
  ];
  const { data: existingTasks, error: existingError } = await supabaseClient
    .from('onboarding_tasks')
    .select('task_name')
    .eq('employee_id', employeeId);
  if (existingError) {
    console.warn('Could not check existing onboarding tasks:', existingError);
  }
  const existingTaskNames = new Set(
    (existingTasks || []).map((task) => String(task.task_name || '').trim())
  );
  const payload = defaultTasks
    .filter((taskName) => !existingTaskNames.has(taskName))
    .map((taskName) => ({
      employee_id: employeeId,
      task_name: taskName,
      status: 'Pending',
    }));
  if (!payload.length) return;
  const { error } = await supabaseClient.from('onboarding_tasks').insert(payload);
  if (error) {
    console.error('Onboarding tasks failed to create:', error);
    showToast('Employee created, but onboarding tasks failed to create.', 'error');
    return;
  }
  console.log('✅ Default onboarding tasks created:', employeeId);
}
async function loadOnboardingTasks(employeeId) {
  if (!employeeId) return;
  let { data, error } = await supabaseClient
    .from('onboarding_tasks')
    .select('*')
    .eq('employee_id', employeeId)
    .order('task_name', { ascending: true });
  if (error) {
    console.error('Could not load onboarding tasks:', error);
    return;
  }
  // If this employee has no onboarding rows yet, create the default packet now and reload it.
  // This covers candidates converted while database triggers are disabled.
  if (!data || data.length === 0) {
    await createDefaultOnboardingTasks(employeeId);
    const retry = await supabaseClient
      .from('onboarding_tasks')
      .select('*')
      .eq('employee_id', employeeId)
      .order('task_name', { ascending: true });
    if (retry.error) {
      console.error('Could not reload onboarding tasks:', retry.error);
      return;
    }
    data = retry.data || [];
  }
  const tasks = data || [];
  const container = document.getElementById('onboardingChecklist');
  const summary = document.getElementById('onboardingSummary');
  const bar = document.getElementById('onboardingProgressBar');
  if (!container) return;
  if (!tasks.length) {
    container.innerHTML = '<div class="empty">No onboarding tasks.</div>';
    if (summary) summary.textContent = '0 of 0 complete';
    if (bar) bar.style.width = '0%';
    return;
  }
  const completed = tasks.filter(
    (task) => String(task.status || '').toLowerCase() === 'completed'
  ).length;
  const percent = Math.round((completed / tasks.length) * 100);
  container.innerHTML = tasks
    .map(
      (task) => `
        <div class="onboarding-task" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #e5e7eb;">
            <input type="checkbox"
                ${String(task.status || '').toLowerCase() === 'completed' ? 'checked' : ''}
                onchange="toggleOnboardingTask('${task.id}', this.checked)">
            <span>${esc(task.task_name || 'Onboarding task')}</span>
        </div>
    `
    )
    .join('');
  if (summary) summary.textContent = `${completed} of ${tasks.length} complete`;
  if (bar) bar.style.width = `${percent}%`;
}
async function toggleOnboardingTask(taskId, isComplete) {
  if (!taskId) return;
  const { error } = await supabaseClient
    .from('onboarding_tasks')
    .update({ status: isComplete ? 'Completed' : 'Pending' })
    .eq('id', taskId);
  if (error) {
    console.error('Could not update onboarding task:', error);
    showToast('Could not update onboarding task.', 'error');
    return;
  }
  const employeeId =
    currentEmployee?.employee_id || currentEmployee?.id || currentEmployee?.dbId || '';
  await loadOnboardingTasks(employeeId);
}
window.loadOnboardingTasks = loadOnboardingTasks;
window.toggleOnboardingTask = toggleOnboardingTask;
async function convertCandidateToEmployee(candidateId) {
  const candidate = CANDIDATES.find((item) => String(item.id) === String(candidateId));
  if (!candidate) {
    showToast('Candidate not found.', 'error');
    return;
  }
  if (
    String(candidate.stage || '')
      .trim()
      .toLowerCase() === 'hired'
  ) {
    showToast('Candidate is already marked as hired.', 'info');
    return;
  }
  if (candidate.__isConvertingToEmployee === true) {
    showToast('Candidate conversion is already in progress.', 'info');
    return;
  }
  candidate.__isConvertingToEmployee = true;
  const conversionButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
    const text = String(button.textContent || '')
      .trim()
      .toLowerCase();
    return text === 'hire' || text === 'move to next stage' || text === 'convert to employee';
  });
  conversionButtons.forEach((button) => {
    button.disabled = true;
    button.dataset.originalText = button.dataset.originalText || button.textContent;
    button.textContent = 'Converting...';
  });
  let newEmployeeId = await generateAvailableEmployeeId();
  const payload = {
    id: newEmployeeId,
    first_name: candidate.first_name || '',
    last_name: candidate.last_name || '',
    department: candidate.department || '',
    position: candidate.position || '',
    supervisor: '',
    status: 'ACTIVE',
    pay_type: null,
    standard_hours: 40,
    benefits_status: null,
    hire_date: todayInputValue(),
    next_review_date: (() => {
      // New hires get their first annual review one year from hire date.
      const hireDate = todayInputValue();
      const date = new Date(`${hireDate}T00:00:00`);
      date.setFullYear(date.getFullYear() + 1);
      return date.toISOString().slice(0, 10);
    })(),
    anniversary_date: (() => {
      const hireDate = new Date(`${todayInputValue()}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const anniversary = new Date(today.getFullYear(), hireDate.getMonth(), hireDate.getDate());
      if (anniversary < today) anniversary.setFullYear(anniversary.getFullYear() + 1);
      return anniversary.toISOString().slice(0, 10);
    })(),
    tenure_bracket: '0-6 months',
  };
  let data = null;
  let error = null;
  const result = await supabaseClient
    .from('employees')
    .insert([{ ...payload, id: newEmployeeId }])
    .select();
  data = result.data;
  error = result.error;
  if (error) {
    console.error(error);
    showToast(error.message || 'Could not convert candidate to employee.', 'error');
    candidate.__isConvertingToEmployee = false;
    conversionButtons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
    });
    return;
  }
  // 🔥 FIX: update GLOBAL state and force UI refresh
  if (!Array.isArray(window.EMPLOYEES)) {
    window.EMPLOYEES = [];
  }
  if (data && data[0]) {
    const normalizedNewEmployee =
      typeof normalizeEmployee === 'function' ? normalizeEmployee(data[0]) : data[0];
    const exists = window.EMPLOYEES.some(
      (e) =>
        String(e.id || '') === String(normalizedNewEmployee.id || '') ||
        String(e.employee_id || '') === String(normalizedNewEmployee.employee_id || '')
    );
    if (!exists) {
      window.EMPLOYEES.unshift(normalizedNewEmployee);
    }
    EMPLOYEES = window.EMPLOYEES;
  }
  // 🔥 FORCE roster to re-render immediately
  if (typeof renderEmployeeRoster === 'function') {
    renderEmployeeRoster();
  }
  const { error: candidateError } = await supabaseClient
    .from('candidates')
    .update({ stage: 'Hired' })
    .eq('id', candidate.id);
  if (candidateError) {
    console.error(candidateError);
    showToast('Employee created, but candidate stage did not update.', 'error');
  } else {
    console.log('✅ Candidate converted:', newEmployeeId);
    await createDefaultOnboardingTasks(newEmployeeId);
    showToast('Candidate converted to employee.');
  }
  await loadEmployees();
  await loadCandidates();
  await loadSummaryMetrics();
  await loadRecentActivity();
  await loadReviewDashboard();
  const refreshedEmployee = EMPLOYEES.find(
    (e) => String(e.employee_id || e.id) === String(newEmployeeId)
  );
  if (refreshedEmployee && typeof window.openDrawer === 'function') {
    closeCandidateDrawer();
    window.openDrawer(refreshedEmployee);
    switchTab('onboarding');
    const onboardingEmployeeId =
      refreshedEmployee.employee_id || refreshedEmployee.id || refreshedEmployee.dbId;
    await createDefaultOnboardingTasks(onboardingEmployeeId);
    await loadOnboardingTasks(onboardingEmployeeId);
  }
  candidate.__isConvertingToEmployee = false;
  conversionButtons.forEach((button) => {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  });
}
function switchCandidateTab(tabName) {
  document.querySelectorAll('[data-candidate-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.candidateTab === tabName);
  });
  document.querySelectorAll('#candidateDrawer .tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `candidate-tab-${tabName}`);
  });
}
function closeCandidateDrawer() {
  safeGet('drawerBackdrop')?.classList.remove('open');
  const drawer = safeGet('candidateDrawer');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.style.display = '';
  }
  currentCandidate = null;
  isCreatingCandidate = false;
}
function resetCandidateForm() {
  if (safeGet('candidateFirstNameInput')) safeGet('candidateFirstNameInput').value = '';
  if (safeGet('candidateLastNameInput')) safeGet('candidateLastNameInput').value = '';
  if (safeGet('candidateEmailInput')) safeGet('candidateEmailInput').value = '';
  if (safeGet('candidatePhoneInput')) safeGet('candidatePhoneInput').value = '';
  if (safeGet('candidatePositionInput')) safeGet('candidatePositionInput').value = '';
  if (safeGet('candidateDepartmentInput')) safeGet('candidateDepartmentInput').value = '';
  if (safeGet('candidateStageInput')) safeGet('candidateStageInput').value = 'Applied';
  if (safeGet('candidateSourceInput')) safeGet('candidateSourceInput').value = '';
  if (safeGet('candidateAppliedDateInput'))
    safeGet('candidateAppliedDateInput').value = todayInputValue();
  if (safeGet('candidateNotesInput')) safeGet('candidateNotesInput').value = '';
  if (safeGet('candidateNotesPreview'))
    safeGet('candidateNotesPreview').innerHTML =
      '<div class="empty">Candidate notes will appear here.</div>';
}
function openNewCandidateForm() {
  currentCandidate = null;
  isCreatingCandidate = true;
  resetCandidateForm();
  setText('candidateDrawerTitle', 'New Candidate');
  setText('candidateDrawerSub', 'Create candidate record');
  switchCandidateTab('profile');
  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('candidateDrawer');
  if (backdrop) backdrop.classList.add('open');
  if (drawer) {
    drawer.classList.add('open');
    drawer.style.display = 'block';
    drawer.style.zIndex = '99999';
  }
}
async function openCandidateDrawer(candidateId) {
  const candidate = CANDIDATES.find((item) => String(item.id) === String(candidateId));

  if (!candidate) {
    showToast('Candidate not found.', 'error');
    return;
  }

  currentCandidate = candidate;
  isCreatingCandidate = false;
  resetCandidateForm();

  if (safeGet('candidateFirstNameInput'))
    safeGet('candidateFirstNameInput').value = candidate.first_name || '';

  if (safeGet('candidateLastNameInput'))
    safeGet('candidateLastNameInput').value = candidate.last_name || '';

  if (safeGet('candidateEmailInput')) safeGet('candidateEmailInput').value = candidate.email || '';

  if (safeGet('candidatePhoneInput')) safeGet('candidatePhoneInput').value = candidate.phone || '';

  if (safeGet('candidatePositionInput'))
    safeGet('candidatePositionInput').value = candidate.position || '';

  if (safeGet('candidateDepartmentInput'))
    safeGet('candidateDepartmentInput').value = candidate.department || '';

  if (safeGet('candidateStageInput'))
    safeGet('candidateStageInput').value = candidate.stage || 'Applied';

  if (safeGet('candidateSourceInput'))
    safeGet('candidateSourceInput').value = candidate.source || '';

  if (safeGet('candidateAppliedDateInput'))
    safeGet('candidateAppliedDateInput').value = candidate.applied_date || todayInputValue();

  if (safeGet('candidateNotesInput')) safeGet('candidateNotesInput').value = candidate.notes || '';

  if (safeGet('candidateNotesPreview')) {
    safeGet('candidateNotesPreview').innerHTML = candidate.notes
      ? `<div class="history-item"><div class="history-title">Current Notes</div><div class="history-body">${nl2br(candidate.notes)}</div></div>`
      : '<div class="empty">No candidate notes yet.</div>';
  }

  if (safeGet('candidateInterviewDate'))
    safeGet('candidateInterviewDate').value = candidate.interview_date || '';

  if (safeGet('candidateInterviewTime'))
    safeGet('candidateInterviewTime').value = candidate.interview_time || '';

  if (safeGet('candidateInterviewType'))
    safeGet('candidateInterviewType').value = candidate.interview_type || '';

  if (safeGet('candidateInterviewStatus'))
    safeGet('candidateInterviewStatus').value = candidate.interview_status || 'Scheduled';

  if (safeGet('candidateInterviewNotes'))
    safeGet('candidateInterviewNotes').value = candidate.interview_notes || '';

  setText(
    'candidateDrawerTitle',
    `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'Candidate'
  );

  setText(
    'candidateDrawerSub',
    `${candidate.position || 'Candidate'} • ${candidate.stage || 'Applied'}`
  );

  switchCandidateTab('profile');

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('candidateDrawer');

  if (backdrop) backdrop.classList.add('open');

  if (drawer) {
    drawer.classList.add('open');
    drawer.style.display = 'block';
    drawer.style.zIndex = '99999';
  }
}
async function saveCandidateRecord() {
  const payload = {
    first_name: safeGet('candidateFirstNameInput')?.value?.trim() || '',
    last_name: safeGet('candidateLastNameInput')?.value?.trim() || '',
    email: safeGet('candidateEmailInput')?.value?.trim() || '',
    phone: safeGet('candidatePhoneInput')?.value?.trim() || '',
    position: safeGet('candidatePositionInput')?.value?.trim() || '',
    department: safeGet('candidateDepartmentInput')?.value?.trim() || '',
    stage: safeGet('candidateStageInput')?.value || 'Applied',
    source: safeGet('candidateSourceInput')?.value?.trim() || '',
    applied_date: safeGet('candidateAppliedDateInput')?.value || null,
    notes: safeGet('candidateNotesInput')?.value || '',
    interview_date: safeGet('candidateInterviewDate')?.value || null,
    interview_time: safeGet('candidateInterviewTime')?.value || null,
    interview_type: safeGet('candidateInterviewType')?.value || '',
    interview_status: safeGet('candidateInterviewStatus')?.value || '',
    interview_notes: safeGet('candidateInterviewNotes')?.value || '',
  };
  if (!payload.first_name || !payload.last_name) {
    showToast('First and last name are required.', 'error');
    return;
  }
  let error = null;
  if (isCreatingCandidate || !currentCandidate) {
    const result = await supabaseClient.from('candidates').insert([payload]);
    error = result.error;
  } else {
    const result = await supabaseClient
      .from('candidates')
      .update(payload)
      .eq('id', currentCandidate.id);
    error = result.error;
  }
  if (error) {
    console.error('Save candidate error:', error);
    showToast(error.message || 'Could not save candidate.', 'error');
    return;
  }
  console.log('Candidate saved successfully:', payload);
  showToast(isCreatingCandidate ? 'Candidate created.' : 'Candidate updated.');
}

function renderSavedDisciplineReportImmediately(report) {
  const history = safeGet('disciplineHistory');
  if (!history || !report) return;

  const existingEmpty = history.querySelector('.empty');
  if (existingEmpty) {
    existingEmpty.remove();
  }

  const existingCard = history.querySelector(`[data-discipline-id="${report.id}"]`);
  if (existingCard) {
    existingCard.remove();
  }

  const issueType = report.issue_type || report.type || 'Not specified';
  const level = report.level || report.discipline_level || 'Not specified';
  const date = report.date ? new Date(`${report.date}T00:00:00`).toLocaleDateString() : 'No date';
  const description = report.description || '';
  const actionTaken = report.action_taken || report.corrective_action || '';
  const status = report.status || 'Open';

  const card = document.createElement('div');
  card.className = 'history-item';
  card.dataset.disciplineId = report.id || '';
  card.innerHTML = `
        <div class="history-title">
            ${esc(issueType)} • ${esc(level)}
        </div>
        <div class="history-meta">
            ${esc(date)} • ${esc(status)}
        </div>
        ${description ? `<div class="history-body">${nl2br(esc(description))}</div>` : ''}
        ${actionTaken ? `<div class="history-body"><strong>Action Taken:</strong> ${nl2br(esc(actionTaken))}</div>` : ''}
    `;

  history.prepend(card);
}
