import type { AttentionSeverity, AttentionStatus } from './types';

/** Map legacy inbox-style day offsets to unified attention severity. */
export function severityFromDaysUntilDue(
  daysUntil: number | null,
  options?: { hasOpenRisk?: boolean }
): AttentionSeverity {
  if (daysUntil === null) {
    return options?.hasOpenRisk ? 'normal' : 'informational';
  }
  if (daysUntil < -7) return 'critical';
  if (daysUntil < 0) return 'high';
  if (daysUntil === 0) return 'high';
  if (daysUntil <= 7) return 'upcoming';
  return 'informational';
}

export function statusFromDueDate(
  dueDate: string | null | undefined,
  daysUntil: number | null
): AttentionStatus {
  if (daysUntil !== null && daysUntil < 0) return 'overdue';
  if (dueDate) return 'open';
  return 'new';
}

export function mapLegacyInboxSeverity(
  severity: 'overdue' | 'due_soon' | 'info'
): AttentionSeverity {
  if (severity === 'overdue') return 'high';
  if (severity === 'due_soon') return 'upcoming';
  return 'informational';
}
