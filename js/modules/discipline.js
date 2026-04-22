// Local fallback helpers for discipline operations
async function disciplineFetchByEmployee(employeeId) {
    if (typeof getEmployeeDiscipline === 'function') {
        return await getEmployeeDiscipline(employeeId);
    }
    if (typeof window.getEmployeeDiscipline === 'function') {
        return await window.getEmployeeDiscipline(employeeId);
    }
    return await supabaseClient
        .from('discipline_reports')
        .select('*')
        .eq('employee_id', currentEmployee?.dbId || employeeId)
        .order('incident_date', { ascending: false });
}

async function disciplineDeleteById(recordId) {
    if (typeof deleteDisciplineById === 'function') {
        return await deleteDisciplineById(recordId);
    }
    if (typeof window.deleteDisciplineById === 'function') {
        return await window.deleteDisciplineById(recordId);
    }
    return await supabaseClient
        .from('discipline_reports')
        .delete()
        .eq('id', recordId);
}

function startDisciplineEdit(record) {
    resetDrawerForms();
    currentDisciplineReportId = record.id;
    safeGet('disciplineDate').value = record.incident_date || todayInputValue();
    safeGet('disciplineType').value = record.issue_type || '';
    if (safeGet('disciplineLevel')) safeGet('disciplineLevel').value = record.discipline_level || '';
    safeGet('disciplineDescription').value = record.description || '';
    safeGet('disciplineAction').value = record.action_taken || '';
    safeGet('disciplineStatus').value = record.report_status || 'Open';
    if (safeGet('disciplineRefusedToSign')) safeGet('disciplineRefusedToSign').checked = record.refused_to_sign === true;
    if (safeGet('saveDisciplineBtn')) safeGet('saveDisciplineBtn').textContent = 'Update Discipline';
    safeGet('cancelDisciplineEditBtn')?.classList.remove('hidden');
    safeGet('disciplineEditStatus')?.classList.remove('hidden');
    switchTab('discipline');
}

function cancelDisciplineEdit() {
    currentDisciplineReportId = null;
    if (safeGet('disciplineDate')) safeGet('disciplineDate').value = todayInputValue();
    if (safeGet('disciplineType')) safeGet('disciplineType').value = '';
    if (safeGet('disciplineLevel')) safeGet('disciplineLevel').value = '';
    if (safeGet('disciplineDescription')) safeGet('disciplineDescription').value = '';
    if (safeGet('disciplineAction')) safeGet('disciplineAction').value = '';
    if (safeGet('disciplineStatus')) safeGet('disciplineStatus').value = 'Open';
    if (safeGet('disciplineRefusedToSign')) safeGet('disciplineRefusedToSign').checked = false;
    if (safeGet('saveDisciplineBtn')) safeGet('saveDisciplineBtn').textContent = 'Save Discipline';
    safeGet('cancelDisciplineEditBtn')?.classList.add('hidden');
    safeGet('disciplineEditStatus')?.classList.add('hidden');
}

async function deleteDisciplineRecord(recordId) {
    const confirmed = window.confirm('Delete this discipline record?');
    if (!confirmed) return;

    const { error } = await disciplineDeleteById(String(recordId));

    if (error) {
        console.error(error);
        showToast('Could not delete discipline record.', 'error');
        return;
    }

    if (String(currentDisciplineReportId) === String(recordId)) {
        cancelDisciplineEdit();
    }

    showToast('Discipline record deleted.');
    if (typeof window.recordAuditEvent === 'function') {
        window.recordAuditEvent('Deleted Discipline Report', currentEmployee, `Record ID: ${recordId}`);
    }
    await loadEmployeeDiscipline(currentEmployee.id);
    await loadSummaryMetrics();
    await loadRecentActivity();
    await loadReviewDashboard();
}

