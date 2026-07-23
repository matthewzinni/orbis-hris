import type { AttentionCategory, AttentionItem } from './types';

export function buildAttentionDedupeKey(
  category: AttentionCategory,
  sourceType: string,
  sourceId: string,
  suffix = ''
): string {
  const base = `${category}:${sourceType}:${String(sourceId || '').trim()}`;
  return suffix ? `${base}:${suffix}` : base;
}

/** Collapse duplicate attention items — last writer wins for stable ordering. */
export function dedupeAttentionItems(items: AttentionItem[]): AttentionItem[] {
  const map = new Map<string, AttentionItem>();

  items.forEach((item) => {
    const key = String(item.dedupeKey || item.id || '').trim();
    if (!key) return;
    map.set(key, item);
  });

  return Array.from(map.values());
}
