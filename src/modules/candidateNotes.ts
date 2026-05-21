import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';

type CandidateNote = {
  id?: string;
  candidate_id?: string;
  note_date?: string;
  note_type?: string;
  note_text?: string;
  created_at?: string;
};

declare global {
  interface Window {
    currentCandidateId?: string | null;
    currentCandidateNoteId?: string | null;
    switchCandidateTab?: (tabName: string) => void;
    loadCandidateNotes?: (candidateId?: string) => Promise<void>;
    saveCandidateNote?: () => Promise<void>;
    deleteCandidateNote?: (noteId: string) => Promise<void>;
    startCandidateNoteEdit?: (note: CandidateNote) => void;
    cancelCandidateNoteEdit?: () => void;
  }
}

let currentCandidateNoteId: string | null = null;

function getResolvedCandidateId(candidateId: string | null = null): string {
  return String(
    candidateId || window.currentCandidateId || (window as { currentCandidateId?: string }).currentCandidateId || ''
  ).trim();
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    message.includes('candidate_notes') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function renderNotesSetupMessage(target: HTMLElement): void {
  target.innerHTML = `
    <div class="empty">
      Candidate notes table is not set up yet. Run
      <code>supabase/candidate_notes.sql</code>
      in the Supabase SQL editor, then click Retry.
    </div>
  `;
}

export function cancelCandidateNoteEdit(): void {
  currentCandidateNoteId = null;
  window.currentCandidateNoteId = null;

  const noteDate = safeGet('candidateNoteDate') as HTMLInputElement | null;
  const noteType = safeGet('candidateNoteType') as HTMLInputElement | null;
  const noteText = safeGet('candidateNoteText') as HTMLTextAreaElement | null;
  const saveBtn = safeGet('saveCandidateNoteBtn');

  if (noteDate) noteDate.value = todayInputValue();
  if (noteType) noteType.value = '';
  if (noteText) noteText.value = '';
  if (saveBtn) saveBtn.textContent = 'Save Note';

  safeGet('cancelCandidateNoteEditBtn')?.classList.add('hidden');
  safeGet('candidateNoteEditStatus')?.classList.add('hidden');
}

export function startCandidateNoteEdit(note: CandidateNote): void {
  currentCandidateNoteId = note.id ? String(note.id) : null;
  window.currentCandidateNoteId = currentCandidateNoteId;

  const noteDate = safeGet('candidateNoteDate') as HTMLInputElement | null;
  const noteType = safeGet('candidateNoteType') as HTMLInputElement | null;
  const noteText = safeGet('candidateNoteText') as HTMLTextAreaElement | null;
  const saveBtn = safeGet('saveCandidateNoteBtn');

  if (noteDate) noteDate.value = note.note_date || todayInputValue();
  if (noteType) noteType.value = note.note_type || '';
  if (noteText) noteText.value = note.note_text || '';
  if (saveBtn) saveBtn.textContent = 'Update Note';

  safeGet('cancelCandidateNoteEditBtn')?.classList.remove('hidden');
  safeGet('candidateNoteEditStatus')?.classList.remove('hidden');

  window.switchCandidateTab?.('notes');
}

export async function saveCandidateNote(): Promise<void> {
  const candidateId = getResolvedCandidateId();

  if (!candidateId) {
    showToast('Save the candidate before adding notes.', 'error');
    return;
  }

  const note_date = (safeGet('candidateNoteDate') as HTMLInputElement | null)?.value || '';
  const note_type = (safeGet('candidateNoteType') as HTMLInputElement | null)?.value || '';
  const note_text = (safeGet('candidateNoteText') as HTMLTextAreaElement | null)?.value.trim() || '';

  if (!note_date || !note_text) {
    showToast('Enter a note date and note text.', 'error');
    return;
  }

  let error;

  if (currentCandidateNoteId) {
    const result = await supabaseClient
      .from('candidate_notes')
      .update({
        note_date,
        note_type,
        note_text,
      })
      .eq('id', currentCandidateNoteId)
      .eq('candidate_id', candidateId);

    error = result.error;
  } else {
    const result = await supabaseClient.from('candidate_notes').insert([
      {
        candidate_id: candidateId,
        note_date,
        note_type,
        note_text,
      },
    ]);

    error = result.error;
  }

  if (error) {
    console.error('[CandidateNotes] Save failed:', error);

    if (isMissingTableError(error)) {
      showToast('Candidate notes table is missing. Run supabase/candidate_notes.sql.', 'error');
    } else {
      showToast(currentCandidateNoteId ? 'Could not update note.' : 'Could not save note.', 'error');
    }

    return;
  }

  showToast(currentCandidateNoteId ? 'Note updated.' : 'Note saved.');
  cancelCandidateNoteEdit();
  await loadCandidateNotes(candidateId);
  window.switchCandidateTab?.('notes');
}

export async function deleteCandidateNote(noteId: string): Promise<void> {
  const candidateId = getResolvedCandidateId();

  if (!candidateId) {
    showToast('No candidate selected.', 'error');
    return;
  }

  const confirmed = await showOrbisConfirm('Delete this candidate note?', {
    title: 'Delete note',
    confirmLabel: 'Delete',
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  const { data: deletedRows, error } = await supabaseClient
    .from('candidate_notes')
    .delete()
    .eq('id', noteId)
    .eq('candidate_id', candidateId)
    .select();

  if (error) {
    console.error('[CandidateNotes] Delete failed:', error);
    showToast('Could not delete note.', 'error');
    return;
  }

  if (!deletedRows?.length) {
    showToast('No note was deleted.', 'error');
    return;
  }

  if (String(currentCandidateNoteId) === String(noteId)) {
    cancelCandidateNoteEdit();
  }

  showToast('Note deleted.');
  await loadCandidateNotes(candidateId);
}

export async function loadCandidateNotes(candidateId?: string): Promise<void> {
  const target = safeGet('candidateNotesHistory') || safeGet('candidateNotesPreview');

  if (!target) {
    return;
  }

  const resolvedCandidateId = getResolvedCandidateId(candidateId || null);

  if (!resolvedCandidateId) {
    target.innerHTML =
      '<div class="empty">Save the candidate record before adding dated notes.</div>';
    return;
  }

  target.innerHTML = '<div class="empty">Loading candidate notes...</div>';

  const { data, error } = await supabaseClient
    .from('candidate_notes')
    .select('*')
    .eq('candidate_id', resolvedCandidateId)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[CandidateNotes] Load failed:', error);

    if (isMissingTableError(error)) {
      renderNotesSetupMessage(target);
      return;
    }

    target.innerHTML = '<div class="empty">Could not load candidate notes.</div>';
    return;
  }

  if (!data?.length) {
    target.innerHTML = '<div class="empty">No notes for this candidate yet.</div>';
    return;
  }

  const rows = data as CandidateNote[];

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
              <button class="button soft" type="button" data-edit-candidate-note-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-candidate-note-id="${esc(row.id)}">Delete</button>
              <span class="badge badge-soft">Note</span>
            </div>
          </div>
          <div class="history-body">${nl2br(row.note_text || '')}</div>
        </div>
      `
    )
    .join('');

  target.querySelectorAll<HTMLButtonElement>('[data-edit-candidate-note-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const note = rows.find((row) => String(row.id) === String(button.dataset.editCandidateNoteId));

      if (note) {
        startCandidateNoteEdit(note);
      }
    });
  });

  target.querySelectorAll<HTMLButtonElement>('[data-delete-candidate-note-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const noteId = button.dataset.deleteCandidateNoteId;

      if (noteId) {
        void deleteCandidateNote(noteId);
      }
    });
  });
}

window.loadCandidateNotes = loadCandidateNotes;
window.saveCandidateNote = saveCandidateNote;
window.deleteCandidateNote = deleteCandidateNote;
window.startCandidateNoteEdit = startCandidateNoteEdit;
window.cancelCandidateNoteEdit = cancelCandidateNoteEdit;
