window.currentEmergencyContactId = window.currentEmergencyContactId || null;

async function ecFetchByEmployee(employeeId) {
    if (!employeeId) return { data: [], error: null };
    if (typeof getEmergencyContact === 'function') {
        return await getEmergencyContact(employeeId);
    }
    if (typeof window.getEmergencyContact === 'function') {
        return await window.getEmergencyContact(employeeId);
    }
    return await supabaseClient
        .from('emergency_contacts')
        .select('*')
        .eq('employee_id', employeeId);
}

async function ecCreate(payload) {
    if (!payload?.employee_id) return { data: null, error: new Error('Missing employee ID for emergency contact.') };
    if (typeof createEmergencyContact === 'function') {
        return await createEmergencyContact(payload);
    }
    return await supabaseClient
        .from('emergency_contacts')
        .insert([payload]);
}

async function ecUpdate(id, payload) {
    if (!id || !payload?.employee_id) return { data: null, error: new Error('Missing emergency contact ID or employee ID.') };
    if (typeof updateEmergencyContactById === 'function') {
        return await updateEmergencyContactById(id, payload.employee_id, payload);
    }
    return await supabaseClient
        .from('emergency_contacts')
        .update(payload)
        .eq('id', id);
}

async function ecDelete(id) {
    if (!id) return { data: null, error: new Error('Missing emergency contact ID.') };
    if (typeof deleteEmergencyContactById === 'function') {
        return await deleteEmergencyContactById(id);
    }
    return await supabaseClient
        .from('emergency_contacts')
        .delete()
        .eq('id', id);
}

function getResolvedEmergencyEmployeeId(employeeId) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId || null;
}

function resetEmergencyContactForm() {
    window.currentEmergencyContactId = null;
    if (safeGet('ecName')) safeGet('ecName').value = '';
    if (safeGet('ecRelationship')) safeGet('ecRelationship').value = '';
    if (safeGet('ecPhone')) safeGet('ecPhone').value = '';
    if (safeGet('ecAltPhone')) safeGet('ecAltPhone').value = '';
    if (safeGet('ecNotes')) safeGet('ecNotes').value = '';
    safeGet('deleteECBtn')?.classList.add('hidden');
}

async function loadEmergencyContacts(employeeId) {
    const target = safeGet('ecHistory');
    if (!target) return;

    const actualEmployeeId = getResolvedEmergencyEmployeeId(employeeId);
    if (!actualEmployeeId) {
        resetEmergencyContactForm();
        target.innerHTML = '<div class="empty">No employee selected.</div>';
        return;
    }
    const { data, error } = await ecFetchByEmployee(actualEmployeeId);

    if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load emergency contact</div>';
        return;
    }

    const rows = data || [];

    if (!rows.length) {
        resetEmergencyContactForm();
        target.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-weight:600;">Emergency Contacts</div>
              <button class="btn btn-secondary" id="addEmergencyContactBtn" type="button">+ Add New</button>
            </div>
            <div class="empty">No emergency contacts on file</div>
        `;
        safeGet('addEmergencyContactBtn')?.addEventListener('click', () => {
            resetEmergencyContactForm();
            applyRolePermissions();
        });
        applyRolePermissions();
        return;
    }

    if (!window.currentEmergencyContactId || !rows.some(row => String(row.id) === String(currentEmergencyContactId))) {
        resetEmergencyContactForm();
    }

    target.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:600;">Emergency Contacts</div>
          <button class="btn btn-secondary" id="addEmergencyContactBtn" type="button">+ Add New</button>
        </div>
        ${rows.map((row, index) => `
          <div class="history-item" data-ec-id="${esc(row.id)}" style="cursor:pointer; ${String(window.currentEmergencyContactId) === String(row.id) ? 'border:1px solid var(--blue, #2e75b6);' : ''}">
            <div class="history-top">
              <div>
                <div class="history-title">${esc(row.contact_name || 'Emergency Contact')}</div>
                <div class="history-date">${esc(row.relationship || '')}</div>
              </div>
              <span class="badge badge-soft">${index === 0 ? 'Primary' : 'Contact'}</span>
            </div>
            <div class="history-body">
              <strong>Phone:</strong> ${esc(row.phone || '')}<br>
              <strong>Alternate:</strong> ${esc(row.alternate_phone || '')}<br><br>
              <strong>Notes:</strong><br>${nl2br(row.notes || '')}
            </div>
          </div>
        `).join('')}
    `;

    safeGet('addEmergencyContactBtn')?.addEventListener('click', () => {
        resetEmergencyContactForm();
        applyRolePermissions();
    });

    target.querySelectorAll('[data-ec-id]').forEach(card => {
        card.addEventListener('click', () => {
            const row = rows.find(item => String(item.id) === String(card.dataset.ecId));
            if (!row) return;
            window.currentEmergencyContactId = row.id;
            safeGet('deleteECBtn')?.classList.remove('hidden');
            if (safeGet('ecName')) safeGet('ecName').value = row.contact_name || '';
            if (safeGet('ecRelationship')) safeGet('ecRelationship').value = row.relationship || '';
            if (safeGet('ecPhone')) safeGet('ecPhone').value = row.phone || '';
            if (safeGet('ecAltPhone')) safeGet('ecAltPhone').value = row.alternate_phone || '';
            if (safeGet('ecNotes')) safeGet('ecNotes').value = row.notes || '';
            target.querySelectorAll('[data-ec-id]').forEach(item => {
                item.style.border = '';
            });
            card.style.border = '1px solid var(--blue, #2e75b6)';
            applyRolePermissions();
        });
    });
}

