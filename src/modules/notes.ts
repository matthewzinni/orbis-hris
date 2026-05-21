import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';
import { resetDrawerForms } from './drawerForms';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';

type EmployeeNote = {
  id?: string;
  employee_id?: string;
  note_date?: string;
  note_type?: string;
  note_text?: string;
};

declare global {
  interface Window {
    currentEmployee?: {
      id?: string;
      dbId?: string;
      employee_id?: string;
    } | null;
    currentNoteId?: string | null;
    switchTab?: (tabName: string) => void;
    loadRecentActivity?: () => Promise<void>;
    loadSummaryMetrics?: () => Promise<void>;
    loadReviewDashboard?: () => Promise<void>;
    getResolvedNoteEmployeeId?: (employeeId?: string | null) => string;
    startNoteEdit?: (note: EmployeeNote) => void;
    cancelNoteEdit?: () => void;
    saveEmployeeNote?: () => Promise<void>;
    deleteNote?: (noteId: string) => Promise<void>;
    loadEmployeeNotes?: (employeeId: string) => Promise<void>;
  }
}

let currentNoteId: string | null = null;

function getResolvedNoteEmployeeId(employeeId: string | null = null): string {
  const employee = window.currentEmployee;

  return String(employee?.dbId || employee?.id || employee?.employee_id || employeeId || '').trim();
}

export function startNoteEdit(note: EmployeeNote): void {
  resetDrawerForms();

  currentNoteId = note.id ? String(note.id) : null;
  window.currentNoteId = currentNoteId;

  const noteDate = safeGet('noteDate') as HTMLInputElement | null;
  const noteType = safeGet('noteType') as HTMLInputElement | null;
  const noteText = safeGet('noteText') as HTMLTextAreaElement | null;
  const saveNoteBtn = safeGet('saveNoteBtn');

  if (noteDate) noteDate.value = note.note_date || todayInputValue();
  if (noteType) noteType.value = note.note_type || '';
  if (noteText) noteText.value = note.note_text || '';
  if (saveNoteBtn) saveNoteBtn.textContent = 'Update Note';

  safeGet('cancelNoteEditBtn')?.classList.remove('hidden');
  safeGet('noteEditStatus')?.classList.remove('hidden');

  window.switchTab?.('notes');
}

export function cancelNoteEdit(): void {
  currentNoteId = null;
  window.currentNoteId = null;

  const noteDate = safeGet('noteDate') as HTMLInputElement | null;
  const noteType = safeGet('noteType') as HTMLInputElement | null;
  const noteText = safeGet('noteText') as HTMLTextAreaElement | null;
  const saveNoteBtn = safeGet('saveNoteBtn');

  if (noteDate) noteDate.value = todayInputValue();
  if (noteType) noteType.value = '';
  if (noteText) noteText.value = '';
  if (saveNoteBtn) saveNoteBtn.textContent = 'Save Note';

  safeGet('cancelNoteEditBtn')?.classList.add('hidden');
  safeGet('noteEditStatus')?.classList.add('hidden');
}

async function refreshDashboardAfterNoteChange(): Promise<void> {
  if (typeof window.loadRecentActivity === 'function') {
    await window.loadRecentActivity();
  }

  if (typeof window.loadSummaryMetrics === 'function') {
    await window.loadSummaryMetrics();
  }

  if (typeof window.loadReviewDashboard === 'function') {
    await window.loadReviewDashboard();
  }
}

export async function saveEmployeeNote(): Promise<void> {
  if (!window.currentEmployee) {
    return;
  }

  const employeeId = getResolvedNoteEmployeeId();

  if (!employeeId) {
    showToast('No employee selected.', 'error');
    return;
  }

  const note_date = (safeGet('noteDate') as HTMLInputElement | null)?.value || '';
  const note_type = (safeGet('noteType') as HTMLInputElement | null)?.value || '';
  const note_text = (safeGet('noteText') as HTMLTextAreaElement | null)?.value.trim() || '';

  if (!note_date || !note_text) {
    showToast('Enter a note date and note text.', 'error');
    return;
  }

  let error;

  if (currentNoteId) {
    const result = await supabaseClient
      .from('employee_notes')
      .update({
        note_date,
        note_type,
        note_text,
      })
      .eq('id', currentNoteId)
      .eq('employee_id', employeeId);

    error = result.error;
  } else {
    const result = await supabaseClient.from('employee_notes').insert([
      {
        employee_id: employeeId,
        note_date,
        note_type,
        note_text,
      },
    ]);

    error = result.error;
  }

  if (error) {
    console.error('[Notes] Save failed:', error);
    showToast(currentNoteId ? 'Could not update note.' : 'Could not save note.', 'error');
    return;
  }

  showToast(currentNoteId ? 'Note updated.' : 'Note saved.');

  cancelNoteEdit();
  await loadEmployeeNotes(employeeId);
  window.switchTab?.('notes');
  await refreshDashboardAfterNoteChange();
}

export async function deleteNote(noteId: string): Promise<void> {
  const employeeId = getResolvedNoteEmployeeId();

  if (!employeeId) {
    showToast('No employee selected.', 'error');
    return;
  }

  const confirmed = await showOrbisConfirm('Delete this note?', {
    title: 'Delete note',
    confirmLabel: 'Delete',
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  const { data: deletedRows, error } = await supabaseClient
    .from('employee_notes')
    .delete()
    .eq('id', noteId)
    .select();

  if (error) {
    console.error('[Notes] Delete failed:', error);
    showToast('Could not delete note.', 'error');
    return;
  }

  if (!deletedRows?.length) {
    showToast('No note was deleted.', 'error');
    return;
  }

  if (String(currentNoteId) === String(noteId)) {
    cancelNoteEdit();
  }

  showToast('Note deleted.');
  await loadEmployeeNotes(employeeId);
  window.switchTab?.('notes');
  await refreshDashboardAfterNoteChange();
}

export async function loadEmployeeNotes(employeeId: string): Promise<void> {
  const actualEmployeeId = getResolvedNoteEmployeeId(employeeId);

  if (!actualEmployeeId) {
    return;
  }

  const target = safeGet('notesHistory');

  if (!target) {
    return;
  }

  const { data, error } = await supabaseClient
    .from('employee_notes')
    .select('*')
    .eq('employee_id', actualEmployeeId)
    .order('note_date', { ascending: false });

  if (error) {
    console.error('[Notes] Load failed:', error);
    target.innerHTML = '<div class="empty">Could not load notes</div>';
    return;
  }

  if (!data?.length) {
    target.innerHTML = '<div class="empty">No notes for this employee</div>';
    return;
  }

  const rows = data as EmployeeNote[];

  target.innerHTML = rows
    .map(
      (row) => `
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
      `
    )
    .join('');

  target.querySelectorAll<HTMLButtonElement>('[data-edit-note-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const note = rows.find((row) => String(row.id) === String(button.dataset.editNoteId));

      if (note) {
        startNoteEdit(note);
      }
    });
  });

  target.querySelectorAll<HTMLButtonElement>('[data-delete-note-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const noteId = button.dataset.deleteNoteId;

      if (noteId) {
        void deleteNote(noteId);
      }
    });
  });
}

window.getResolvedNoteEmployeeId = getResolvedNoteEmployeeId;
window.startNoteEdit = startNoteEdit;
window.cancelNoteEdit = cancelNoteEdit;
window.saveEmployeeNote = saveEmployeeNote;
window.deleteNote = deleteNote;
window.loadEmployeeNotes = loadEmployeeNotes;
