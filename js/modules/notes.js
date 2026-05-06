function getResolvedNoteEmployeeId(employeeId = null) {
    return currentEmployee?.dbId || currentEmployee?.id || employeeId;
} function startNoteEdit(note) {
    resetDrawerForms();
    currentNoteId = note.id;
    if (safeGet('noteDate')) safeGet('noteDate').value = note.note_date || todayInputValue();
    if (safeGet('noteType')) safeGet('noteType').value = note.note_type || '';
    if (safeGet('noteText')) safeGet('noteText').value = note.note_text || '';
    if (safeGet('saveNoteBtn')) safeGet('saveNoteBtn').textContent = 'Update Note';
    safeGet('cancelNoteEditBtn')?.classList.remove('hidden');
    safeGet('noteEditStatus')?.classList.remove('hidden');
    switchTab('notes');
} function cancelNoteEdit() {
    currentNoteId = null;
    if (safeGet('noteDate')) safeGet('noteDate').value = todayInputValue();
    if (safeGet('noteType')) safeGet('noteType').value = '';
    if (safeGet('noteText')) safeGet('noteText').value = '';
    if (safeGet('saveNoteBtn')) safeGet('saveNoteBtn').textContent = 'Save Note';
    safeGet('cancelNoteEditBtn')?.classList.add('hidden');
    safeGet('noteEditStatus')?.classList.add('hidden');
} async function saveEmployeeNote() {
    if (!currentEmployee) return; const employeeId = getResolvedNoteEmployeeId();
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    } const note_date = safeGet('noteDate')?.value || '';
    const note_type = safeGet('noteType')?.value || '';
    const note_text = safeGet('noteText')?.value.trim() || ''; if (!note_date || !note_text) {
        showToast('Enter a note date and note text.', 'error');
        return;
    } let error; if (currentNoteId) {
        const result = await supabaseClient
            .from('employee_notes')
            .update({
                note_date,
                note_type,
                note_text,
            })
            .eq('id', currentNoteId)
            .eq('employee_id', employeeId); error = result.error;
    } else {
        const result = await supabaseClient
            .from('employee_notes')
            .insert([{
                employee_id: employeeId,
                note_date,
                note_type,
                note_text,
            }]); error = result.error;
    } if (error) {
        console.error(error);
        showToast(currentNoteId ? 'Could not update note.' : 'Could not save note.', 'error');
        return;
    } showToast(currentNoteId ? 'Note updated.' : 'Note saved.');
    cancelNoteEdit();
    await loadEmployeeNotes(employeeId);
    switchTab('notes');
    if (typeof loadRecentActivity === 'function') await loadRecentActivity();
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
} async function deleteNote(noteId) {
    const employeeId = getResolvedNoteEmployeeId();
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    } if (!confirm('Delete this note?')) return; const { data: deletedRows, error } = await supabaseClient
        .from('employee_notes')
        .delete()
        .eq('id', noteId)
        .select(); if (error) {
            console.error(error);
            showToast('Could not delete note.', 'error');
            return;
        } if (!deletedRows || !deletedRows.length) {
            showToast('No note was deleted.', 'error');
            return;
        } if (String(currentNoteId) === String(noteId)) {
            cancelNoteEdit();
        } showToast('Note deleted.');
    await loadEmployeeNotes(employeeId);
    switchTab('notes');
    if (typeof loadRecentActivity === 'function') await loadRecentActivity();
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();
} async function loadEmployeeNotes(employeeId) {
    const actualEmployeeId = getResolvedNoteEmployeeId(employeeId);
    if (!actualEmployeeId) return; const target = safeGet('notesHistory');
    if (!target) return; const { data, error } = await supabaseClient
        .from('employee_notes')
        .select('*')
        .eq('employee_id', actualEmployeeId)
        .order('note_date', { ascending: false }); if (error) {
            console.error(error);
            target.innerHTML = '<div class="empty">Could not load notes</div>';
            return;
        } if (!data || !data.length) {
            target.innerHTML = '<div class="empty">No notes for this employee</div>';
            return;
        } target.innerHTML = data.map(row => `
    <div class="history-item">
      <div class="history-top">
        <div>
          <div class="history-title">${esc(row.note_type || 'General Note')}</div>
          <div class="history-date">${esc(row.note_date || '')}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="button soft" type="button" data-edit-note-id="${esc(row.id)}">Edit</button>
          <button class="button danger" type="button" data-delete-note-id="${esc(row.id)}">Delete</button>
          <span class="badge badge-soft">Note</span>
        </div>
      </div>
      <div class="history-body">${nl2br(row.note_text || '')}</div>
    </div>
  `).join(''); target.querySelectorAll('[data-edit-note-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const note = data.find(row => String(row.id) === String(btn.dataset.editNoteId));
                if (note) startNoteEdit(note);
            });
        }); target.querySelectorAll('[data-delete-note-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                deleteNote(btn.dataset.deleteNoteId);
            });
        });
}// =========================
// GLOBAL EXPORTS
// =========================
window.getResolvedNoteEmployeeId = getResolvedNoteEmployeeId;
window.startNoteEdit = startNoteEdit;
window.cancelNoteEdit = cancelNoteEdit;
window.saveEmployeeNote = saveEmployeeNote;
window.deleteNote = deleteNote;
window.loadEmployeeNotes = loadEmployeeNotes;