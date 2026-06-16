import { requestAndCopyEmployeeSigningLink } from '../services/employeeAcknowledgmentSigning';
import {
  bindHistoryItemActions,
  clearRecordEditModeUi,
  deleteEmployeeRecordRow,
  getDrawerEmployee,
  getEmployeeId,
  loadEmployeeRecordHistory,
  renderBasicDashboardKpisIfAvailable,
  saveEmployeeRecordRow,
  setDrawerInputValue,
  setRecordEditModeUi,
  type EmployeeLike,
  type EmployeeRecordRow,
} from '../services/employeeRecordCrud';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';
import {
  clearCanvasSignature,
  getCanvasSignature,
  setCanvasSignature,
  setSignatureRequestContext,
} from '../ui/signaturePads';
import { stopAllDictation } from './dictation';

interface DisciplineRecord extends EmployeeRecordRow {
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
}

const TABLE = 'discipline_reports';
const EDIT_UI = {
  saveButtonId: 'saveDisciplineBtn',
  saveLabel: 'Save Discipline Report',
  updateLabel: 'Update Discipline Report',
  cancelButtonId: 'cancelDisciplineEditBtn',
  editStatusId: 'disciplineEditStatus',
  editStatusText: 'Editing saved discipline record',
};

let currentDisciplineId: string | null = null;

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
  setDrawerInputValue('disciplineDate', todayInputValue());
  setDrawerInputValue('disciplineType', '');
  setDrawerInputValue('disciplineLevel', '');
  setDrawerInputValue('disciplineDescription', '');
  setDrawerInputValue('disciplineAction', '');
  setDrawerInputValue('disciplineStatus', 'Open');

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

