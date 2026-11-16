import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildEntries,
  entriesSignature,
  planPush,
  type LeaveRow,
} from '../../supabase/functions/push-leave-to-qbt/plan';

function row(overrides: Partial<LeaveRow> = {}): LeaveRow {
  return {
    id: 'leave-1',
    employee_id: 'BTW1',
    leave_type: 'pto',
    start_date: '2026-11-23',
    end_date: null,
    hours: 8,
    status: 'approved',
    deduct_from_pto_balance: true,
    qbt_time_off_request_id: null,
    qbt_sync_status: null,
    qbt_sync_signature: null,
    ...overrides,
  };
}

describe('buildEntries', () => {
  it('sends a single day as one entry with the exact hours', () => {
    expect(buildEntries(row({ hours: 4.5 }))).toEqual([{ date: '2026-11-23', duration: 16200 }]);
  });

  it('spreads total hours over weekdays only, remainder on the last day', () => {
    // Fri 11/27 → Mon 11/30: weekend skipped
    expect(buildEntries(row({ start_date: '2026-11-27', end_date: '2026-11-30', hours: 15 }))).toEqual([
      { date: '2026-11-27', duration: 27000 },
      { date: '2026-11-30', duration: 27000 },
    ]);
    const odd = buildEntries(row({ start_date: '2026-11-23', end_date: '2026-11-25', hours: 10 }));
    expect(odd.map((e) => e.duration)).toEqual([12000, 12000, 12000]);
    expect(odd.reduce((s, e) => s + e.duration, 0)).toBe(36000);
  });

  it('assumes 8 hours per day when hours are blank', () => {
    expect(buildEntries(row({ start_date: '2026-11-23', end_date: '2026-11-24', hours: null }))).toEqual([
      { date: '2026-11-23', duration: 28800 },
      { date: '2026-11-24', duration: 28800 },
    ]);
  });

  it('keeps weekend days when the whole request is on a weekend', () => {
    expect(buildEntries(row({ start_date: '2026-11-28', end_date: '2026-11-28', hours: 8 }))).toEqual([
      { date: '2026-11-28', duration: 28800 },
    ]);
  });
});

describe('planPush', () => {
  it('creates approved PTO that is not in QuickBooks Time yet', () => {
    expect(planPush(row()).action).toBe('create');
  });

  it('ignores requested, sick, and historical (non-deducting) requests', () => {
    expect(planPush(row({ status: 'requested' })).action).toBe('none');
    expect(planPush(row({ leave_type: 'sick' })).action).toBe('none');
    expect(planPush(row({ deduct_from_pto_balance: false })).action).toBe('none');
  });

  it('never sends legacy approvals marked skipped', () => {
    expect(planPush(row({ qbt_sync_status: 'skipped' })).action).toBe('none');
  });

  it('does nothing when already synced with the same dates and hours', () => {
    const sig = entriesSignature(buildEntries(row()));
    expect(
      planPush(row({ qbt_time_off_request_id: 55, qbt_sync_status: 'synced', qbt_sync_signature: sig })).action
    ).toBe('none');
  });

  it('replaces the QuickBooks Time request when hours change', () => {
    const sig = entriesSignature(buildEntries(row()));
    const plan = planPush(
      row({ hours: 4, qbt_time_off_request_id: 55, qbt_sync_status: 'synced', qbt_sync_signature: sig })
    );
    expect(plan).toMatchObject({ action: 'replace', qbtRequestId: '55' });
  });

  it('cancels in QuickBooks Time when the request is cancelled or denied', () => {
    for (const status of ['cancelled', 'denied']) {
      expect(planPush(row({ status, qbt_time_off_request_id: 55, qbt_sync_status: 'synced' }))).toEqual({
        action: 'cancel',
        qbtRequestId: '55',
      });
    }
  });

  it('does not cancel twice', () => {
    expect(planPush(row({ status: 'cancelled', qbt_time_off_request_id: 55, qbt_sync_status: 'canceled' })).action).toBe(
      'none'
    );
  });

  it('retries a failed send', () => {
    expect(planPush(row({ qbt_sync_status: 'failed' })).action).toBe('create');
  });
});

describe('push-leave-to-qbt safeguards', () => {
  const source = readFileSync(join(__dirname, '../../supabase/functions/push-leave-to-qbt/index.ts'), 'utf8');

  it('matches QuickBooks Time users only by employees.qbt_user_id', () => {
    expect(source).toContain(".select('qbt_user_id')");
    expect(source).not.toMatch(/first_name|last_name|work_email/);
  });

  it('limits reconcile and cancel-only to admins', () => {
    expect(source).toContain("'orbis_is_admin'");
  });

  it('marks pre-existing approvals as skipped in the migration', () => {
    const sql = readFileSync(
      join(__dirname, '../../supabase/migrations/20261116150000_leave_requests_qbt_push.sql'),
      'utf8'
    );
    expect(sql).toMatch(/set qbt_sync_status = 'skipped'[\s\S]*where status = 'approved'/);
  });
});
