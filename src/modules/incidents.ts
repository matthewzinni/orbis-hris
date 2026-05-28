import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';
import { stopAllDictation } from './dictation';
import {
  clearCanvasSignature,
  getCanvasSignature,
  setCanvasSignature,
} from '../ui/signaturePads';

interface IncidentRecord {
  id?: string;
  employee_id?: string;
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
  created_at?: string;
  created_by?: string;
  [key: string]: unknown;
}

interface IncidentEmployee {
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
    currentEmployee?: IncidentEmployee;
    currentIncidentId?: string | null;

    loadEmployeeIncidents?: (employeeId: string) => Promise<void>;
    loadIncidentReports?: (employeeId: string) => Promise<void>;
    loadEmployeeIncidentReports?: (employeeId: string) => Promise<void>;
    saveIncidentRecord?: () => Promise<void>;
    saveIncidentReport?: () => Promise<void>;
    editIncidentRecord?: (record: IncidentRecord) => void;
    deleteIncidentRecord?: (recordId: string, employeeId: string) => Promise<void>;

    showToast?: (message: string, type?: string) => void;
    safeGet?: (id: string) => HTMLElement | null;
    todayInputValue?: () => string;
    getCurrentEmployeeForOrbis?: () => IncidentEmployee | null;

    renderBasicDashboardKpis?: () => void;
    loadRecentActivityFallback?: () => Promise<void>;
  }
}

let currentIncidentId: string | null = null;

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

function getCurrentEmployee(): IncidentEmployee | null {
  if (typeof window.getCurrentEmployeeForOrbis === 'function') {
    return window.getCurrentEmployeeForOrbis();
  }

  return window.currentEmployee || null;
}

function getEmployeeId(employee: IncidentEmployee | null): string {
  return String(employee?.dbId || employee?.employee_id || employee?.id || employee?.displayId || '');
}

