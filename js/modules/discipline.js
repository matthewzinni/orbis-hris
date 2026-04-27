// Local fallback helpers for discipline operations
async function disciplineFetchByEmployee(employeeId) {
    if (typeof getEmployeeDiscipline === 'function') {
        return await getEmployeeDiscipline(employeeId);
    }
    if (typeof window.getEmployeeDiscipline === 'function') {
        return await window.getEmployeeDiscipline(employeeId);
    }
    const targetId = currentEmployee?.dbId || employeeId;
    if (!targetId) return { data: [], error: null };

    return await supabaseClient
        .from('discipline_reports')
        .select('*')
        .eq('employee_id', targetId)
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
    loadDisciplineSignature('disciplineEmployeeSignature', 'disciplineEmployeeSigStatus', record.employee_signature);
    loadDisciplineSignature('disciplineManagerSignature', 'disciplineManagerSigStatus', record.manager_signature);
    loadDisciplineSignature('disciplineWitnessSignature', 'disciplineWitnessSigStatus', record.witness_signature);
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
    clearDisciplineSignature('disciplineEmployeeSignature', 'disciplineEmployeeSigStatus');
    clearDisciplineSignature('disciplineManagerSignature', 'disciplineManagerSigStatus');
    clearDisciplineSignature('disciplineWitnessSignature', 'disciplineWitnessSigStatus');
    if (safeGet('saveDisciplineBtn')) safeGet('saveDisciplineBtn').textContent = 'Save Discipline';
    safeGet('cancelDisciplineEditBtn')?.classList.add('hidden');
    safeGet('disciplineEditStatus')?.classList.add('hidden');
}

function getDisciplineSignature(canvasId) {
    const canvas = document.getElementById(canvasId);
    return canvas?.dataset.signature || '';
}

