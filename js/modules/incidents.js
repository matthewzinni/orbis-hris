let currentIncidentId = null;
function getResolvedIncidentEmployeeId(employeeId = null) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId;
}
async function saveIncidentReport() {
    if (!currentEmployee) {
        showToast('No employee selected.', 'error');
        return;
    }
    const employeeId = getResolvedIncidentEmployeeId();
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    } const payload = {
        employee_id: employeeId,
        incident_date: safeGet('incidentDate')?.value || todayInputValue(),
        incident_type: safeGet('incidentType')?.value || '',
        location: safeGet('incidentLocation')?.value || '',
        description: safeGet('incidentDescription')?.value || '',
        follow_up: safeGet('incidentFollowUp')?.value || '',
        status: safeGet('incidentStatus')?.value || 'Open'
    }; let error; if (currentIncidentId) {
        ({ error } = await supabaseClient
            .from('incident_reports')
            .update(payload)
            .eq('id', currentIncidentId));
    } else {
        ({ error } = await supabaseClient
            .from('incident_reports')
            .insert([payload]));
    } if (error) {
        console.error(error);
        showToast('Could not save incident.', 'error');
        return;
    } showToast(currentIncidentId ? 'Incident updated.' : 'Incident saved.'); cancelIncidentEdit();
    await loadEmployeeIncidents(employeeId);
    switchTab('incidents');
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
    if (typeof loadRecentActivity === 'function') await loadRecentActivity();
    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
} function startIncidentEdit(record) {
    resetDrawerForms();
    currentIncidentId = record.id;
    if (safeGet('incidentDate')) safeGet('incidentDate').value = record.incident_date || todayInputValue();
    if (safeGet('incidentType')) safeGet('incidentType').value = record.incident_type || '';
    if (safeGet('incidentLocation')) safeGet('incidentLocation').value = record.location || '';
    if (safeGet('incidentDescription')) safeGet('incidentDescription').value = record.description || '';
    if (safeGet('incidentFollowUp')) safeGet('incidentFollowUp').value = record.follow_up || '';
    if (safeGet('incidentStatus')) safeGet('incidentStatus').value = record.status || 'Open';
    if (safeGet('saveIncidentBtn')) safeGet('saveIncidentBtn').textContent = 'Update Incident';
    safeGet('cancelIncidentEditBtn')?.classList.remove('hidden');
    safeGet('incidentEditStatus')?.classList.remove('hidden');
    switchTab('incidents');
} function cancelIncidentEdit() {
    currentIncidentId = null;
    if (safeGet('incidentDate')) safeGet('incidentDate').value = todayInputValue();
    if (safeGet('incidentType')) safeGet('incidentType').value = '';
    if (safeGet('incidentLocation')) safeGet('incidentLocation').value = '';
    if (safeGet('incidentDescription')) safeGet('incidentDescription').value = '';
    if (safeGet('incidentFollowUp')) safeGet('incidentFollowUp').value = '';
    if (safeGet('incidentStatus')) safeGet('incidentStatus').value = 'Open';
    if (safeGet('saveIncidentBtn')) safeGet('saveIncidentBtn').textContent = 'Save Incident';
    safeGet('cancelIncidentEditBtn')?.classList.add('hidden');
    safeGet('incidentEditStatus')?.classList.add('hidden');
} async function deleteIncidentRecord(recordId) {
    const employeeId = getResolvedIncidentEmployeeId();
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    }
    const confirmed = window.confirm('Delete this incident?');
    if (!confirmed) return; const { error } = await supabaseClient
        .from('incident_reports')
        .delete()
        .eq('id', String(recordId)); if (error) {
            console.error(error);
            showToast('Could not delete incident.', 'error');
            return;
        } if (String(currentIncidentId) === String(recordId)) {
            cancelIncidentEdit();
        } showToast('Incident deleted.');
    await loadEmployeeIncidents(employeeId);
    switchTab('incidents');
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
    if (typeof loadRecentActivity === 'function') await loadRecentActivity();
    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
} async function loadEmployeeIncidents(employeeId) {
    const actualEmployeeId = getResolvedIncidentEmployeeId(employeeId);
    if (!actualEmployeeId) return;
    const target = safeGet('incidentsHistory');
    if (!target) return; const { data, error } = await supabaseClient
        .from('incident_reports')
        .select('*')
        .eq('employee_id', actualEmployeeId)
        .order('incident_date', { ascending: false })
        .order('created_at', { ascending: false }); if (error) {
            console.error(error);
            target.innerHTML = '<div class="empty">Could not load incidents</div>';
            return;
        } if (!data || !data.length) {
            target.innerHTML = '<div class="empty">No incidents for this employee</div>';
            return;
        } target.innerHTML = data.map(row => `
        <div class="history-item">
          <div class="history-top">
            <div>
              <div class="history-title">${esc(row.incident_type || 'Incident')}</div>
              <div class="history-date">${esc(row.incident_date || '')}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <button class="button soft" type="button" data-edit-incident-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-incident-id="${esc(row.id)}">Delete</button>
              <span class="badge badge-soft">${esc(row.status || 'Open')}</span>
            </div>
          </div>
          <div class="history-body">
            <strong>Location:</strong> ${esc(row.location || '')}
            <br><br>
            <strong>Description:</strong><br>${nl2br(row.description || '')}
            <br><br>
            <strong>Follow-Up:</strong><br>${nl2br(row.follow_up || '')}
          </div>
        </div>
      `).join(''); target.querySelectorAll('[data-edit-incident-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const record = data.find(row => String(row.id) === String(btn.dataset.editIncidentId));
                if (record) startIncidentEdit(record);
            });
        }); target.querySelectorAll('[data-delete-incident-id]').forEach(btn => {
            btn.addEventListener('click', () => deleteIncidentRecord(btn.dataset.deleteIncidentId));
        });
}// =========================
// GLOBAL EXPORTS
// =========================
window.getResolvedIncidentEmployeeId = getResolvedIncidentEmployeeId;
window.startIncidentEdit = startIncidentEdit;
window.cancelIncidentEdit = cancelIncidentEdit;
window.deleteIncidentRecord = deleteIncidentRecord;
window.loadEmployeeIncidents = loadEmployeeIncidents;
window.saveIncidentReport = saveIncidentReport;