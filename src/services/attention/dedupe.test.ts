import { describe, expect, it } from 'vitest';
import { buildAttentionDedupeKey, dedupeAttentionItems } from './dedupe';
import type { AttentionItem } from './types';

function sampleItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: 'item-1',
    dedupeKey: 'item-1',
    category: 'discipline',
    severity: 'normal',
    status: 'open',
    title: 'Open discipline — Jane Doe',
    explanation: 'Attendance',
    employeeName: 'Jane Doe',
    sourceType: 'discipline_report',
    sourceId: '42',
    recommendedAction: 'Review the case.',
    route: { type: 'employee', employeeId: 'emp-1', drawerTab: 'discipline' },
    evaluatedAt: '2026-07-23T12:00:00.000Z',
    ...overrides,
  };
}

describe('buildAttentionDedupeKey', () => {
  it('builds stable category and source keys', () => {
    expect(buildAttentionDedupeKey('meeting', 'employee_meeting', '99')).toBe(
      'meeting:employee_meeting:99'
    );
    expect(buildAttentionDedupeKey('meeting', 'employee_meeting', '99', 'follow_up')).toBe(
      'meeting:employee_meeting:99:follow_up'
    );
  });
});

describe('dedupeAttentionItems', () => {
  it('collapses duplicate dedupe keys with last writer wins', () => {
    const first = sampleItem({ title: 'First', dedupeKey: 'discipline:discipline_report:42' });
    const second = sampleItem({ title: 'Second', dedupeKey: 'discipline:discipline_report:42' });

    const result = dedupeAttentionItems([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Second');
  });

  it('ignores items without dedupe keys', () => {
    const missingKey = sampleItem({ dedupeKey: '', id: '' });
    const valid = sampleItem({ dedupeKey: 'discipline:discipline_report:7' });

    expect(dedupeAttentionItems([missingKey, valid])).toEqual([valid]);
  });
});
