function getResolvedMeetingEmployeeId(employeeId = null) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId;
} async function meetingFetchByEmployee(employeeId) {
    const targetId = getResolvedMeetingEmployeeId(employeeId);
    if (!targetId) return { data: [], error: null };
    if (typeof getEmployeeMeetings === 'function') {
        return await getEmployeeMeetings(targetId);
    }
    if (typeof window.getEmployeeMeetings === 'function') {
        return await window.getEmployeeMeetings(targetId);
    }
    return await supabaseClient
        .from('employee_meetings')
        .select('*')
        .eq('employee_id', targetId)
        .order('meeting_date', { ascending: false });
} async function meetingDeleteById(meetingId) {
    if (!meetingId) return { data: null, error: new Error('Missing meeting ID.') };
    if (typeof deleteEmployeeMeetingById === 'function') {
        return await deleteEmployeeMeetingById(meetingId);
    }
    if (typeof window.deleteEmployeeMeetingById === 'function') {
        return await window.deleteEmployeeMeetingById(meetingId);
    }
    return await supabaseClient
        .from('employee_meetings')
        .delete()
        .eq('id', meetingId);
} function getCurrentMeetingId() {
    return window.__currentMeetingId || null;
} function setCurrentMeetingId(value) {
    window.__currentMeetingId = value || null;
} function startMeetingEdit(meeting) {
    resetDrawerForms();
    setCurrentMeetingId(meeting.id);
    if (safeGet('meetingDate')) safeGet('meetingDate').value = meeting.meeting_date || todayInputValue();
    if (safeGet('meetingType')) safeGet('meetingType').value = meeting.meeting_type || '';
    if (safeGet('meetingSubject')) safeGet('meetingSubject').value = meeting.subject || '';
    if (safeGet('meetingNotes')) safeGet('meetingNotes').value = meeting.notes || '';
    if (safeGet('saveMeetingBtn')) safeGet('saveMeetingBtn').textContent = 'Update Meeting';
    safeGet('cancelMeetingEditBtn')?.classList.remove('hidden');
    safeGet('meetingEditStatus')?.classList.remove('hidden');
    switchTab('meetings');
} function cancelMeetingEdit() {
    setCurrentMeetingId(null);
    if (safeGet('meetingDate')) safeGet('meetingDate').value = todayInputValue();
    if (safeGet('meetingType')) safeGet('meetingType').value = '';
    if (safeGet('meetingSubject')) safeGet('meetingSubject').value = '';
    if (safeGet('meetingNotes')) safeGet('meetingNotes').value = '';
    if (safeGet('saveMeetingBtn')) safeGet('saveMeetingBtn').textContent = 'Save Meeting';
    safeGet('cancelMeetingEditBtn')?.classList.add('hidden');
    safeGet('meetingEditStatus')?.classList.add('hidden');
} async function deleteMeetingRecord(meetingId) {
    const employeeId = getResolvedMeetingEmployeeId();
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    }
    const confirmed = window.confirm('Delete this meeting?');
    if (!confirmed) return; const { error } = await meetingDeleteById(String(meetingId)); if (error) {
        console.error(error);
        showToast('Could not delete meeting.', 'error');
        return;
    } if (String(getCurrentMeetingId()) === String(meetingId)) {
        cancelMeetingEdit();
    } showToast('Meeting deleted.');
    await loadEmployeeMeetings(employeeId);
    switchTab('meetings');
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
    if (typeof loadRecentActivity === 'function') await loadRecentActivity();
    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
} async function loadEmployeeMeetings(employeeId) {
    const actualEmployeeId = getResolvedMeetingEmployeeId(employeeId);
    if (!actualEmployeeId) return;
    const target = safeGet('meetingsHistory');
    if (!target) return; const { data, error } = await meetingFetchByEmployee(actualEmployeeId); if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load meetings</div>';
        return;
    } if (!data || !data.length) {
        target.innerHTML = '<div class="empty">No meetings for this employee</div>';
        return;
    } target.innerHTML = data.map(row => `
        <div class="history-item">
          <div class="history-top">
            <div>
              <div class="history-title">${esc(row.meeting_type || 'Meeting')}</div>
              <div class="history-date">${esc(row.meeting_date || '')}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="button soft" type="button" data-edit-meeting-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-meeting-id="${esc(row.id)}">Delete</button>
              <span class="badge badge-soft">Meeting</span>
            </div>
          </div>
          <div class="history-body">
            <strong>Subject:</strong> ${esc(row.subject || '')}
            <br><br>
            <strong>Notes:</strong><br>${nl2br(row.notes || '')}
          </div>
        </div>
      `).join(''); target.querySelectorAll('[data-edit-meeting-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const meeting = data.find(row => String(row.id) === String(btn.dataset.editMeetingId));
            if (meeting) startMeetingEdit(meeting);
        });
    }); target.querySelectorAll('[data-delete-meeting-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteMeetingRecord(btn.dataset.deleteMeetingId));
    });
}
// =========================
// MEETINGS
// =========================async function saveMeetingRecord() {
if (!currentEmployee) return;
const employeeId = getResolvedMeetingEmployeeId();
if (!employeeId) {
    showToast('No employee selected.', 'error');
    return;
} const meeting_date = safeGet('meetingDate')?.value || '';
const meeting_type = safeGet('meetingType')?.value || '';
const subject = safeGet('meetingSubject')?.value.trim() || '';
const notes = safeGet('meetingNotes')?.value.trim() || ''; if (!meeting_date || !notes) {
    showToast('Enter a meeting date and notes.', 'error');
    return;
} const { data: authData } = await supabaseClient.auth.getUser(); let error; if (getCurrentMeetingId()) {
    const result = await supabaseClient
        .from('employee_meetings')
        .update({
            meeting_date,
            meeting_type,
            subject,
            notes,
        })
        .eq('id', getCurrentMeetingId())
        .eq('employee_id', employeeId);
    error = result.error;
} else {
    const result = await supabaseClient
        .from('employee_meetings')
        .insert([{
            employee_id: employeeId,
            meeting_date,
            meeting_type,
            subject,
            notes,
            created_by: authData?.user?.id || null
        }]);
    error = result.error;
} if (error) {
    console.error(error);
    showToast(`Error saving meeting: ${error.message || 'Unknown error'}`, 'error');
    return;
} showToast(getCurrentMeetingId() ? 'Meeting updated.' : 'Meeting saved.');
setCurrentMeetingId(null);
if (safeGet('saveMeetingBtn')) safeGet('saveMeetingBtn').textContent = 'Save Meeting';
if (safeGet('meetingDate')) safeGet('meetingDate').value = todayInputValue();
if (safeGet('meetingType')) safeGet('meetingType').value = '';
if (safeGet('meetingSubject')) safeGet('meetingSubject').value = '';
if (safeGet('meetingNotes')) safeGet('meetingNotes').value = '';
await loadEmployeeMeetings(employeeId);
switchTab('meetings');
if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
if (typeof loadRecentActivity === 'function') await loadRecentActivity();
if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
}// =========================
// GLOBAL EXPORTS
// =========================
window.getResolvedMeetingEmployeeId = getResolvedMeetingEmployeeId;
window.startMeetingEdit = startMeetingEdit;
window.cancelMeetingEdit = cancelMeetingEdit;
window.deleteMeetingRecord = deleteMeetingRecord;
window.loadEmployeeMeetings = loadEmployeeMeetings;
window.saveMeetingRecord = saveMeetingRecord;