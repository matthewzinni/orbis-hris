import { supabaseClient } from '../services/supabaseClient';

interface StayInterviewRecord {
  id?: string;
  employee_id?: string;
  interview_date?: string;
  interview_type?: string;
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
  q5?: string;
  q6?: string;
  q7?: string;
  manager_summary?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface StayInterviewEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    currentEmployee?: StayInterviewEmployee;
    currentStayInterviewId?: string | null;

    loadStayInterviews?: (employeeId: string) => Promise<void>;
    saveStayInterview?: () => Promise<void>;
    editStayInterview?: (stayInterviewId: string) => Promise<void>;
    deleteStayInterview?: (stayInterviewId: string) => Promise<void>;
    cancelStayInterviewEdit?: () => void;

    showToast?: (message: string, type?: string) => void;
    safeGet?: (id: string) => HTMLElement | null;
    todayInputValue?: () => string;
    switchTab?: (tabName: string) => void;
    getCurrentEmployeeForOrbis?: () => StayInterviewEmployee | null;
  }
}

let currentStayInterviewId: string | null = null;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }

  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: string = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

function todayInputValue(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }

  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nl2br(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function fmtDate(value: unknown): string {
  const raw = String(value || '').trim();

  if (!raw) return '';

  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString();
}

function getCurrentEmployee(): StayInterviewEmployee | null {
  if (typeof window.getCurrentEmployeeForOrbis === 'function') {
    return window.getCurrentEmployeeForOrbis();
  }

  return window.currentEmployee || null;
}

function getEmployeeLookupIds(
  employee: StayInterviewEmployee | null,
  fallbackId?: string
): string[] {
  return [employee?.dbId, employee?.employee_id, employee?.id, employee?.displayId, fallbackId]
    .filter(Boolean)
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function setInputValue(id: string, value: unknown): void {
  const input = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);

  if (!input) return;

  input.value = String(value ?? '');
}

function resetStayInterviewForm(): void {
  currentStayInterviewId = null;
  window.currentStayInterviewId = null;

  setInputValue('stayInterviewDate', todayInputValue());
  setInputValue('stayInterviewType', '');
  setInputValue('stayQ1', '');
  setInputValue('stayQ2', '');
  setInputValue('stayQ3', '');
  setInputValue('stayQ4', '');
  setInputValue('stayQ5', '');
  setInputValue('stayQ6', '');
  setInputValue('stayQ7', '');
  setInputValue('stayManagerSummary', '');

  const saveButton = safeGet('saveStayInterviewBtn');

  if (saveButton) {
    saveButton.textContent = 'Save Stay Interview';
  }

  safeGet('stayInterviewEditStatus')?.classList.add('hidden');
  safeGet('cancelStayInterviewEditBtn')?.classList.add('hidden');
}

export async function loadStayInterviews(employeeId: string): Promise<void> {
  const target = safeGet('stayInterviewHistory');

  if (!target) {
    console.warn('[StayInterviews] stayInterviewHistory container not found.');
    return;
  }

  target.innerHTML = '<div class="empty">Loading stay interviews...</div>';

  try {
    const activeEmployee = getCurrentEmployee();
    const primaryEmployeeId = String(employeeId || '').trim();
    const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

    if (!employeeIds.length) {
      target.innerHTML = '<div class="empty">Open an employee to view stay interviews.</div>';
      return;
    }

    const { data, error } = await supabaseClient
      .from('stay_interviews')
      .select('*')
      .in('employee_id', employeeIds)
      .order('interview_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[StayInterviews] Could not load stay interviews:', error);
      target.innerHTML = '<div class="empty">Error loading stay interviews.</div>';
      return;
    }

    const rows = (data || []) as StayInterviewRecord[];

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No stay interviews yet.</div>';
      return;
    }

    target.innerHTML = rows
      .map((row) => {
        const interviewDate = row.interview_date ? fmtDate(row.interview_date) : 'No date';

        return `
          <div class="history-item">
            <div class="history-top">
              <div>
                <div class="history-title">${escapeHtml(row.interview_type || 'Stay Interview')}</div>
                <div class="history-date">${escapeHtml(interviewDate)}</div>
              </div>
            </div>
            <div class="history-body">
              <strong>What do you look forward to each day?</strong><br>
              ${nl2br(row.q1 || '—')}<br><br>
              <strong>What is going well right now?</strong><br>
              ${nl2br(row.q2 || '—')}<br><br>
              <strong>Frustrations, obstacles, or stress points</strong><br>
              ${nl2br(row.q3 || '—')}<br><br>
              <strong>What would make the job easier or more satisfying?</strong><br>
              ${nl2br(row.q4 || '—')}<br><br>
              <strong>Support from supervisor and team</strong><br>
              ${nl2br(row.q5 || '—')}<br><br>
              <strong>What might cause them to leave?</strong><br>
              ${nl2br(row.q6 || '—')}<br><br>
              <strong>What can we do to help them stay and succeed?</strong><br>
              ${nl2br(row.q7 || '—')}<br><br>
              <strong>HR / Manager Summary</strong><br>
              ${nl2br(row.manager_summary || '—')}
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
              <button class="button soft" type="button" data-edit-stay-id="${escapeHtml(row.id || '')}">Edit</button>
              <button class="button danger" type="button" data-delete-stay-id="${escapeHtml(row.id || '')}">Delete</button>
            </div>
          </div>
        `;
      })
      .join('');

    target.querySelectorAll<HTMLButtonElement>('[data-edit-stay-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const stayId = button.dataset.editStayId;

        if (stayId) {
          void editStayInterview(stayId);
        }
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-delete-stay-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const stayId = button.dataset.deleteStayId;

        if (stayId) {
          void deleteStayInterview(stayId);
        }
      });
    });
  } catch (err) {
    console.error('[StayInterviews] Unexpected stay interview load failure:', err);
    target.innerHTML = '<div class="empty">Could not load stay interviews.</div>';
  }
}

