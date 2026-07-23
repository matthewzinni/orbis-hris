import { isAdminUser, isSupervisorUser } from '../access';
import { parseDueDate } from '../employeeUtils';
import { dedupeAttentionItems } from './dedupe';
import { ATTENTION_RULES } from './rules';
import { sortAttentionItems } from './sort';
import type { AttentionFilter, AttentionItem, AttentionWorkspace } from './types';
import { evaluationTimestamp, todayIsoDate } from './utils';

export async function buildAttentionWorkspace(): Promise<AttentionWorkspace> {
  const evaluatedAt = evaluationTimestamp();

  if (!isAdminUser() && !isSupervisorUser()) {
    return { items: [], evaluatedAt };
  }

  try {
    const batches = await Promise.all(ATTENTION_RULES.map((rule) => rule.collect()));
    const items = sortAttentionItems(dedupeAttentionItems(batches.flat()));
    return { items, evaluatedAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not build attention workspace.';
    console.error('[Attention] Workspace build failed:', err);
    return { items: [], evaluatedAt, error: message };
  }
}

export function filterAttentionItems(
  items: AttentionItem[],
  filter: AttentionFilter = {}
): AttentionItem[] {
  const search = String(filter.search || '')
    .trim()
    .toLowerCase();

  let filtered = items.filter((item) => {
    if (filter.category && filter.category !== 'all' && item.category !== filter.category) {
      return false;
    }
    if (filter.severity && filter.severity !== 'all' && item.severity !== filter.severity) {
      return false;
    }
    if (filter.status && filter.status !== 'all' && item.status !== filter.status) {
      return false;
    }
    if (!search) return true;

    const haystack = [
      item.title,
      item.explanation,
      item.employeeName,
      item.recommendedAction,
      item.category,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });

  const sortMode = filter.sort || 'urgency';
  filtered = [...filtered].sort((left, right) => {
    if (sortMode === 'employee') {
      return String(left.employeeName || '').localeCompare(String(right.employeeName || ''));
    }
    if (sortMode === 'category') {
      return left.category.localeCompare(right.category);
    }
    if (sortMode === 'dueDate') {
      const leftDue = parseDueDate(left.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightDue = parseDueDate(right.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      return leftDue - rightDue;
    }
    return 0;
  });

  if (sortMode === 'urgency') {
    filtered = sortAttentionItems(filtered);
  }

  return filtered;
}

export function isAttentionItemDueToday(item: AttentionItem, today = todayIsoDate()): boolean {
  const due = String(item.dueDate || '').slice(0, 10);
  return Boolean(due) && due === today;
}

export function isAttentionItemDueSoon(item: AttentionItem, withinDays = 7): boolean {
  const due = parseDueDate(item.dueDate);
  if (!due) return false;
  const today = parseDueDate(todayIsoDate());
  if (!today) return false;
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= withinDays;
}

export function isAttentionItemHighPriority(item: AttentionItem): boolean {
  return item.severity === 'critical' || item.severity === 'high' || item.status === 'overdue';
}
