import { parseDueDate } from '../employeeUtils';
import type { AttentionItem, AttentionSeverity } from './types';

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  upcoming: 3,
  informational: 4,
};

const STATUS_RANK: Record<string, number> = {
  overdue: 0,
  open: 1,
  new: 2,
  in_progress: 3,
  resolved: 4,
  dismissed: 5,
};

export function compareAttentionItems(left: AttentionItem, right: AttentionItem): number {
  const severityDiff = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
  if (severityDiff !== 0) return severityDiff;

  const statusDiff =
    (STATUS_RANK[left.status] ?? 99) - (STATUS_RANK[right.status] ?? 99);
  if (statusDiff !== 0) return statusDiff;

  const leftDue = parseDueDate(left.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDue = parseDueDate(right.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;

  const nameCmp = String(left.employeeName || '')
    .localeCompare(String(right.employeeName || ''), undefined, { sensitivity: 'base' });
  if (nameCmp !== 0) return nameCmp;

  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
}

export function sortAttentionItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort(compareAttentionItems);
}
