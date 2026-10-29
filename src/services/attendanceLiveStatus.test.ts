import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, selectFrom } = vi.hoisted(() => ({
  invoke: vi.fn(),
  selectFrom: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabaseClient: {
    functions: { invoke },
    from: selectFrom,
  },
}));

import {
  isNoPunchAbsent,
  loadTodaysLiveAttendance,
  nowTimeOfDayEt,
  syncAttendanceFromQuickBooksTime,
} from './attendanceLiveStatus';

describe('syncAttendanceFromQuickBooksTime', () => {
  it('normalizes a successful sync response, including unmatched QBT users', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        preview: false,
        as_of: '2026-10-29',
        synced_at: '2026-10-29T12:00:00.000Z',
        matched_count: 1,
        matched: [{ employee_id: 'BTW2101', qbt_user_id: '555', name: 'Jordan Lee', status: 'on_clock' }],
        unmatched: [{ qbt_user_id: '999', name: 'Unknown Contractor' }],
        failed_count: 0,
      },
      error: null,
    });

    const result = await syncAttendanceFromQuickBooksTime({ preview: false });

    expect(result.matched).toEqual([
      { employeeId: 'BTW2101', qbtUserId: '555', name: 'Jordan Lee', status: 'on_clock' },
    ]);
    expect(result.unmatched).toEqual([{ qbtUserId: '999', name: 'Unknown Contractor' }]);
    expect(result.failedCount).toBe(0);
  });
});

describe('loadTodaysLiveAttendance', () => {
  it('maps attendance_live_status rows to camelCase', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{
        employee_id: 'BTW2101',
        status: 'worked_clocked_out',
        clock_in_at: '2026-10-29T12:00:00.000Z',
        clock_out_at: '2026-10-29T20:00:00.000Z',
        synced_at: '2026-10-29T20:05:00.000Z',
      }],
      error: null,
    });
    selectFrom.mockReturnValue({
      select: () => ({ eq }),
    });

    const rows = await loadTodaysLiveAttendance();
    expect(eq).toHaveBeenCalledWith('attendance_date', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));

    expect(rows).toEqual([
      {
        employeeId: 'BTW2101',
        status: 'worked_clocked_out',
        clockInAt: '2026-10-29T12:00:00.000Z',
        clockOutAt: '2026-10-29T20:00:00.000Z',
        syncedAt: '2026-10-29T20:05:00.000Z',
      },
    ]);
  });
});

describe('isNoPunchAbsent', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // Force a host timezone far from ET so this genuinely exercises the ET-aware check
    // regardless of what timezone CI runs in (mirrors the mondayOfWeek test approach).
    process.env.TZ = 'Pacific/Kiritimati';
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('is never absent for a status other than no_punch', () => {
    expect(isNoPunchAbsent('on_clock', '08:00:00', new Date('2026-10-29T15:00:00Z'))).toBe(false);
  });

  it('is never absent when no scheduled_start_time is set', () => {
    expect(isNoPunchAbsent('no_punch', null, new Date('2026-10-29T15:00:00Z'))).toBe(false);
  });

  it('is not absent before the scheduled start time in ET', () => {
    // 11:00 UTC = 7:00 AM EDT (before an 8:00 AM start).
    expect(isNoPunchAbsent('no_punch', '08:00:00', new Date('2026-10-29T11:00:00Z'))).toBe(false);
  });

  it('is absent after the scheduled start time in ET', () => {
    // 13:00 UTC = 9:00 AM EDT (after an 8:00 AM start).
    expect(isNoPunchAbsent('no_punch', '08:00:00', new Date('2026-10-29T13:00:00Z'))).toBe(true);
  });
});

describe('nowTimeOfDayEt', () => {
  it('formats as zero-padded HH:MM:SS regardless of host timezone', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      expect(nowTimeOfDayEt(new Date('2026-10-29T13:05:09Z'))).toBe('09:05:09');
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
