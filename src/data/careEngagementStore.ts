/**
 * Care & Engagement data layer (Supabase with in-memory fallback if tables missing).
 */
import { filterCareEngagementDatasetForViewer } from '../services/careConfidentiality';
import {
  enrichCareEngagementDataset,
  ensureCareEmployeeRosterLoaded,
} from '../services/careEmployeePicker';
import { pickDisplayPulseSnapshot } from '../services/carePulseUtils';
import { supabaseClient } from '../services/supabaseClient';
import { CARE_ENGAGEMENT_MOCK } from './careEngagementMock';
import type {
  CareCellStatus,
  CareConfidentiality,
  CareEngagementDataset,
  CareItemStatus,
  CareItemType,
  CareMatrixCellEntry,
  CareMatrixColumnKey,
  CareMatrixRowKey,
  CarePulseSurveySnapshot,
  CareRecognitionEntry,
  CareTrackerItem,
  EmployeeCareFollowUp,
  EmployeeCareNote,
  EmployeeCareResource,
  EmployeeWellnessCheckIn,
  RecognitionType,
} from '../types/careEngagementTypes';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedDataset: CareEngagementDataset | null = null;

function isUuid(id: string | null | undefined): boolean {
  return Boolean(id && UUID_RE.test(id));
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function mapMatrixRow(row: Record<string, unknown>): CareMatrixCellEntry {
  return {
    id: String(row.id),
    row: String(row.matrix_row) as CareMatrixRowKey,
    column: String(row.matrix_column) as CareMatrixColumnKey,
    initiatives: String(row.initiatives || ''),
    gaps: String(row.gaps || ''),
    proposedActions: String(row.proposed_actions || ''),
    owner: String(row.owner || ''),
    dueDate: row.due_date ? String(row.due_date) : '',
    status: String(row.status || 'proposed') as CareCellStatus,
  };
}

function mapCareItem(row: Record<string, unknown>): CareTrackerItem {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    employeeName: String(row.employee_name || ''),
    department: String(row.department || ''),
    type: String(row.care_type || 'emotional') as CareItemType,
    needOrConcern: String(row.need_or_concern || ''),
    actionTaken: String(row.action_taken || ''),
    owner: String(row.owner || ''),
    followUpDate: row.follow_up_date ? String(row.follow_up_date) : '',
    status: String(row.status || 'open') as CareItemStatus,
    confidentiality: String(row.confidentiality || 'hr_only') as CareConfidentiality,
  };
}

function mapRecognition(row: Record<string, unknown>): CareRecognitionEntry {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    employeeName: String(row.employee_name || ''),
    department: String(row.department || ''),
    type: String(row.recognition_type || 'kudos') as RecognitionType,
    summary: String(row.summary || ''),
    recognizedOn: row.recognized_on ? String(row.recognized_on) : '',
    recognizedBy: String(row.recognized_by || ''),
  };
}

function mapNote(row: Record<string, unknown>): EmployeeCareNote {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    date: row.note_date ? String(row.note_date) : '',
    author: String(row.author || ''),
    summary: String(row.summary || ''),
    confidentiality: String(row.confidentiality || 'hr_only') as CareConfidentiality,
  };
}

function mapFollowUp(row: Record<string, unknown>): EmployeeCareFollowUp {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    title: String(row.title || ''),
    dueDate: row.due_date ? String(row.due_date) : '',
    owner: String(row.owner || ''),
    status: String(row.status || 'open') as CareItemStatus,
  };
}

function mapResource(row: Record<string, unknown>): EmployeeCareResource {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    resourceName: String(row.resource_name || ''),
    sharedOn: row.shared_on ? String(row.shared_on) : '',
    sharedBy: String(row.shared_by || ''),
  };
}

function mapWellness(row: Record<string, unknown>): EmployeeWellnessCheckIn {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    checkInDate: row.check_in_date ? String(row.check_in_date) : '',
    type: String(row.check_in_type || ''),
    notes: String(row.notes || ''),
    owner: String(row.owner || ''),
  };
}

function mapPulse(row: Record<string, unknown>): CarePulseSurveySnapshot {
  return {
    id: String(row.id || ''),
    overallSupport: Number(row.overall_support ?? 0),
    workloadStress: Number(row.workload_stress ?? 0),
    communication: Number(row.communication_score ?? 0),
    recognition: Number(row.recognition_score ?? 0),
    belonging: Number(row.belonging_score ?? 0),
    commentsSummary: String(row.comments_summary || ''),
    periodLabel: String(row.period_label || ''),
    responseCount: Number(row.response_count ?? 0),
    createdAt: row.created_at ? String(row.created_at) : '',
  };
}

