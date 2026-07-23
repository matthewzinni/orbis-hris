import { describe, expect, it } from 'vitest';
import {
  attentionItemToHrInboxItem,
  attentionItemsToHrInboxItems,
  isPhase3InboxKind,
} from './hrInboxAdapter';
import type { AttentionItem } from '../types';

const sampleAttentionItem: AttentionItem = {
  id: 'candidate:candidate:c-1:interview',
  dedupeKey: 'candidate:candidate:c-1:interview',
  category: 'candidate',
  severity: 'high',
  status: 'overdue',
  title: 'Interview follow-up needed — Jamie Fox',
  explanation: 'Phone screen · Pipeline · 7/20/2026',
  candidateId: 'c-1',
  employeeName: 'Jamie Fox',
  dueDate: '2026-07-20',
  sourceType: 'candidate',
  sourceId: 'c-1',
  recommendedAction: 'Update interview status.',
  route: { type: 'candidate', candidateId: 'c-1', drawerTab: 'interview' },
  evaluatedAt: '2026-07-23T12:00:00.000Z',
};

describe('hrInboxAdapter', () => {
  it('maps attention categories to inbox kinds and severities', () => {
    const inboxItem = attentionItemToHrInboxItem(sampleAttentionItem);

    expect(inboxItem.kind).toBe('candidate_interview');
    expect(inboxItem.severity).toBe('overdue');
    expect(inboxItem.route).toEqual({ type: 'view', viewId: 'candidatesView' });
  });

  it('maps batches of attention items', () => {
    expect(attentionItemsToHrInboxItems([sampleAttentionItem])).toHaveLength(1);
  });

  it('identifies phase-3 inbox kinds', () => {
    expect(isPhase3InboxKind('candidate_interview')).toBe(true);
    expect(isPhase3InboxKind('stay_interview')).toBe(false);
  });
});
