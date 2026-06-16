import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';
import { stopAllDictation } from './dictation';
import { requestAndCopyEmployeeSigningLink } from '../services/employeeAcknowledgmentSigning';
import {
  clearCanvasSignature,
  getCanvasSignature,
  setCanvasSignature,
  setSignatureRequestContext,
} from '../ui/signaturePads';

interface DisciplineRecord {
  id?: string;
  employee_id?: string;
  incident_date?: string;
  issue_type?: string;
  discipline_level?: string;
  description?: string;
  action_taken?: string;
  report_status?: string;
  refused_to_sign?: boolean;
  employee_signature?: string;
  manager_signature?: string;
  witness_signature?: string;
  created_at?: string;
  created_by?: string;
  [key: string]: unknown;
}

interface DisciplineEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  first_name?: string;
  last_name?: string;
  first?: string;
  last?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    currentEmployee?: DisciplineEmployee;
    currentDisciplineId?: string | null;

    loadEmployeeDiscipline?: (employeeId: string) => Promise<void>;
    saveDisciplineRecord?: () => Promise<void>;
    saveDisciplineReport?: () => Promise<void>;
    editDisciplineRecord?: (record: DisciplineRecord) => void;
    deleteDisciplineRecord?: (recordId: string, employeeId: string) => Promise<void>;
    cancelDisciplineEdit?: () => void;

    showToast?: (message: string, type?: string) => void;
    safeGet?: (id: string) => HTMLElement | null;
    todayInputValue?: () => string;
    switchTab?: (tabName: string) => void;

    renderBasicDashboardKpis?: () => void;
  }
}

let currentDisciplineId: string | null = null;

function getCurrentEmployee(): DisciplineEmployee | null {
  return window.currentEmployee || null;
}

function getEmployeeId(employee: DisciplineEmployee | null): string {
  return String(
    employee?.dbId || employee?.employee_id || employee?.id || employee?.displayId || ''
  );
}

function getEmployeeLookupIds(
  employee: DisciplineEmployee | null,
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

function normalizeDateInputValue(value: unknown): string {
  const raw = String(value ?? '').trim();

  if (!raw) return todayInputValue();

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);

  return match ? match[1] : raw;
}

function activateDisciplineTab(): void {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset.tab === 'discipline');
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === 'tab-discipline');
  });
}

function resetDisciplineForm(): void {
  setInputValue('disciplineDate', todayInputValue());
  setInputValue('disciplineType', '');
  setInputValue('disciplineLevel', '');
  setInputValue('disciplineDescription', '');
  setInputValue('disciplineAction', '');
  setInputValue('disciplineStatus', 'Open');

  const refused = safeGet<HTMLInputElement>('disciplineRefusedToSign');

  if (refused) refused.checked = false;

  clearCanvasSignature('disciplineEmployeeSignature', 'disciplineEmployeeSigStatus');
  clearCanvasSignature('disciplineManagerSignature', 'disciplineManagerSigStatus');
  clearCanvasSignature('disciplineWitnessSignature', 'disciplineWitnessSigStatus');
}

function buildDisciplinePayload(employeeId: string): DisciplineRecord {
  return {
    employee_id: employeeId,
    incident_date: safeGet<HTMLInputElement>('disciplineDate')?.value || '',
    issue_type: safeGet<HTMLSelectElement>('disciplineType')?.value || '',
    discipline_level: safeGet<HTMLSelectElement>('disciplineLevel')?.value || '',
    description: safeGet<HTMLTextAreaElement>('disciplineDescription')?.value.trim() || '',
    action_taken: safeGet<HTMLTextAreaElement>('disciplineAction')?.value.trim() || '',
    report_status: safeGet<HTMLSelectElement>('disciplineStatus')?.value || 'Open',
    refused_to_sign: safeGet<HTMLInputElement>('disciplineRefusedToSign')?.checked || false,
    employee_signature: getCanvasSignature('disciplineEmployeeSignature'),
    manager_signature: getCanvasSignature('disciplineManagerSignature'),
    witness_signature: getCanvasSignature('disciplineWitnessSignature'),
  };
}