async function saveEmergencyContact() {
    const employeeId = getResolvedEmergencyEmployeeId();
    if (!currentEmployee || !employeeId) {
        showToast('No employee selected.', 'error');
        return;
    }

    const contact_name = safeGet('ecName')?.value.trim() || '';
    const relationship = safeGet('ecRelationship')?.value.trim() || '';
    const phone = safeGet('ecPhone')?.value.trim() || '';
    const alternate_phone = safeGet('ecAltPhone')?.value.trim() || '';
    const notes = safeGet('ecNotes')?.value.trim() || '';

    if (!contact_name) {
        showToast('Enter the emergency contact name.', 'error');
        return;
    }

    let error;

    if (window.currentEmergencyContactId) {
        const result = await ecUpdate(window.currentEmergencyContactId, {
            employee_id: employeeId,
            contact_name,
            relationship,
            phone,
            alternate_phone,
            notes,
        });
        error = result.error;
    } else {
        const result = await ecCreate({
            employee_id: employeeId,
            contact_name,
            relationship,
            phone,
            alternate_phone,
            notes,
        });
        error = result.error;
    }

    if (error) {
        console.error(error);
        showToast(`Could not save emergency contact: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    const wasUpdating = Boolean(window.currentEmergencyContactId);
    showToast(wasUpdating ? 'Emergency contact updated.' : 'Emergency contact saved.');
    resetEmergencyContactForm();
    await loadEmergencyContacts(employeeId);
}

async function deleteEmergencyContact() {
    if (!window.currentEmergencyContactId) {
        showToast('No emergency contact to delete.', 'error');
        return;
    }
    const employeeId = getResolvedEmergencyEmployeeId();

    if (!confirm('Are you sure you want to delete this emergency contact?')) {
        return;
    }

    try {
        const { error } = await ecDelete(currentEmergencyContactId);

        if (error) {
            console.error(error);
            showToast('Could not delete emergency contact.', 'error');
            return;
        }

        showToast('Emergency contact deleted.');

        resetEmergencyContactForm();

        if (employeeId) {
            await loadEmergencyContacts(employeeId);
        }

    } catch (err) {
        console.error(err);
        showToast('Error deleting emergency contact.', 'error');
    }
}

// =========================
// GLOBAL EXPORTS
// =========================
window.loadEmergencyContacts = loadEmergencyContacts;
window.saveEmergencyContact = saveEmergencyContact;
window.deleteEmergencyContact = deleteEmergencyContact;
window.resetEmergencyContactForm = resetEmergencyContactForm;