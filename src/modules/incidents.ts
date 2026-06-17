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
  type EmployeeRecordRow,
} from '../services/employeeRecordCrud';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';
import {
  clearCanvasSignature,
  getCanvasSignature,
  setCanvasSignature,
} from '../ui/signaturePads';
import { stopAllDictation } from './dictation';

interface IncidentRecord extends EmployeeRecordRow {
  incident_date?: string;
  incident_type?: string;
  location?: string;
  description?: string;
  follow_up?: string;
  status?: string;
  refused_to_sign?: boolean;
  employee_signature?: string;
  manager_signature?: string;
  witness_signature?: string;
}

const TABLE = 'incident_reports';
const EDIT_UI = {
  saveButtonId: 'saveIncidentBtn',
  saveLabel: 'Save Incident Record',
  updateLabel: 'Update Incident Record',
  cancelButtonId: 'cancelIncidentEditBtn',
  editStatusId: 'incidentEditStatus',
  editStatusText: 'Editing saved incident record',
};

let currentIncidentId: string | null = null;

function resetIncidentForm(): void {
  setDrawerInputValue('incidentDate', todayInputValue());
  setDrawerInputValue('incidentType', '');
  setDrawerInputValue('incidentLocation', '');
  setDrawerInputValue('incidentStatus', '');
  setDrawerInputValue('incidentDescription', '');
  setDrawerInputValue('incidentCorrectiveAction', '');
  setDrawerInputValue('incidentFollowUp', '');

  const refused = safeGet<HTMLInputElement>('incidentRefusedToSign');
  if (refused) refused.checked = false;

  clearCanvasSignature('incidentEmployeeSignature', 'incidentEmployeeSigStatus');
  clearCanvasSignature('incidentManagerSignature', 'incidentManagerSigStatus');
  clearCanvasSignature('incidentWitnessSignature', 'incidentWitnessSigStatus');
}

function buildIncidentPayload(employeeId: string): IncidentRecord {
  return {
    employee_id: employeeId,
    incident_date: safeGet<HTMLInputElement>('incidentDate')?.value || todayInputValue(),
    incident_type: safeGet<HTMLInputElement>('incidentType')?.value || '',
    location: safeGet<HTMLInputElement>('incidentLocation')?.value || '',
    description: safeGet<HTMLTextAreaElement>('incidentDescription')?.value || '',
    follow_up:
      safeGet<HTMLTextAreaElement>('incidentCorrectiveAction')?.value ||
      safeGet<HTMLTextAreaElement>('incidentFollowUp')?.value ||
      '',
    status: safeGet<HTMLSelectElement>('incidentStatus')?.value || '',
    refused_to_sign: safeGet<HTMLInputElement>('incidentRefusedToSign')?.checked || false,
    employee_signature: getCanvasSignature('incidentEmployeeSignature'),
    manager_signature: getCanvasSignature('incidentManagerSignature'),
    witness_signature: getCanvasSignature('incidentWitnessSignature'),
  };
}

function renderIncidentRows(rows: IncidentRecord[]): string {
  return rows
    .map(
      (row) => `
          <div class="history-item" data-incident-id="${esc(row.id || '')}">
            <div class="history-top">
              <div>
                <strong>${esc(row.incident_type || 'Incident Report')}</strong>
                <span>${esc(row.incident_date || row.created_at || '')}</span>
              </div>

              <div style="display:flex; gap:6px; align-items:center;">
                <button class="button soft sm" type="button" data-edit-incident-id="${esc(row.id || '')}">Edit</button>
                <button class="button danger sm" type="button" data-delete-incident-id="${esc(row.id || '')}">Delete</button>
              </div>
            </div>

            <div class="history-body">
              <strong>Location:</strong>
              ${esc(row.location || '')}

              <br><br>

              <strong>Status:</strong>
              ${esc(row.status || '')}

              <br><br>

              <strong>Description:</strong><br>
              ${nl2br(row.description || '')}

              <br><br>

              <strong>Follow-Up / Corrective Action:</strong><br>
              ${nl2br(row.follow_up || '')}
            </div>
          </div>
        `
    )
    .join('');
}

async function refreshIncidentDependentUi(employeeId: string): Promise<void> {
  await loadEmployeeIncidents(employeeId);
  renderBasicDashboardKpisIfAvailable();
}