async function loadEmployeeDiscipline(employeeId) {
    const target = safeGet('disciplineHistory');
    if (!target) return;

    const { data, error } = await disciplineFetchByEmployee(employeeId);

    if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load discipline records</div>';
        showToast('Could not load discipline records.', 'error');
        return;
    }

    if (!data || !data.length) {
        target.innerHTML = '<div class="empty">No discipline records for this employee</div>';
        if (typeof buildKpiHoverDetails === 'function') buildKpiHoverDetails();
        return;
    }

    target.innerHTML = data.map(row => `
        <div class="history-item">
          <div class="history-top">
            <div>
              <div class="history-title">${esc(row.issue_type || 'Discipline')}</div>
              <div class="history-date">${esc(row.incident_date || '')}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <button class="button soft" type="button" data-edit-discipline-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-discipline-id="${esc(row.id)}">Delete</button>
              <span class="badge badge-soft">${esc(row.report_status || 'Open')}</span>
              ${row.discipline_level ? `<span class="badge badge-leave">${esc(row.discipline_level)}</span>` : ''}
              ${row.refused_to_sign === true ? '<span class="badge badge-inactive">Refused to Sign</span>' : ''}
            </div>
          </div>
          <div class="history-body">
            <strong>Issue Type:</strong> ${esc(row.issue_type || '')}<br>
            ${row.discipline_level ? `<strong>Level:</strong> ${esc(row.discipline_level)}<br>` : ''}
            <strong>Status:</strong> ${esc(row.report_status || 'Open')}<br>
            <strong>Refused to Sign:</strong> ${row.refused_to_sign === true ? 'Yes' : 'No'}<br><br>
            <strong>Description:</strong><br>${nl2br(row.description || '')}
            <br><br>
            <strong>Action Taken:</strong><br>${nl2br(row.action_taken || '')}
          </div>
        </div>
      `).join('');

    if (typeof buildKpiHoverDetails === 'function') buildKpiHoverDetails();

    target.querySelectorAll('[data-edit-discipline-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const record = data.find(row => String(row.id) === String(btn.dataset.editDisciplineId));
            if (record) startDisciplineEdit(record);
        });
    });

    target.querySelectorAll('[data-delete-discipline-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteDisciplineRecord(btn.dataset.deleteDisciplineId));
    });
}
async function saveDisciplineReport() {
    if (!currentEmployee) return;

    const incident_date = safeGet('disciplineDate')?.value || '';
    const issue_type = safeGet('disciplineType')?.value || '';
    let discipline_level = safeGet('disciplineLevel')?.value || '';
    // --- Auto Escalation Logic ---

    let suggestedLevel = '';

    try {

        let escalationQuery = supabaseClient
            .from('discipline_reports')
            .select('id, discipline_level, issue_type, report_status')
            .eq('employee_id', currentEmployee?.dbId || currentEmployee?.id);

        if (currentDisciplineReportId) {
            escalationQuery = escalationQuery.neq('id', currentDisciplineReportId);
        }

        const { data: priorRecords } = await escalationQuery;

        const relevantRecords = (priorRecords || []).filter(r => String(r.report_status || '').toLowerCase() !== 'closed');

        if (relevantRecords.length) {

            const count = relevantRecords.length;

            // Escalation ladder

            if (count === 1) suggestedLevel = 'Level 2 - Verbal Warning';

            else if (count === 2) suggestedLevel = 'Level 3 - Written Warning';

            else if (count === 3) suggestedLevel = 'Level 4 - Final Warning';

            else if (count >= 4) suggestedLevel = 'Level 5 - Termination';

            // Repeat issue detection

            const sameTypeCount = relevantRecords.filter(r => r.issue_type === issue_type).length;

            if (sameTypeCount >= 2) {

                showToast('⚠️ Repeat issue detected for this employee.', 'error');

            }


            const levelRank = (level) => {
                if (!level) return 0;
                if (String(level).startsWith('Level 1')) return 1;
                if (String(level).startsWith('Level 2')) return 2;
                if (String(level).startsWith('Level 3')) return 3;
                if (String(level).startsWith('Level 4')) return 4;
                if (String(level).startsWith('Level 5')) return 5;
                return 0;
            };

            if (!discipline_level && suggestedLevel && safeGet('disciplineLevel')) {
                safeGet('disciplineLevel').value = suggestedLevel;
                discipline_level = suggestedLevel;
                showToast(`Suggested Level: ${suggestedLevel}`);
            }

            if (discipline_level && suggestedLevel && levelRank(discipline_level) < levelRank(suggestedLevel)) {
                showToast(`⚠️ Selected level is lower than recommended (${suggestedLevel}).`, 'error');
                return;
            }

        }

    } catch (e) {

        console.warn('Escalation check failed', e);

    }


    const description = safeGet('disciplineDescription')?.value.trim() || '';
    const action_taken = safeGet('disciplineAction')?.value.trim() || '';
    const report_status = safeGet('disciplineStatus')?.value || 'Open';
    const refused_to_sign = safeGet('disciplineRefusedToSign')?.checked || false;

    if (!incident_date || !description) {
        showToast('Enter an incident date and description.', 'error');
        return;
    }


    let error;

    if (currentDisciplineReportId) {
        const result = await supabaseClient
            .from('discipline_reports')
            .update({
                incident_date,
                issue_type,
                discipline_level,
                description,
                action_taken,
                report_status,
                refused_to_sign,
            })
            .eq('id', currentDisciplineReportId)
            .eq('employee_id', currentEmployee.dbId || currentEmployee.id);
        error = result.error;

    } else {
        const result = await supabaseClient
            .from('discipline_reports')
            .insert([{
                employee_id: currentEmployee.dbId || currentEmployee.id,
                incident_date,
                issue_type,
                discipline_level,
                description,
                action_taken,
                report_status,
                refused_to_sign,
            }]);

        error = result.error;
    }

    if (error) {
        console.error(error);
        showToast(currentDisciplineReportId ? 'Could not update discipline report.' : 'Could not save discipline report.', 'error');
        return;
    }

    showToast(currentDisciplineReportId ? 'Discipline report updated.' : 'Discipline report saved.');
    if (typeof window.recordAuditEvent === 'function') {
        window.recordAuditEvent(
            currentDisciplineReportId ? 'Updated Discipline Report' : 'Created Discipline Report',
            currentEmployee,
            [issue_type, discipline_level, report_status, refused_to_sign ? 'Refused to Sign' : 'Signed/Not Marked'].filter(Boolean).join(' • ')
        );
    }
    cancelDisciplineEdit();
    await loadEmployeeDiscipline(currentEmployee.id);
    await loadSummaryMetrics();
    await loadRecentActivity();
    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
    if (typeof buildKpiHoverDetails === 'function') buildKpiHoverDetails();
}




// =========================
// GLOBAL EXPORTS
// =========================
window.startDisciplineEdit = startDisciplineEdit;
window.cancelDisciplineEdit = cancelDisciplineEdit;
window.deleteDisciplineRecord = deleteDisciplineRecord;
window.loadEmployeeDiscipline = loadEmployeeDiscipline;
window.saveDisciplineReport = saveDisciplineReport;