async function refreshDisciplineDependentUi(employeeId: string): Promise<void> {
  await loadEmployeeDiscipline(employeeId);

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export async function loadEmployeeDiscipline(employeeId: string): Promise<void> {
  const target = safeGet('disciplineHistory');

  if (!target) return;

  target.innerHTML = '<div class="empty">Loading discipline history...</div>';

  try {
    const activeEmployee = getCurrentEmployee();
    const primaryEmployeeId = String(employeeId || getEmployeeId(activeEmployee) || '').trim();
    const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

    if (!primaryEmployeeId && !employeeIds.length) {
      target.innerHTML = '<div class="empty">Open an employee to view discipline records.</div>';
      return;
    }

    const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];

    const { data, error } = await supabaseClient
      .from('discipline_reports')
      .select('*')
      .in('employee_id', idsToSearch)
      .order('incident_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Discipline] Could not load discipline records:', error);
      target.innerHTML = '<div class="empty">Could not load discipline records.</div>';
      return;
    }

    const rows = ((data || []) as DisciplineRecord[]).sort((a, b) => {
      const dateA = String(a.incident_date || a.created_at || '');
      const dateB = String(b.incident_date || b.created_at || '');
      return dateB.localeCompare(dateA);
    });

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No discipline records found for this employee.</div>';
      return;
    }

    target.innerHTML = rows
      .map(
        (row) => `
      <div class="history-item" data-discipline-id="${esc(row.id || '')}">
        <div class="history-top">
          <div>
            <strong>${esc(row.issue_type || 'Discipline Report')}</strong>
            <span>${esc(row.incident_date || row.created_at || '')}</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
            <button class="button soft sm" type="button" data-edit-discipline-id="${esc(row.id || '')}">Edit</button>
            ${
              row.employee_signature
                ? `<button class="button soft sm" type="button" data-pdf-discipline-id="${esc(row.id || '')}">Generate PDF</button>`
                : `<button class="button primary sm" type="button" data-request-discipline-id="${esc(row.id || '')}">Copy signing link</button>
                   <button class="button soft sm" type="button" data-pdf-discipline-id="${esc(row.id || '')}">Generate PDF</button>`
            }
            <button class="button danger sm" type="button" data-delete-discipline-id="${esc(row.id || '')}">Delete</button>
          </div>
        </div>
        <div class="history-body">
          <strong>Level:</strong> ${esc(row.discipline_level || '')}<br><br>
          <strong>Status:</strong> ${esc(row.report_status || '')}<br><br>
          <strong>Description:</strong><br>${nl2br(row.description || '')}<br><br>
          <strong>Action Taken:</strong><br>${nl2br(row.action_taken || '')}
        </div>
      </div>
    `
      )
      .join('');

    target.querySelectorAll<HTMLButtonElement>('[data-edit-discipline-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const recordId = button.dataset.editDisciplineId;
        const record = rows.find((row) => String(row.id) === String(recordId));

        if (!record) return;

        editDisciplineRecord(record);
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-request-discipline-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const recordId = button.dataset.requestDisciplineId;
        const record = rows.find((row) => String(row.id) === String(recordId));
        if (!recordId || !record) return;

        const employee = getCurrentEmployee();
        const employeeId = String(record.employee_id || getEmployeeId(employee) || '').trim();
        if (!employeeId) {
          showToast('Employee context is missing for this record.', 'error');
          return;
        }

        const signerName = [
          employee?.first_name || employee?.first,
          employee?.last_name || employee?.last,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

        try {
          await requestAndCopyEmployeeSigningLink({
            formType: 'discipline',
            recordId,
            employeeId,
            signerName: signerName || undefined,
            signerEmail: String((employee as { email?: string })?.email || '').trim() || undefined,
          });
          showToast('Signing link copied. Send it to the employee — no Orbis login required.');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not create signing link.';
          showToast(message, 'error');
        }
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-pdf-discipline-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const recordId = button.dataset.pdfDisciplineId;
        if (!recordId) return;

        try {
          const { openErAcknowledgmentPdf } = await import('../services/erAcknowledgmentPdf');
          await openErAcknowledgmentPdf('discipline', recordId);
          showToast('PDF downloaded.');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not generate PDF.';
          showToast(message, 'error');
        }
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-delete-discipline-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const recordId = button.dataset.deleteDisciplineId;

        if (!recordId) return;

        await deleteDisciplineRecord(recordId, primaryEmployeeId || idsToSearch[0]);
      });
    });
  } catch (err) {
    console.error('[Discipline] Unexpected discipline history failure:', err);
    target.innerHTML = '<div class="empty">Could not load discipline records.</div>';
  }
}

export function editDisciplineRecord(record: DisciplineRecord): void {
  if (!record) return;

  currentDisciplineId = record.id || null;
  window.currentDisciplineId = currentDisciplineId;

  const employee = getCurrentEmployee();
  const employeeId = String(record.employee_id || getEmployeeId(employee) || '').trim();
  if (record.id && employeeId) {
    setSignatureRequestContext({
      formType: 'discipline',
      recordId: String(record.id),
      employeeId,
      signerName: [employee?.first_name || employee?.first, employee?.last_name || employee?.last]
        .filter(Boolean)
        .join(' ')
        .trim(),
      signerEmail: String((employee as { email?: string; work_email?: string })?.email || '').trim(),
    });
  }

  activateDisciplineTab();
  window.initDisciplineSignaturePads?.();

  setInputValue('disciplineDate', normalizeDateInputValue(record.incident_date));
  setInputValue('disciplineType', record.issue_type || '');
  setInputValue('disciplineLevel', record.discipline_level || '');
  setInputValue('disciplineDescription', record.description || '');
  setInputValue('disciplineAction', record.action_taken || '');
  setInputValue('disciplineStatus', record.report_status || 'Open');

  const refused = safeGet<HTMLInputElement>('disciplineRefusedToSign');

  if (refused) refused.checked = record.refused_to_sign === true;

  const applyStoredSignatures = () => {
    setCanvasSignature(
      'disciplineEmployeeSignature',
      'disciplineEmployeeSigStatus',
      String(record.employee_signature || '')
    );
    setCanvasSignature(
      'disciplineManagerSignature',
      'disciplineManagerSigStatus',
      String(record.manager_signature || '')
    );
    setCanvasSignature(
      'disciplineWitnessSignature',
      'disciplineWitnessSigStatus',
      String(record.witness_signature || '')
    );
  };

  applyStoredSignatures();
  window.setTimeout(applyStoredSignatures, 0);

  const saveButton = safeGet('saveDisciplineBtn');

  if (saveButton) saveButton.textContent = 'Update Discipline Report';

  const editStatus = safeGet('disciplineEditStatus');

  if (editStatus) {
    editStatus.textContent = 'Editing saved discipline record';
    editStatus.classList.remove('hidden');
  }

  safeGet('cancelDisciplineEditBtn')?.classList.remove('hidden');

  showToast('Discipline record loaded for editing.');
}