function clearDisciplineSignature(canvasId, statusId) {
    if (typeof clearSig === 'function') {
        clearSig(canvasId, statusId);
        return;
    }

    const canvas = document.getElementById(canvasId);
    const status = document.getElementById(statusId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.signature = '';

    if (status) {
        status.textContent = 'Not signed';
        status.style.color = '#667085';
    }
}

function loadDisciplineSignature(canvasId, statusId, signatureData) {
    const canvas = document.getElementById(canvasId);
    const status = document.getElementById(statusId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.signature = signatureData || '';

    if (!signatureData) {
        if (status) {
            status.textContent = 'Not signed';
            status.style.color = '#667085';
        }
        return;
    }

    const img = new Image();
    img.onload = () => {
        const rect = canvas.getBoundingClientRect();
        ctx.drawImage(img, 0, 0, rect.width || canvas.width, rect.height || canvas.height);
    };
    img.src = signatureData;

    if (status) {
        status.textContent = 'Signed';
        status.style.color = 'green';
    }
}

function renderDisciplineSignatures(row) {
    const signatures = [
        { label: 'Employee Signature', value: row.employee_signature },
        { label: 'Manager Signature', value: row.manager_signature },
        { label: 'Witness Signature', value: row.witness_signature }
    ];

    if (!signatures.some(item => item.value)) return '';

    return `
      <div style="margin-top:14px; padding-top:12px; border-top:1px solid #e5e7eb;">
        <strong>Signatures:</strong>
        <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; margin-top:10px;">
          ${signatures.map(item => `
            <div style="border:1px solid #e5e7eb; border-radius:10px; padding:8px; background:#fff; min-height:84px;">
              ${item.value ? `<img src="${esc(item.value)}" alt="${esc(item.label)}" style="width:100%; height:56px; object-fit:contain; display:block;">` : `<div style="height:56px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px;">Not signed</div>`}
              <div style="font-size:11px; color:#667085; margin-top:4px; text-align:center;">${esc(item.label)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
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
    await loadEmployeeDiscipline(currentEmployee?.dbId || currentEmployee?.id);
    await loadSummaryMetrics();
    await loadRecentActivity();
    await loadReviewDashboard();
}

async function loadEmployeeDiscipline(employeeId) {
    if (!employeeId) return;
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
        <div class="discipline-record-card" style="padding:16px; margin-bottom:14px; border:1px solid #e5e7eb; border-radius:16px; background:#ffffff; box-shadow:0 8px 20px rgba(15,23,42,0.04); overflow:visible; min-height:auto; height:auto;">
          <div style="display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:12px;">
            <div style="min-width:0; flex:1;">
              <div style="font-size:15px; line-height:1.3; font-weight:900; color:#111827; margin:0 0 4px; white-space:normal; overflow:visible; text-overflow:clip;">
                ${esc(row.issue_type || 'Discipline')}
              </div>
              <div style="font-size:12px; line-height:1.4; color:#667085; white-space:normal; overflow:visible;">
                ${esc(row.incident_date || '')}
              </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; max-width:58%;">
              <button class="button soft" type="button" data-edit-discipline-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-discipline-id="${esc(row.id)}">Delete</button>
              <span class="badge badge-soft">${esc(row.report_status || 'Open')}</span>
              ${row.discipline_level ? `<span class="badge badge-leave">${esc(row.discipline_level)}</span>` : ''}
              ${row.refused_to_sign === true ? '<span class="badge badge-inactive">Refused to Sign</span>' : ''}
            </div>
          </div>

          <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; margin-bottom:12px; font-size:13px; color:#334155; line-height:1.45;">
            <div style="padding:10px; border:1px solid #f1f5f9; border-radius:12px; background:#f8fafc;">
              <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px;">Issue Type</div>
              <div style="font-weight:700; color:#111827; white-space:normal; overflow:visible;">${esc(row.issue_type || 'Not specified')}</div>
            </div>
            <div style="padding:10px; border:1px solid #f1f5f9; border-radius:12px; background:#f8fafc;">
              <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px;">Status</div>
              <div style="font-weight:700; color:#111827; white-space:normal; overflow:visible;">${esc(row.report_status || 'Open')}</div>
            </div>
            ${row.discipline_level ? `
              <div style="padding:10px; border:1px solid #f1f5f9; border-radius:12px; background:#f8fafc;">
                <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px;">Level</div>
                <div style="font-weight:700; color:#111827; white-space:normal; overflow:visible;">${esc(row.discipline_level)}</div>
              </div>
            ` : ''}
            <div style="padding:10px; border:1px solid #f1f5f9; border-radius:12px; background:#f8fafc;">
              <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px;">Refused to Sign</div>
              <div style="font-weight:700; color:#111827; white-space:normal; overflow:visible;">${row.refused_to_sign === true ? 'Yes' : 'No'}</div>
            </div>
          </div>

          <div style="font-size:13px; line-height:1.55; color:#334155; white-space:normal; overflow:visible; word-break:break-word;">
            <div style="margin-bottom:12px;">
              <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">Description</div>
              <div style="white-space:normal; overflow:visible;">${nl2br(row.description || '')}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px;">Action Taken</div>
              <div style="white-space:normal; overflow:visible;">${nl2br(row.action_taken || '')}</div>
            </div>
            ${renderDisciplineSignatures(row)}
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

    const employeeId = currentEmployee?.dbId || currentEmployee?.id;
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    }

    const incident_date = safeGet('disciplineDate')?.value || '';
    const issue_type = safeGet('disciplineType')?.value || '';
    let discipline_level = safeGet('disciplineLevel')?.value || '';
    // --- Auto Escalation Logic ---

    let suggestedLevel = '';

    try {

        let escalationQuery = supabaseClient
            .from('discipline_reports')
            .select('id, discipline_level, issue_type, report_status')
            .eq('employee_id', employeeId);

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
    const employee_signature = document.getElementById('disciplineEmployeeSignature')?.dataset.signature || '';

    const manager_signature = document.getElementById('disciplineManagerSignature')?.dataset.signature || '';

    const witness_signature = document.getElementById('disciplineWitnessSignature')?.dataset.signature || '';

    if (!incident_date || !description) {
        showToast('Enter an incident date and description.', 'error');
        return;
    }

    const isUpdatingDiscipline = !!currentDisciplineReportId;
    const signatureFields = [];
    if (employee_signature) signatureFields.push('employee_signature');
    if (manager_signature) signatureFields.push('manager_signature');
    if (witness_signature) signatureFields.push('witness_signature');


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
                employee_signature,
                manager_signature,
                witness_signature,
            })
            .eq('id', currentDisciplineReportId)
            .eq('employee_id', employeeId);
        error = result.error;

    } else {
        const result = await supabaseClient
            .from('discipline_reports')
            .insert([{
                employee_id: employeeId,
                incident_date,
                issue_type,
                discipline_level,
                description,
                action_taken,
                report_status,
                refused_to_sign,
                employee_signature,
                manager_signature,
                witness_signature,
            }]);

        error = result.error;
    }

    if (error) {
        console.error(error);
        showToast(currentDisciplineReportId ? 'Could not update discipline report.' : 'Could not save discipline report.', 'error');
        return;
    }

    showToast(isUpdatingDiscipline ? 'Discipline report updated.' : 'Discipline report saved.');

    if (typeof window.writeEmployeeAuditLogToSupabase === 'function') {
        const publicEmployeeId = typeof window.getEmployeePublicId === 'function'
            ? window.getEmployeePublicId(currentEmployee, currentEmployee?.displayName || currentEmployee?.name || '')
            : (currentEmployee?.employee_id || currentEmployee?.employeeId || employeeId);

        await window.writeEmployeeAuditLogToSupabase({
            employee_id: publicEmployeeId || employeeId,
            name: `${currentEmployee?.first_name || currentEmployee?.firstName || ''} ${currentEmployee?.last_name || currentEmployee?.lastName || ''}`.trim() || currentEmployee?.displayName || currentEmployee?.name || '',
            action_type: isUpdatingDiscipline ? 'discipline_updated' : 'discipline_created',
            timestamp: new Date().toISOString(),
            changed_by: window.currentUser?.email || window.currentUser?.name || 'System',
            fields_changed: ['discipline_report'],
            metadata: {
                type: 'discipline',
                summary: isUpdatingDiscipline ? 'Discipline report updated' : 'Discipline report created',
                issue_type,
                discipline_level,
                report_status,
                refused_to_sign,
                discipline_report_id: currentDisciplineReportId || null
            }
        });

        if (signatureFields.length) {
            await window.writeEmployeeAuditLogToSupabase({
                employee_id: publicEmployeeId || employeeId,
                name: `${currentEmployee?.first_name || currentEmployee?.firstName || ''} ${currentEmployee?.last_name || currentEmployee?.lastName || ''}`.trim() || currentEmployee?.displayName || currentEmployee?.name || '',
                action_type: 'signature_captured',
                timestamp: new Date().toISOString(),
                changed_by: window.currentUser?.email || window.currentUser?.name || 'System',
                fields_changed: signatureFields,
                metadata: {
                    type: 'signature',
                    summary: 'Discipline signatures captured',
                    discipline_report_id: currentDisciplineReportId || null
                }
            });
        }

        if (document.getElementById('employeeAuditLogViewer') && typeof window.renderEmployeeAuditLogViewer === 'function') {
            await window.renderEmployeeAuditLogViewer(currentEmployee);
        }
    } else if (typeof window.recordAuditEvent === 'function') {
        window.recordAuditEvent(
            isUpdatingDiscipline ? 'Updated Discipline Report' : 'Created Discipline Report',
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
window.getDisciplineSignature = getDisciplineSignature;
window.clearDisciplineSignature = clearDisciplineSignature;
window.loadDisciplineSignature = loadDisciplineSignature;
window.renderDisciplineSignatures = renderDisciplineSignatures;
window.startDisciplineEdit = startDisciplineEdit;
window.cancelDisciplineEdit = cancelDisciplineEdit;
window.deleteDisciplineRecord = deleteDisciplineRecord;
window.loadEmployeeDiscipline = loadEmployeeDiscipline;
window.saveDisciplineReport = saveDisciplineReport;