export async function loadEmployeeIncidents(employeeId: string): Promise<void> {
  await loadEmployeeRecordHistory<IncidentRecord>({
    historyContainerId: 'incidentsHistory',
    table: TABLE,
    employeeId,
    logPrefix: 'Incidents',
    loadingMessage: 'Loading incidents...',
    noEmployeeMessage: 'Open an employee to view incidents.',
    emptyMessage: 'No incident records found for this employee.',
    errorMessage: 'Could not load incident records.',
    dateFields: ['incident_date', 'created_at'],
    renderRows: renderIncidentRows,
    bindActions: (container, rows, reloadEmployeeId) => {
      bindHistoryItemActions({
        container,
        rows,
        editDataAttribute: 'data-edit-incident-id',
        deleteDataAttribute: 'data-delete-incident-id',
        getRowId: (row) => String(row.id || ''),
        onEdit: editIncidentRecord,
        onDelete: (rowId) => deleteIncidentRecord(rowId, reloadEmployeeId),
      });
    },
  });
}

export function editIncidentRecord(record: IncidentRecord): void {
  if (!record) return;

  currentIncidentId = record.id || null;
  window.currentIncidentId = currentIncidentId;

  setDrawerInputValue('incidentDate', record.incident_date || todayInputValue());
  setDrawerInputValue('incidentType', record.incident_type || '');
  setDrawerInputValue('incidentLocation', record.location || '');
  setDrawerInputValue('incidentDescription', record.description || '');
  setDrawerInputValue('incidentCorrectiveAction', record.follow_up || '');
  setDrawerInputValue('incidentStatus', record.status || '');

  const refused = safeGet<HTMLInputElement>('incidentRefusedToSign');
  if (refused) refused.checked = record.refused_to_sign === true;

  setCanvasSignature(
    'incidentEmployeeSignature',
    'incidentEmployeeSigStatus',
    String(record.employee_signature || '')
  );
  setCanvasSignature(
    'incidentManagerSignature',
    'incidentManagerSigStatus',
    String(record.manager_signature || '')
  );
  setCanvasSignature(
    'incidentWitnessSignature',
    'incidentWitnessSigStatus',
    String(record.witness_signature || '')
  );

  setRecordEditModeUi(EDIT_UI);
  showToast('Incident record loaded for editing.');
}

export async function deleteIncidentRecord(incidentId: string, employeeId: string): Promise<void> {
  const deleted = await deleteEmployeeRecordRow(
    TABLE,
    incidentId,
    { message: 'Delete this incident record?', title: 'Delete incident' },
    'Incidents'
  );

  if (!deleted) return;

  showToast('Incident record deleted.');

  if (String(currentIncidentId || '') === String(incidentId)) {
    currentIncidentId = null;
    window.currentIncidentId = null;
    clearRecordEditModeUi(EDIT_UI);
  }

  await refreshIncidentDependentUi(employeeId);
}

export async function saveIncidentRecord(): Promise<void> {
  stopAllDictation();

  const employeeId = getEmployeeId(getDrawerEmployee());
  if (!employeeId) {
    showToast('Open an employee before saving an incident record.', 'error');
    return;
  }

  const incidentPayload = buildIncidentPayload(employeeId);
  if (!incidentPayload.incident_type && !incidentPayload.description) {
    showToast('Enter an incident type or description before saving.', 'error');
    return;
  }

  const incidentId = currentIncidentId || window.currentIncidentId;
  const result = await saveEmployeeRecordRow<IncidentRecord>(
    TABLE,
    incidentPayload,
    incidentId,
    {
      logPrefix: 'Incidents',
      updateMatch: incidentId ? { employee_id: employeeId } : undefined,
    }
  );

  if (result.error) {
    console.error('Incident save failed:', result.error);
    showToast(result.error.message || 'Could not save incident record.', 'error');
    return;
  }

  const savedIncident = Array.isArray(result.data)
    ? (result.data[0] as IncidentRecord | undefined)
    : undefined;
  const reloadEmployeeId = String(savedIncident?.employee_id || employeeId);

  showToast(incidentId ? 'Incident record updated.' : 'Incident record saved.');

  currentIncidentId = null;
  window.currentIncidentId = null;
  clearRecordEditModeUi(EDIT_UI);
  resetIncidentForm();

  await refreshIncidentDependentUi(reloadEmployeeId);
}

window.saveIncidentRecord = saveIncidentRecord;
window.saveIncidentReport = saveIncidentRecord;
window.loadEmployeeIncidents = loadEmployeeIncidents;
window.loadIncidentReports = loadEmployeeIncidents;
window.loadEmployeeIncidentReports = loadEmployeeIncidents;
window.editIncidentRecord = editIncidentRecord;
window.deleteIncidentRecord = deleteIncidentRecord;