export function cancelDisciplineEdit(): void {
  stopAllDictation();
  currentDisciplineId = null;
  window.currentDisciplineId = null;

  resetDisciplineForm();

  const saveButton = safeGet('saveDisciplineBtn');

  if (saveButton) saveButton.textContent = 'Save Discipline Report';

  safeGet('cancelDisciplineEditBtn')?.classList.add('hidden');
  safeGet('disciplineEditStatus')?.classList.add('hidden');

  setSignatureRequestContext(null);
  showToast('Discipline edit cancelled.');
}

export async function deleteDisciplineRecord(recordId: string, employeeId: string): Promise<void> {
  if (!recordId) return;

  if (
    !(await showOrbisConfirm('Delete this discipline record?', {
      title: 'Delete discipline',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const { error } = await supabaseClient.from('discipline_reports').delete().eq('id', recordId);

  if (error) {
    console.error('[Discipline] Delete failed:', error);
    showToast(error.message || 'Could not delete discipline record.', 'error');
    return;
  }

  showToast('Discipline record deleted.');

  if (String(currentDisciplineId || '') === String(recordId)) {
    cancelDisciplineEdit();
  }

  await refreshDisciplineDependentUi(employeeId);
}

export async function saveDisciplineRecord(): Promise<void> {
  stopAllDictation();

  const activeEmployee = getCurrentEmployee();
  const employeeId = getEmployeeId(activeEmployee);

  if (!employeeId) {
    showToast('Open an employee before saving a discipline record.', 'error');
    return;
  }

  const disciplinePayload = buildDisciplinePayload(employeeId);

  if (!disciplinePayload.incident_date || !disciplinePayload.description) {
    showToast('Enter an incident date and description before saving.', 'error');
    return;
  }

  const recordId = currentDisciplineId || window.currentDisciplineId;

  const result = recordId
    ? await supabaseClient
        .from('discipline_reports')
        .update(disciplinePayload)
        .eq('id', recordId)
        .eq('employee_id', employeeId)
        .select()
    : await supabaseClient.from('discipline_reports').insert([disciplinePayload]).select();

  if (result.error) {
    console.error('[Discipline] Save failed:', result.error);
    showToast(result.error.message || 'Could not save discipline record.', 'error');
    return;
  }

  const savedRecord = Array.isArray(result.data) ? result.data[0] : null;
  const savedRecordId = String(savedRecord?.id || recordId || '').trim();

  showToast(recordId ? 'Discipline report updated.' : 'Discipline report saved.');

  if (savedRecordId) {
    const employee = getCurrentEmployee();
    const employeeId = String(savedRecord?.employee_id || getEmployeeId(employee) || '').trim();
    if (employeeId) {
      setSignatureRequestContext({
        formType: 'discipline',
        recordId: savedRecordId,
        employeeId,
        signerName: [employee?.first_name || employee?.first, employee?.last_name || employee?.last]
          .filter(Boolean)
          .join(' ')
          .trim(),
        signerEmail: String((employee as { email?: string })?.email || '').trim(),
      });
    }
  }

  currentDisciplineId = null;
  window.currentDisciplineId = null;

  const saveButton = safeGet('saveDisciplineBtn');

  if (saveButton) saveButton.textContent = 'Save Discipline Report';

  safeGet('cancelDisciplineEditBtn')?.classList.add('hidden');
  safeGet('disciplineEditStatus')?.classList.add('hidden');

  resetDisciplineForm();

  await refreshDisciplineDependentUi(employeeId);
}

window.loadEmployeeDiscipline = loadEmployeeDiscipline;
window.saveDisciplineRecord = saveDisciplineRecord;
window.saveDisciplineReport = saveDisciplineRecord;
window.editDisciplineRecord = editDisciplineRecord;
window.deleteDisciplineRecord = deleteDisciplineRecord;
window.cancelDisciplineEdit = cancelDisciplineEdit;
