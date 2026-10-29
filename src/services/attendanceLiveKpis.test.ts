import { describe, expect, it } from 'vitest';
import { attendanceDateEt, countAttendanceKpis, type AttendanceKpiPerson } from './attendanceLiveKpis';

const now = new Date('2026-10-29T15:00:00Z');
const person = (overrides: Partial<AttendanceKpiPerson> = {}): AttendanceKpiPerson => ({
  manualPresent: false, manualAbsent: false, ...overrides,
});

describe('attendance KPI totals', () => {
  it('counts everyone who worked today as present, including clocked-out and manual work entries', () => {
    expect(countAttendanceKpis([
      person({ liveStatus: 'on_clock' }),
      person({ liveStatus: 'worked_clocked_out' }),
      person({ liveStatus: 'manual_entry' }),
    ], now)).toEqual({ present: 3, absent: 0 });
  });

  it('counts a missing punch only after a known start and excludes leave and unknown schedules', () => {
    expect(countAttendanceKpis([
      person({ liveStatus: 'no_punch', scheduledStartTime: '08:00:00' }),
      person({ liveStatus: 'no_punch', scheduledStartTime: '15:00:00' }),
      person({ liveStatus: 'no_punch' }),
      person({ liveStatus: 'no_punch', scheduledStartTime: '08:00:00', onLeave: true }),
    ], now)).toEqual({ present: 0, absent: 1 });
  });

  it('does not double count manual marks or keep someone absent after QuickBooks records work', () => {
    expect(countAttendanceKpis([
      person({ liveStatus: 'on_clock', manualPresent: true }),
      person({ liveStatus: 'worked_clocked_out', manualAbsent: true }),
    ], now)).toEqual({ present: 2, absent: 0 });
  });

  it('preserves explicit manual attendance for people without a conclusive live result', () => {
    expect(countAttendanceKpis([
      person({ manualPresent: true }),
      person({ manualAbsent: true }),
      person({ liveStatus: 'no_punch', manualPresent: true }),
      person(),
    ], now)).toEqual({ present: 2, absent: 1 });
  });

  it('does not mark approved leave absent even when a manual absent mark exists', () => {
    expect(countAttendanceKpis([person({ onLeave: true, manualAbsent: true })], now))
      .toEqual({ present: 0, absent: 0 });
  });

  it('honors a manual present mark when an employee forgot to clock in after shift start', () => {
    expect(countAttendanceKpis([person({
      liveStatus: 'no_punch', scheduledStartTime: '08:00:00', manualPresent: true,
    })], now)).toEqual({ present: 1, absent: 0 });
  });

  it('uses the company date in Eastern time around midnight UTC', () => {
    expect(attendanceDateEt(new Date('2026-10-30T02:00:00Z'))).toBe('2026-10-29');
  });
});