function employeeSignerName(employee: EmployeeLike | null): string {
  return [employee?.first_name || employee?.first, employee?.last_name || employee?.last]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function setDisciplineSignatureContext(recordId: string, employee: EmployeeLike | null): void {
  const employeeId = String(getEmployeeId(employee) || '').trim();
  if (!recordId || !employeeId) return;

  setSignatureRequestContext({
    formType: 'discipline',
    recordId,
    employeeId,
    signerName: employeeSignerName(employee),
    signerEmail: String((employee as { email?: string; work_email?: string })?.email || '').trim(),
  });
}

function renderDisciplineRows(rows: DisciplineRecord[]): string {
  return rows
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
}

function bindDisciplineExtraActions(
  container: HTMLElement,
  rows: DisciplineRecord[],
  reloadEmployeeId: string
): void {
  bindHistoryItemActions({
    container,
    rows,
    editDataAttribute: 'data-edit-discipline-id',
    deleteDataAttribute: 'data-delete-discipline-id',
    getRowId: (row) => String(row.id || ''),
    onEdit: editDisciplineRecord,
    onDelete: (rowId) => deleteDisciplineRecord(rowId, reloadEmployeeId),
  });

  container.querySelectorAll<HTMLButtonElement>('[data-request-discipline-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const recordId = button.getAttribute('data-request-discipline-id');
      const record = rows.find((row) => String(row.id) === String(recordId));
      if (!recordId || !record) return;

      const employee = getDrawerEmployee();
      const employeeId = String(record.employee_id || getEmployeeId(employee) || '').trim();
      if (!employeeId) {
        showToast('Employee context is missing for this record.', 'error');
        return;
      }

      try {
        await requestAndCopyEmployeeSigningLink({
          formType: 'discipline',
          recordId,
          employeeId,
          signerName: employeeSignerName(employee) || undefined,
          signerEmail: String((employee as { email?: string })?.email || '').trim() || undefined,
        });
        showToast('Signing link copied. Send it to the employee — no Orbis login required.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not create signing link.';
        showToast(message, 'error');
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pdf-discipline-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const recordId = button.getAttribute('data-pdf-discipline-id');
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
}

async function refreshDisciplineDependentUi(employeeId: string): Promise<void> {
  await loadEmployeeDiscipline(employeeId);
  renderBasicDashboardKpisIfAvailable();
}

export async function loadEmployeeDiscipline(employeeId: string): Promise<void> {
  await loadEmployeeRecordHistory<DisciplineRecord>({
    historyContainerId: 'disciplineHistory',
    table: TABLE,
    employeeId,
    logPrefix: 'Discipline',
    loadingMessage: 'Loading discipline history...',
    noEmployeeMessage: 'Open an employee to view discipline records.',
    emptyMessage: 'No discipline records found for this employee.',
    errorMessage: 'Could not load discipline records.',
    dateFields: ['incident_date', 'created_at'],
    order: [
      { column: 'incident_date', ascending: false },
      { column: 'created_at', ascending: false },
    ],
    renderRows: renderDisciplineRows,
    bindActions: bindDisciplineExtraActions,
  });
}

export function editDisciplineRecord(record: DisciplineRecord): void {
  if (!record) return;

  currentDisciplineId = record.id || null;
  window.currentDisciplineId = currentDisciplineId;

  const employee = getDrawerEmployee();
  const employeeId = String(record.employee_id || getEmployeeId(employee) || '').trim();
  if (record.id && employeeId) {
    setDisciplineSignatureContext(String(record.id), employee);
  }

  activateDisciplineTab();
  window.initDisciplineSignaturePads?.();

  setDrawerInputValue('disciplineDate', normalizeDateInputValue(record.incident_date));
  setDrawerInputValue('disciplineType', record.issue_type || '');
  setDrawerInputValue('disciplineLevel', record.discipline_level || '');
  setDrawerInputValue('disciplineDescription', record.description || '');
  setDrawerInputValue('disciplineAction', record.action_taken || '');
  setDrawerInputValue('disciplineStatus', record.report_status || 'Open');

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

  setRecordEditModeUi(EDIT_UI);
  showToast('Discipline record loaded for editing.');
}

export function cancelDisciplineEdit(): void {
  stopAllDictation();
  currentDisciplineId = null;
  window.currentDisciplineId = null;

  resetDisciplineForm();
  clearRecordEditModeUi(EDIT_UI);
  setSignatureRequestContext(null);
  showToast('Discipline edit cancelled.');
}

export async function deleteDisciplineRecord(recordId: string, employeeId: string): Promise<void> {
  const deleted = await deleteEmployeeRecordRow(
    TABLE,
    recordId,
    { message: 'Delete this discipline record?', title: 'Delete discipline' },
    'Discipline'
  );

  if (!deleted) return;

  showToast('Discipline record deleted.');

  if (String(currentDisciplineId || '') === String(recordId)) {
    cancelDisciplineEdit();
  }

  await refreshDisciplineDependentUi(employeeId);
}

export async function saveDisciplineRecord(): Promise<void> {
  stopAllDictation();

  const employee = getDrawerEmployee();
  const employeeId = getEmployeeId(employee);

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
  const result = await saveEmployeeRecordRow<DisciplineRecord>(
    TABLE,
    disciplinePayload,
    recordId,
    {
      logPrefix: 'Discipline',
      stripMissingColumns: false,
      updateMatch: recordId ? { employee_id: employeeId } : undefined,
    }
  );

  if (result.error) {
    console.error('[Discipline] Save failed:', result.error);
    showToast(result.error.message || 'Could not save discipline record.', 'error');
    return;
  }

  const savedRecord = Array.isArray(result.data) ? result.data[0] : null;
  const savedRecordId = String(savedRecord?.id || recordId || '').trim();

  showToast(recordId ? 'Discipline report updated.' : 'Discipline report saved.');

  if (savedRecordId) {
    setDisciplineSignatureContext(savedRecordId, employee);
  }

  currentDisciplineId = null;
  window.currentDisciplineId = null;
  clearRecordEditModeUi(EDIT_UI);
  resetDisciplineForm();

  await refreshDisciplineDependentUi(employeeId);
}

window.loadEmployeeDiscipline = loadEmployeeDiscipline;
window.saveDisciplineRecord = saveDisciplineRecord;
window.saveDisciplineReport = saveDisciplineRecord;
window.editDisciplineRecord = editDisciplineRecord;
window.deleteDisciplineRecord = deleteDisciplineRecord;
window.cancelDisciplineEdit = cancelDisciplineEdit;