function resolvePulseData(rows: Record<string, unknown>[]): {
  pulse: CarePulseSurveySnapshot;
  pulseSnapshots: CarePulseSurveySnapshot[];
} {
  const pulseSnapshots = rows.map((row) => mapPulse(row));
  const pulse =
    pickDisplayPulseSnapshot(pulseSnapshots) ||
    pulseSnapshots[0] ||
    structuredClone(CARE_ENGAGEMENT_MOCK.pulse);

  return { pulse, pulseSnapshots };
}

async function loadFromSupabase(): Promise<CareEngagementDataset> {
  const [
    matrixRes,
    itemsRes,
    recognitionRes,
    notesRes,
    followUpsRes,
    resourcesRes,
    wellnessRes,
    pulseRes,
  ] = await Promise.all([
    supabaseClient.from('care_matrix_cells').select('*').order('matrix_row'),
    supabaseClient.from('care_items').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('care_recognition').select('*').order('recognized_on', { ascending: false }),
    supabaseClient.from('care_employee_notes').select('*').order('note_date', { ascending: false }),
    supabaseClient.from('care_follow_ups').select('*').order('due_date', { ascending: true }),
    supabaseClient.from('care_resources_shared').select('*').order('shared_on', { ascending: false }),
    supabaseClient.from('care_wellness_check_ins').select('*').order('check_in_date', { ascending: false }),
    supabaseClient.from('care_pulse_snapshots').select('*').order('created_at', { ascending: false }),
  ]);

  const firstError =
    matrixRes.error ||
    itemsRes.error ||
    recognitionRes.error ||
    notesRes.error ||
    followUpsRes.error ||
    resourcesRes.error ||
    wellnessRes.error ||
    pulseRes.error;

  if (isMissingTableError(firstError)) {
    console.warn(
      '[CareEngagement] Supabase tables not found — using demo data. Run migration 20250524120000_care_engagement.sql'
    );
    return structuredClone(CARE_ENGAGEMENT_MOCK);
  }

  if (firstError) {
    throw firstError;
  }

  return {
    matrixCells: (matrixRes.data || []).map((row) => mapMatrixRow(row as Record<string, unknown>)),
    careItems: (itemsRes.data || []).map((row) => mapCareItem(row as Record<string, unknown>)),
    recognition: (recognitionRes.data || []).map((row) =>
      mapRecognition(row as Record<string, unknown>)
    ),
    employeeNotes: (notesRes.data || []).map((row) => mapNote(row as Record<string, unknown>)),
    followUps: (followUpsRes.data || []).map((row) => mapFollowUp(row as Record<string, unknown>)),
    resources: (resourcesRes.data || []).map((row) => mapResource(row as Record<string, unknown>)),
    wellnessCheckIns: (wellnessRes.data || []).map((row) =>
      mapWellness(row as Record<string, unknown>)
    ),
    ...resolvePulseData((pulseRes.data || []) as Record<string, unknown>[]),
  };
}

export function invalidateCareEngagementCache(): void {
  cachedDataset = null;
}

export function getCareEngagementDataset(): CareEngagementDataset {
  if (!cachedDataset) {
    return structuredClone(CARE_ENGAGEMENT_MOCK);
  }
  return cachedDataset;
}

export async function fetchCareEngagementDataset(force = false): Promise<CareEngagementDataset> {
  if (cachedDataset && !force) {
    return cachedDataset;
  }

  await ensureCareEmployeeRosterLoaded();
  const loaded = await loadFromSupabase();
  cachedDataset = filterCareEngagementDatasetForViewer(enrichCareEngagementDataset(loaded));
  return cachedDataset;
}

export function newCareId(_prefix: string): string {
  return crypto.randomUUID();
}

