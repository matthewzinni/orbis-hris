import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabaseClient: { from: vi.fn() } }));

import { computePtoRemaining, ptoBalanceMetaText } from './ptoBalance';
import type { LeaveRequestRecord } from './leaveRequests';

const approvedPto = (hours: number) =>
  ({ status: 'approved', leave_type: 'pto', hours, deduct_from_pto_balance: true }) as unknown as LeaveRequestRecord;

describe('computePtoRemaining', () => {
  it('subtracts Orbis-approved PTO from a manual baseline', () => {
    const snap = computePtoRemaining(40, [approvedPto(8)], 'manual');
    expect(snap.usedHours).toBe(8);
    expect(snap.remainingHours).toBe(32);
  });

  it('keeps legacy behavior when no source is set', () => {
    expect(computePtoRemaining(40, [approvedPto(8)]).remainingHours).toBe(32);
  });

  it('does not double-subtract a QuickBooks Time balance', () => {
    const snap = computePtoRemaining(24.5, [approvedPto(8)], 'quickbooks_time');
    expect(snap.usedHours).toBe(0);
    expect(snap.remainingHours).toBe(24.5);
  });

  it('returns null remaining when no balance is set', () => {
    expect(computePtoRemaining(null, [approvedPto(8)], 'quickbooks_time').remainingHours).toBeNull();
  });
});

describe('ptoBalanceMetaText', () => {
  it('labels QuickBooks Time balances with date and multi-type breakdown', () => {
    const snap = computePtoRemaining(18, [], 'quickbooks_time');
    snap.baselineAsOf = '2026-10-29';
    snap.breakdown = { PTO: 10, Sick: 8, Holiday: 0 };
    expect(ptoBalanceMetaText(snap, 'approved in Orbis')).toBe(
      'From QuickBooks Time · as of 2026-10-29 · PTO 10.00, Sick 8.00'
    );
  });

  it('describes manual baselines with Orbis deductions', () => {
    const snap = computePtoRemaining(40, [approvedPto(8)], 'manual');
    snap.baselineAsOf = '2026-07-08';
    expect(ptoBalanceMetaText(snap, 'approved in Orbis')).toBe(
      'Baseline 40.00 hr · as of 2026-07-08 · 8.00 hr approved in Orbis'
    );
  });
});