export async function saveStayInterview(): Promise<void> {
  const employee = getCurrentEmployee();

  if (!employee) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const employeeRecordId = String(employee.dbId || employee.id || '').trim();

  if (!employeeRecordId) {
    showToast('Employee record is missing an ID.', 'error');
    return;
  }

  const payload = {
    employee_id: employeeRecordId,
    interview_date: safeGet<HTMLInputElement>('stayInterviewDate')?.value || null,
    interview_type: safeGet<HTMLSelectElement>('stayInterviewType')?.value || '',
    q1: safeGet<HTMLTextAreaElement>('stayQ1')?.value || '',
    q2: safeGet<HTMLTextAreaElement>('stayQ2')?.value || '',
    q3: safeGet<HTMLTextAreaElement>('stayQ3')?.value || '',
    q4: safeGet<HTMLTextAreaElement>('stayQ4')?.value || '',
    q5: safeGet<HTMLTextAreaElement>('stayQ5')?.value || '',
    q6: safeGet<HTMLTextAreaElement>('stayQ6')?.value || '',
    q7: safeGet<HTMLTextAreaElement>('stayQ7')?.value || '',
    manager_summary: safeGet<HTMLTextAreaElement>('stayManagerSummary')?.value || '',
  };

  let error: { message?: string } | null = null;

  if (currentStayInterviewId) {
    const result = await supabaseClient
      .from('stay_interviews')
      .update(payload)
      .eq('id', currentStayInterviewId);

    error = result.error;
  } else {
    const result = await supabaseClient.from('stay_interviews').insert([payload]);

    error = result.error;
  }

  if (error) {
    console.error('[StayInterviews] Could not save stay interview:', error);
    showToast('Could not save stay interview.', 'error');
    return;
  }

  showToast(currentStayInterviewId ? 'Stay interview updated.' : 'Stay interview saved.');
  resetStayInterviewForm();
  await loadStayInterviews(employeeRecordId);
}

export async function editStayInterview(stayInterviewId: string): Promise<void> {
  const { data, error } = await supabaseClient
    .from('stay_interviews')
    .select('*')
    .eq('id', stayInterviewId);

  const interview = (data || [])[0] as StayInterviewRecord | undefined;

  if (error || !interview) {
    console.error('[StayInterviews] Could not load stay interview for editing:', error);
    showToast('Could not load stay interview for editing.', 'error');
    return;
  }

  currentStayInterviewId = interview.id || null;
  window.currentStayInterviewId = currentStayInterviewId;

  setInputValue('stayInterviewDate', interview.interview_date || todayInputValue());
  setInputValue('stayInterviewType', interview.interview_type || '');
  setInputValue('stayQ1', interview.q1 || '');
  setInputValue('stayQ2', interview.q2 || '');
  setInputValue('stayQ3', interview.q3 || '');
  setInputValue('stayQ4', interview.q4 || '');
  setInputValue('stayQ5', interview.q5 || '');
  setInputValue('stayQ6', interview.q6 || '');
  setInputValue('stayQ7', interview.q7 || '');
  setInputValue('stayManagerSummary', interview.manager_summary || '');

  const saveButton = safeGet('saveStayInterviewBtn');

  if (saveButton) {
    saveButton.textContent = 'Update Stay Interview';
  }

  safeGet('stayInterviewEditStatus')?.classList.remove('hidden');
  safeGet('cancelStayInterviewEditBtn')?.classList.remove('hidden');

  if (typeof window.switchTab === 'function') {
    window.switchTab('stay-interviews');
  }

  showToast('Editing stay interview.');
}

export async function deleteStayInterview(stayInterviewId: string): Promise<void> {
  const confirmed = window.confirm('Delete this stay interview? This cannot be undone.');

  if (!confirmed) return;

  const { error } = await supabaseClient.from('stay_interviews').delete().eq('id', stayInterviewId);

  if (error) {
    console.error('[StayInterviews] Could not delete stay interview:', error);
    showToast(`Could not delete stay interview: ${error.message || 'Unknown error'}`, 'error');
    return;
  }

  if (String(currentStayInterviewId) === String(stayInterviewId)) {
    resetStayInterviewForm();
  }

  showToast('Stay interview deleted.');

  const employee = getCurrentEmployee();
  const employeeRecordId = String(employee?.dbId || employee?.id || '').trim();

  if (employeeRecordId) {
    await loadStayInterviews(employeeRecordId);
  }
}

export function cancelStayInterviewEdit(): void {
  resetStayInterviewForm();
  showToast('Stay interview edit cancelled.');
}

window.loadStayInterviews = loadStayInterviews;
window.saveStayInterview = saveStayInterview;
window.editStayInterview = editStayInterview;
window.deleteStayInterview = deleteStayInterview;
window.cancelStayInterviewEdit = cancelStayInterviewEdit;
