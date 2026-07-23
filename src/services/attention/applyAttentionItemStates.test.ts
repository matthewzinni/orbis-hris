import { describe, expect, it } from 'vitest';
import { applyAttentionItemStates } from './applyAttentionItemStates';
import { buildAttentionSourceFingerprint } from './fingerprint';
import type { AttentionItem } from './types';

const baseItem: AttentionItem = {
  id: 'discipline:discipline_report:42',
  dedupeKey: 'discipline:discipline_report:42',
  category: 'discipline',
  severity: 'normal',
  status: 'open',
  title: 'Open discipline — Alex Smith',
  explanation: 'Attendance',
  employeeName: 'Alex Smith',
  sourceType: 'discipline_report',
  sourceId: '42',
  recommendedAction: 'Review the case.',
  route: { type: 'employee', employeeId: 'emp-1', drawerTab: 'discipline' },
  evaluatedAt: '2026-07-23T12:00:00.000Z',
};

describe('applyAttentionItemStates', () => {
  it('hides dismissed items when fingerprint matches', () => {
    const fingerprint = buildAttentionSourceFingerprint(baseItem);
    const result = applyAttentionItemStates(
      [baseItem],
      [
        {
          dedupe_key: baseItem.dedupeKey,
          status: 'dismissed',
          snoozed_until: null,
          source_fingerprint: fingerprint,
        },
      ]
    );

    expect(result).toHaveLength(0);
  });

  it('resurfaces dismissed items when fingerprint changes', () => {
    const result = applyAttentionItemStates(
      [baseItem],
      [
        {
          dedupe_key: baseItem.dedupeKey,
          status: 'dismissed',
          snoozed_until: null,
          source_fingerprint: 'stale-fingerprint',
        },
      ]
    );

    expect(result).toHaveLength(1);
  });

  it('hides snoozed items until snooze date passes', () => {
    const snoozed = applyAttentionItemStates(
      [baseItem],
      [
        {
          dedupe_key: baseItem.dedupeKey,
          status: 'snoozed',
          snoozed_until: '2026-07-30',
          source_fingerprint: null,
        },
      ],
      '2026-07-23'
    );
    expect(snoozed).toHaveLength(0);

    const active = applyAttentionItemStates(
      [baseItem],
      [
        {
          dedupe_key: baseItem.dedupeKey,
          status: 'snoozed',
          snoozed_until: '2026-07-30',
          source_fingerprint: null,
        },
      ],
      '2026-07-30'
    );
    expect(active).toHaveLength(1);
  });

  it('marks in-progress overlay status on visible items', () => {
    const result = applyAttentionItemStates(
      [baseItem],
      [
        {
          dedupe_key: baseItem.dedupeKey,
          status: 'in_progress',
          snoozed_until: null,
          source_fingerprint: null,
        },
      ]
    );

    expect(result[0]?.status).toBe('in_progress');
  });
});
