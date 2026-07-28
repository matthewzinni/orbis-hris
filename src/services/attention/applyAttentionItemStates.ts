import type { AttentionItem, AttentionUserOverlayStatus } from './types';
import { buildAttentionSourceFingerprint } from './fingerprint';
import { todayIsoDate } from './utils';

export type AttentionItemStateRow = {
  dedupe_key: string;
  status: AttentionUserOverlayStatus;
  snoozed_until: string | null;
  source_fingerprint: string | null;
};

export function applyAttentionItemStates(
  items: AttentionItem[],
  states: AttentionItemStateRow[],
  today = todayIsoDate()
): AttentionItem[] {
  if (!states.length) return items;

  const stateByKey = new Map(states.map((state) => [state.dedupe_key, state]));

  const visible = items.filter((item) => {
    const state = stateByKey.get(item.dedupeKey);
    if (!state) return true;

    const fingerprint = buildAttentionSourceFingerprint(item);

    if (state.status === 'dismissed') {
      const storedFingerprint = String(state.source_fingerprint || '').trim();
      if (!storedFingerprint || storedFingerprint === item.dedupeKey) {
        return false;
      }
      if (storedFingerprint !== fingerprint) {
        return true;
      }
      return false;
    }

    if (state.status === 'snoozed') {
      const until = String(state.snoozed_until || '').slice(0, 10);
      if (until && until > today) {
        return false;
      }
    }

    return true;
  });

  return visible.map((item) => {
    const state = stateByKey.get(item.dedupeKey);
    if (state?.status === 'in_progress') {
      return { ...item, status: 'in_progress' };
    }
    return item;
  });
}
