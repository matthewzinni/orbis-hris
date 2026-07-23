import type { AttentionItem } from './types';

/** Stable fingerprint so dismissed items resurface when source data changes. */
export function buildAttentionSourceFingerprint(
  item: Pick<
    AttentionItem,
    'category' | 'sourceType' | 'sourceId' | 'dueDate' | 'title' | 'status' | 'severity'
  >
): string {
  return [
    item.category,
    item.sourceType,
    item.sourceId,
    item.dueDate || '',
    item.title,
    item.status,
    item.severity,
  ].join('|');
}
