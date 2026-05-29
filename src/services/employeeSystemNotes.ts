/** Internal employee_notes rows used for flag state — not shown as HR notes in feeds. */

export const SYSTEM_EMPLOYEE_NOTE_TYPES = [
  'At-Risk Flag',
  'At-Risk Cleared',
  'Impact Player Flag',
  'Impact Player Cleared',
] as const;

export type SystemEmployeeNoteType = (typeof SYSTEM_EMPLOYEE_NOTE_TYPES)[number];

export function isSystemEmployeeNoteType(noteType: unknown): boolean {
  const normalized = String(noteType || '').trim();

  return SYSTEM_EMPLOYEE_NOTE_TYPES.includes(normalized as SystemEmployeeNoteType);
}

export function isRecentHrActivityNote(row: {
  note_type?: unknown;
}): boolean {
  return !isSystemEmployeeNoteType(row.note_type);
}