function getEmployeeLookupIds(employee: IncidentEmployee | null, fallbackId?: string): string[] {
  return [
    employee?.dbId,
    employee?.employee_id,
    employee?.id,
    employee?.displayId,
    fallbackId,
  ]
    .filter(Boolean)
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function setInputValue(id: string, value: unknown): void {
  const input = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  if (!input) return;

  input.value = String(value ?? '');
}

async function refreshIncidentDependentUi(employeeId: string): Promise<void> {
  await loadEmployeeIncidents(employeeId);

  if (typeof window.loadRecentActivityFallback === 'function') {
    await window.loadRecentActivityFallback();
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export async function loadEmployeeIncidents(employeeId: string): Promise<void> {
  const target = safeGet('incidentsHistory');

  if (!target) {
    console.warn('[Incidents] incidentsHistory container not found.');
    return;
  }

  target.innerHTML = '<div class="empty">Loading incidents...</div>';

  try {
    const activeEmployee = getCurrentEmployee();
    const primaryEmployeeId = String(employeeId || getEmployeeId(activeEmployee) || '').trim();
    const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

    if (!primaryEmployeeId && !employeeIds.length) {
      target.innerHTML = '<div class="empty">Open an employee to view incidents.</div>';
      return;
    }

    const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];

    const { data, error } = await supabaseClient
      .from('incident_reports')
      .select('*')
      .in('employee_id', idsToSearch);

    if (error) {
      console.error('[Incidents] Could not load incident records:', error);
      target.innerHTML = '<div class="empty">Could not load incident records.</div>';
      return;
    }

    const rows = ((data || []) as IncidentRecord[]).sort((a, b) => {
      const dateA = String(a.incident_date || a.created_at || '');
      const dateB = String(b.incident_date || b.created_at || '');
      return dateB.localeCompare(dateA);
    });

    console.log('[Incidents] Incident rows returned:', rows.length, rows);

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No incident records found for this employee.</div>';
      return;
    }

    target.innerHTML = rows
      .map(
        (row) => `
          <div class="history-item" data-incident-id="${escapeHtml(row.id || '')}">
            <div class="history-top">
              <div>
                <strong>${escapeHtml(row.incident_type || 'Incident Report')}</strong>
                <span>${escapeHtml(row.incident_date || row.created_at || '')}</span>
              </div>

              <div style="display:flex; gap:6px; align-items:center;">
                <button class="button soft sm" type="button" data-edit-incident-id="${escapeHtml(row.id || '')}">Edit</button>
                <button class="button danger sm" type="button" data-delete-incident-id="${escapeHtml(row.id || '')}">Delete</button>
              </div>
            </div>

            <div class="history-body">
              <strong>Location:</strong>
              ${escapeHtml(row.location || '')}

              <br><br>

              <strong>Status:</strong>
              ${escapeHtml(row.status || '')}

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

    target.querySelectorAll<HTMLButtonElement>('[data-edit-incident-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const incidentId = button.dataset.editIncidentId;
        const record = rows.find((row) => String(row.id) === String(incidentId));
        if (!record) return;
        editIncidentRecord(record);
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-delete-incident-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const incidentId = button.dataset.deleteIncidentId;
        if (!incidentId) return;
        await deleteIncidentRecord(incidentId, primaryEmployeeId || idsToSearch[0]);
      });
    });
  } catch (err) {
    console.error('[Incidents] Unexpected incident history failure:', err);
    target.innerHTML = '<div class="empty">Could not load incident records.</div>';
  }
}

export function editIncidentRecord(record: IncidentRecord): void {
  if (!record) return;

  currentIncidentId = record.id || null;
  window.currentIncidentId = currentIncidentId;

  setInputValue('incidentDate', record.incident_date || todayInputValue());
  setInputValue('incidentType', record.incident_type || '');
  setInputValue('incidentLocation', record.location || '');
  setInputValue('incidentDescription', record.description || '');
  setInputValue('incidentCorrectiveAction', record.follow_up || '');
  setInputValue('incidentStatus', record.status || '');

  const refused = safeGet<HTMLInputElement>('incidentRefusedToSign');
  if (refused) {
    refused.checked = record.refused_to_sign === true;
  }

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

  const saveButton = safeGet('saveIncidentBtn');
  if (saveButton) saveButton.textContent = 'Update Incident Record';

  const editStatus = safeGet('incidentEditStatus');
  if (editStatus) {
    editStatus.textContent = 'Editing saved incident record';
    editStatus.classList.remove('hidden');
  }

  safeGet('cancelIncidentEditBtn')?.classList.remove('hidden');

  showToast('Incident record loaded for editing.');
}

export async function deleteIncidentRecord(incidentId: string, employeeId: string): Promise<void> {
  if (!incidentId) return;
  if (
    !(await showOrbisConfirm('Delete this incident record?', {
      title: 'Delete incident',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const { error } = await supabaseClient
    .from('incident_reports')
    .delete()
    .eq('id', incidentId);

  if (error) {
    console.error('Incident delete failed:', error);
    showToast(error.message || 'Could not delete incident record.', 'error');
    return;
  }

  showToast('Incident record deleted.');

  if (String(currentIncidentId || '') === String(incidentId)) {
    currentIncidentId = null;
    window.currentIncidentId = null;

    const saveButton = safeGet('saveIncidentBtn');
    if (saveButton) saveButton.textContent = 'Save Incident Record';
  }

  await refreshIncidentDependentUi(employeeId);
}

export async function saveIncidentRecord(): Promise<void> {
  stopAllDictation();
  const activeEmployee = getCurrentEmployee();
  const employeeId = getEmployeeId(activeEmployee);

  if (!employeeId) {
    showToast('Open an employee before saving an incident record.', 'error');
    return;
  }

  const incidentPayload: IncidentRecord = {
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

  if (!incidentPayload.incident_type && !incidentPayload.description) {
    showToast('Enter an incident type or description before saving.', 'error');
    return;
  }

  const incidentId = currentIncidentId || window.currentIncidentId;

  const saveIncidentPayload = async (payloadToSave: IncidentRecord) => {
    if (incidentId) {
      return supabaseClient
        .from('incident_reports')
        .update(payloadToSave)
        .eq('id', incidentId)
        .select();
    }

    return supabaseClient
      .from('incident_reports')
      .insert([payloadToSave])
      .select();
  };

  const cleanPayload: IncidentRecord = { ...incidentPayload };
  let result = await saveIncidentPayload(cleanPayload);

  while (result.error) {
    const message = String(result.error.message || '');

    if (result.error.code !== 'PGRST204' || !/'([^']+)' column/.test(message)) {
      break;
    }

    const missingColumn = message.match(/'([^']+)' column/)?.[1];

    if (!missingColumn || !(missingColumn in cleanPayload)) {
      break;
    }

    console.warn(`Incident column missing in Supabase, retrying without: ${missingColumn}`);
    delete cleanPayload[missingColumn];
    result = await saveIncidentPayload(cleanPayload);
  }

  if (result.error) {
    console.error('Incident save failed:', result.error);
    showToast(result.error.message || 'Could not save incident record.', 'error');
    return;
  }

  const savedIncident = Array.isArray(result.data) ? (result.data[0] as IncidentRecord | undefined) : undefined;
  const reloadEmployeeId = String(savedIncident?.employee_id || employeeId);

  showToast(incidentId ? 'Incident record updated.' : 'Incident record saved.');

  currentIncidentId = null;
  window.currentIncidentId = null;

  const saveButton = safeGet('saveIncidentBtn');
  if (saveButton) saveButton.textContent = 'Save Incident Record';

  safeGet('cancelIncidentEditBtn')?.classList.add('hidden');
  safeGet('incidentEditStatus')?.classList.add('hidden');

  setInputValue('incidentDate', todayInputValue());
  setInputValue('incidentType', '');
  setInputValue('incidentLocation', '');
  setInputValue('incidentStatus', '');
  setInputValue('incidentDescription', '');
  setInputValue('incidentCorrectiveAction', '');
  setInputValue('incidentFollowUp', '');

  const refused = safeGet<HTMLInputElement>('incidentRefusedToSign');
  if (refused) {
    refused.checked = false;
  }

  clearCanvasSignature('incidentEmployeeSignature', 'incidentEmployeeSigStatus');
  clearCanvasSignature('incidentManagerSignature', 'incidentManagerSigStatus');
  clearCanvasSignature('incidentWitnessSignature', 'incidentWitnessSigStatus');

  await refreshIncidentDependentUi(reloadEmployeeId);
}

window.saveIncidentRecord = saveIncidentRecord;
window.saveIncidentReport = saveIncidentRecord;
window.loadEmployeeIncidents = loadEmployeeIncidents;
window.loadIncidentReports = loadEmployeeIncidents;
window.loadEmployeeIncidentReports = loadEmployeeIncidents;
window.editIncidentRecord = editIncidentRecord;
window.deleteIncidentRecord = deleteIncidentRecord;