export async function upsertMatrixCell(cell: CareMatrixCellEntry): Promise<void> {
  const payload = {
    ...(isUuid(cell.id) ? { id: cell.id } : {}),
    matrix_row: cell.row,
    matrix_column: cell.column,
    initiatives: cell.initiatives,
    gaps: cell.gaps,
    proposed_actions: cell.proposedActions,
    owner: cell.owner,
    due_date: cell.dueDate || null,
    status: cell.status,
  };

  const { error } = await supabaseClient
    .from('care_matrix_cells')
    .upsert(payload, { onConflict: 'matrix_row,matrix_column' });

  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function clearMatrixCell(
  cellId: string,
  row?: CareMatrixRowKey,
  column?: CareMatrixColumnKey
): Promise<void> {
  const empty = {
    initiatives: '',
    gaps: '',
    proposed_actions: '',
    owner: '',
    due_date: null,
    status: 'proposed',
  };

  if (isUuid(cellId)) {
    const { error } = await supabaseClient.from('care_matrix_cells').update(empty).eq('id', cellId);
    if (error) throw error;
  } else if (row && column) {
    const { error } = await supabaseClient
      .from('care_matrix_cells')
      .update(empty)
      .eq('matrix_row', row)
      .eq('matrix_column', column);
    if (error) throw error;
  }

  invalidateCareEngagementCache();
}

export async function upsertCareItem(item: CareTrackerItem): Promise<void> {
  const payload = {
    ...(isUuid(item.id) ? { id: item.id } : {}),
    employee_id: item.employeeId,
    employee_name: item.employeeName,
    department: item.department,
    care_type: item.type,
    need_or_concern: item.needOrConcern,
    action_taken: item.actionTaken,
    owner: item.owner,
    follow_up_date: item.followUpDate || null,
    status: item.status,
    confidentiality: item.confidentiality,
  };

  const { error } = await supabaseClient.from('care_items').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deleteCareItem(itemId: string): Promise<void> {
  if (!isUuid(itemId)) return;
  const { error } = await supabaseClient.from('care_items').delete().eq('id', itemId);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function upsertRecognition(entry: CareRecognitionEntry): Promise<void> {
  const payload = {
    ...(isUuid(entry.id) ? { id: entry.id } : {}),
    employee_id: entry.employeeId,
    employee_name: entry.employeeName,
    department: entry.department,
    recognition_type: entry.type,
    summary: entry.summary,
    recognized_on: entry.recognizedOn || null,
    recognized_by: entry.recognizedBy,
  };

  const { error } = await supabaseClient.from('care_recognition').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deleteRecognition(entryId: string): Promise<void> {
  if (!isUuid(entryId)) return;
  const { error } = await supabaseClient.from('care_recognition').delete().eq('id', entryId);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function upsertEmployeeCareNote(note: EmployeeCareNote): Promise<void> {
  const payload = {
    ...(isUuid(note.id) ? { id: note.id } : {}),
    employee_id: note.employeeId,
    note_date: note.date || null,
    author: note.author,
    summary: note.summary,
    confidentiality: note.confidentiality,
  };

  const { error } = await supabaseClient.from('care_employee_notes').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deleteEmployeeCareNote(noteId: string): Promise<void> {
  if (!isUuid(noteId)) return;
  const { error } = await supabaseClient.from('care_employee_notes').delete().eq('id', noteId);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function upsertEmployeeFollowUp(item: EmployeeCareFollowUp): Promise<void> {
  const payload = {
    ...(isUuid(item.id) ? { id: item.id } : {}),
    employee_id: item.employeeId,
    title: item.title,
    due_date: item.dueDate || null,
    owner: item.owner,
    status: item.status,
  };

  const { error } = await supabaseClient.from('care_follow_ups').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deleteEmployeeFollowUp(itemId: string): Promise<void> {
  if (!isUuid(itemId)) return;
  const { error } = await supabaseClient.from('care_follow_ups').delete().eq('id', itemId);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function upsertEmployeeResource(item: EmployeeCareResource): Promise<void> {
  const payload = {
    ...(isUuid(item.id) ? { id: item.id } : {}),
    employee_id: item.employeeId,
    resource_name: item.resourceName,
    shared_on: item.sharedOn || null,
    shared_by: item.sharedBy,
  };

  const { error } = await supabaseClient.from('care_resources_shared').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deleteEmployeeResource(itemId: string): Promise<void> {
  if (!isUuid(itemId)) return;
  const { error } = await supabaseClient.from('care_resources_shared').delete().eq('id', itemId);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function upsertWellnessCheckIn(item: EmployeeWellnessCheckIn): Promise<void> {
  const payload = {
    ...(isUuid(item.id) ? { id: item.id } : {}),
    employee_id: item.employeeId,
    check_in_date: item.checkInDate || null,
    check_in_type: item.type,
    notes: item.notes,
    owner: item.owner,
  };

  const { error } = await supabaseClient.from('care_wellness_check_ins').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deleteWellnessCheckIn(itemId: string): Promise<void> {
  if (!isUuid(itemId)) return;
  const { error } = await supabaseClient.from('care_wellness_check_ins').delete().eq('id', itemId);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function upsertPulseSnapshot(snapshot: CarePulseSurveySnapshot): Promise<void> {
  const payload = {
    ...(isUuid(snapshot.id) ? { id: snapshot.id } : {}),
    period_label: snapshot.periodLabel.trim(),
    response_count: Math.max(0, Math.round(Number(snapshot.responseCount) || 0)),
    overall_support: Number(snapshot.overallSupport) || 0,
    workload_stress: Number(snapshot.workloadStress) || 0,
    communication_score: Number(snapshot.communication) || 0,
    recognition_score: Number(snapshot.recognition) || 0,
    belonging_score: Number(snapshot.belonging) || 0,
    comments_summary: snapshot.commentsSummary.trim(),
  };

  const { error } = await supabaseClient.from('care_pulse_snapshots').upsert(payload);
  if (error) throw error;
  invalidateCareEngagementCache();
}

export async function deletePulseSnapshot(snapshotId: string): Promise<void> {
  if (!isUuid(snapshotId)) return;
  const { error } = await supabaseClient.from('care_pulse_snapshots').delete().eq('id', snapshotId);
  if (error) throw error;
  invalidateCareEngagementCache();
}
