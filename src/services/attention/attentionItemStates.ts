import { getCurrentAuthEmail } from '../accessScopes';
import { supabaseClient } from '../supabaseClient';
import {
  applyAttentionItemStates,
  type AttentionItemStateRow,
} from './applyAttentionItemStates';
import { invalidateAttentionWorkspaceCache } from './buildAttentionWorkspace';
import { buildAttentionSourceFingerprint } from './fingerprint';
import type { AttentionItem, AttentionUserOverlayStatus } from './types';
import { todayIsoDate } from './utils';

type UpsertAttentionStateInput = {
  dedupeKey: string;
  status: AttentionUserOverlayStatus;
  snoozedUntil?: string | null;
  sourceFingerprint?: string | null;
};

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function rowFromRecord(record: Record<string, unknown>): AttentionItemStateRow | null {
  const dedupeKey = String(record.dedupe_key || '').trim();
  if (!dedupeKey) return null;

  const status = String(record.status || '').trim() as AttentionUserOverlayStatus;
  if (status !== 'dismissed' && status !== 'in_progress' && status !== 'snoozed') {
    return null;
  }

  return {
    dedupe_key: dedupeKey,
    status,
    snoozed_until: record.snoozed_until ? String(record.snoozed_until) : null,
    source_fingerprint: record.source_fingerprint ? String(record.source_fingerprint) : null,
  };
}

export async function loadAttentionItemStates(): Promise<AttentionItemStateRow[]> {
  const email = getCurrentAuthEmail();
  if (!email) return [];

  const { data, error } = await supabaseClient
    .from('attention_item_states')
    .select('dedupe_key, status, snoozed_until, source_fingerprint')
    .eq('user_email', normalizeEmail(email));

  if (error) {
    console.warn('[Attention] Could not load item states:', error.message || error);
    return [];
  }

  return (data || [])
    .map((row) => rowFromRecord(row as Record<string, unknown>))
    .filter((row): row is AttentionItemStateRow => Boolean(row));
}

export async function upsertAttentionItemState(input: UpsertAttentionStateInput): Promise<void> {
  const email = getCurrentAuthEmail();
  const dedupeKey = String(input.dedupeKey || '').trim();
  if (!email || !dedupeKey) return;

  const payload = {
    user_email: normalizeEmail(email),
    dedupe_key: dedupeKey,
    status: input.status,
    snoozed_until: input.snoozedUntil || null,
    source_fingerprint: input.sourceFingerprint || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from('attention_item_states')
    .upsert(payload, { onConflict: 'user_email,dedupe_key' });

  if (error) {
    console.warn('[Attention] Could not save item state:', error.message || error);
    throw error;
  }
}

export async function clearAttentionItemState(dedupeKey: string): Promise<void> {
  const email = getCurrentAuthEmail();
  const key = String(dedupeKey || '').trim();
  if (!email || !key) return;

  const { error } = await supabaseClient
    .from('attention_item_states')
    .delete()
    .eq('user_email', normalizeEmail(email))
    .eq('dedupe_key', key);

  if (error) {
    console.warn('[Attention] Could not clear item state:', error.message || error);
    throw error;
  }
}

function stateInputFromItem(
  item: AttentionItem,
  status: AttentionUserOverlayStatus,
  snoozedUntil?: string | null
): UpsertAttentionStateInput {
  return {
    dedupeKey: item.dedupeKey,
    status,
    snoozedUntil: snoozedUntil || null,
    sourceFingerprint: buildAttentionSourceFingerprint(item),
  };
}

export async function dismissAttentionItem(item: AttentionItem): Promise<void> {
  await upsertAttentionItemState(stateInputFromItem(item, 'dismissed'));
}

export async function snoozeAttentionItem(
  item: AttentionItem,
  snoozedUntil: string
): Promise<void> {
  await upsertAttentionItemState(stateInputFromItem(item, 'snoozed', snoozedUntil));
}

export async function markAttentionItemInProgress(item: AttentionItem): Promise<void> {
  await upsertAttentionItemState(stateInputFromItem(item, 'in_progress'));
}

export async function restoreAttentionItem(item: AttentionItem): Promise<void> {
  await clearAttentionItemState(item.dedupeKey);
}

export async function dismissAttentionItemByDedupeKey(
  dedupeKey: string,
  sourceFingerprint?: string | null
): Promise<void> {
  await upsertAttentionItemState({
    dedupeKey,
    status: 'dismissed',
    sourceFingerprint: sourceFingerprint ?? null,
  });
}

export async function mutateAttentionItemState(
  mutate: () => Promise<void>
): Promise<void> {
  await mutate();
  invalidateAttentionWorkspaceCache();
  if (typeof window.loadAttentionSummary === 'function') {
    await window.loadAttentionSummary(true);
  }
  if (typeof window.loadHrInbox === 'function') {
    await window.loadHrInbox(true);
  }
  if (typeof window.loadAttentionWorkspaceUi === 'function') {
    await window.loadAttentionWorkspaceUi(true);
  }
  if (typeof window.loadMyTasksPortal === 'function') {
    void window.loadMyTasksPortal();
  }
}

export async function dismissAttentionItemAndRefresh(item: AttentionItem): Promise<void> {
  await mutateAttentionItemState(() => dismissAttentionItem(item));
}

export async function dismissAttentionItemByDedupeKeyAndRefresh(
  dedupeKey: string,
  sourceFingerprint?: string | null
): Promise<void> {
  await mutateAttentionItemState(() =>
    dismissAttentionItemByDedupeKey(dedupeKey, sourceFingerprint)
  );
}

/** Default snooze horizon when caller does not pass an explicit date. */
export function defaultAttentionSnoozeUntil(days = 7): string {
  const date = new Date(`${todayIsoDate()}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function overlayAttentionItems(
  items: AttentionItem[],
  states: AttentionItemStateRow[]
): AttentionItem[] {
  return applyAttentionItemStates(items, states);
}

window.dismissAttentionItem = dismissAttentionItemAndRefresh;
window.snoozeAttentionItem = async (item: AttentionItem, snoozedUntil: string) => {
  await mutateAttentionItemState(() => snoozeAttentionItem(item, snoozedUntil));
};
window.markAttentionItemInProgress = async (item: AttentionItem) => {
  await mutateAttentionItemState(() => markAttentionItemInProgress(item));
};
window.restoreAttentionItem = async (item: AttentionItem) => {
  await mutateAttentionItemState(() => restoreAttentionItem(item));
};
window.dismissAttentionItemByDedupeKey = dismissAttentionItemByDedupeKeyAndRefresh;
window.loadAttentionItemStates = loadAttentionItemStates;
