/**
 * In-memory Care & Engagement store (session persistence until Supabase is wired).
 */
import { CARE_ENGAGEMENT_MOCK } from './careEngagementMock';
import type {
  CareEngagementDataset,
  CareMatrixCellEntry,
  CareRecognitionEntry,
  CareTrackerItem,
  EmployeeCareFollowUp,
  EmployeeCareNote,
  EmployeeCareResource,
  EmployeeWellnessCheckIn,
} from '../types/careEngagementTypes';

let liveDataset: CareEngagementDataset | null = null;

function ensureLiveDataset(): CareEngagementDataset {
  if (!liveDataset) {
    liveDataset = structuredClone(CARE_ENGAGEMENT_MOCK);
  }
  return liveDataset;
}

export function getCareEngagementDataset(): CareEngagementDataset {
  return ensureLiveDataset();
}

export function resetCareEngagementDataset(): void {
  liveDataset = structuredClone(CARE_ENGAGEMENT_MOCK);
}

/**
 * Future: replace with supabaseClient.from('care_matrix_cells') etc.
 */
export async function fetchCareEngagementDataset(): Promise<CareEngagementDataset> {
  // TODO: Supabase — care_matrix_cells, care_items, care_recognition, care_pulse_snapshots
  return getCareEngagementDataset();
}

export function newCareId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function upsertMatrixCell(cell: CareMatrixCellEntry): void {
  const dataset = ensureLiveDataset();
  const index = dataset.matrixCells.findIndex((entry) => entry.id === cell.id);
  if (index >= 0) {
    dataset.matrixCells[index] = cell;
    return;
  }
  dataset.matrixCells.push(cell);
}

export function clearMatrixCell(cellId: string): void {
  const dataset = ensureLiveDataset();
  const cell = dataset.matrixCells.find((entry) => entry.id === cellId);
  if (!cell) return;
  cell.initiatives = '';
  cell.gaps = '';
  cell.proposedActions = '';
  cell.owner = '';
  cell.dueDate = '';
  cell.status = 'proposed';
}

export function upsertCareItem(item: CareTrackerItem): void {
  const dataset = ensureLiveDataset();
  const index = dataset.careItems.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    dataset.careItems[index] = item;
    return;
  }
  dataset.careItems.unshift(item);
}

export function deleteCareItem(itemId: string): void {
  const dataset = ensureLiveDataset();
  dataset.careItems = dataset.careItems.filter((entry) => entry.id !== itemId);
}

export function upsertRecognition(entry: CareRecognitionEntry): void {
  const dataset = ensureLiveDataset();
  const index = dataset.recognition.findIndex((row) => row.id === entry.id);
  if (index >= 0) {
    dataset.recognition[index] = entry;
    return;
  }
  dataset.recognition.unshift(entry);
}

export function deleteRecognition(entryId: string): void {
  const dataset = ensureLiveDataset();
  dataset.recognition = dataset.recognition.filter((entry) => entry.id !== entryId);
}

export function upsertEmployeeCareNote(note: EmployeeCareNote): void {
  const dataset = ensureLiveDataset();
  const index = dataset.employeeNotes.findIndex((entry) => entry.id === note.id);
  if (index >= 0) {
    dataset.employeeNotes[index] = note;
    return;
  }
  dataset.employeeNotes.unshift(note);
}

export function deleteEmployeeCareNote(noteId: string): void {
  const dataset = ensureLiveDataset();
  dataset.employeeNotes = dataset.employeeNotes.filter((entry) => entry.id !== noteId);
}

export function upsertEmployeeFollowUp(item: EmployeeCareFollowUp): void {
  const dataset = ensureLiveDataset();
  const index = dataset.followUps.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    dataset.followUps[index] = item;
    return;
  }
  dataset.followUps.unshift(item);
}

export function deleteEmployeeFollowUp(itemId: string): void {
  const dataset = ensureLiveDataset();
  dataset.followUps = dataset.followUps.filter((entry) => entry.id !== itemId);
}

export function upsertEmployeeResource(item: EmployeeCareResource): void {
  const dataset = ensureLiveDataset();
  const index = dataset.resources.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    dataset.resources[index] = item;
    return;
  }
  dataset.resources.unshift(item);
}

export function deleteEmployeeResource(itemId: string): void {
  const dataset = ensureLiveDataset();
  dataset.resources = dataset.resources.filter((entry) => entry.id !== itemId);
}

export function upsertWellnessCheckIn(item: EmployeeWellnessCheckIn): void {
  const dataset = ensureLiveDataset();
  const index = dataset.wellnessCheckIns.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    dataset.wellnessCheckIns[index] = item;
    return;
  }
  dataset.wellnessCheckIns.unshift(item);
}

export function deleteWellnessCheckIn(itemId: string): void {
  const dataset = ensureLiveDataset();
  dataset.wellnessCheckIns = dataset.wellnessCheckIns.filter((entry) => entry.id !== itemId);
}
