import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabaseClient: { rpc: mocks.rpc } }));
vi.mock('./access', () => ({ employeeMatchesAttendanceScope: () => true }));

import { isUnexcusedAbsence, normalizePeopleList } from './attendance';
import { loadRepeatedAbsenceReport, summarizeEmployeeAbsences } from './attendanceAbsenceReport';

beforeEach(() => mocks.rpc.mockReset());

describe('excused flag on saved absences', () => {
  it('keeps an explicit flag and leaves older records unflagged', () => {
    const people = normalizePeopleList([
      { employeeId: 'E1', name: 'Ann', excused: false },
      { employeeId: 'E2', name: 'Bo', excused: true },
      { employeeId: 'E3', name: 'Cy' },
    ]);
    expect(people.map((person) => person.excused)).toEqual([false, true, undefined]);
    expect(people.map(isUnexcusedAbsence)).toEqual([true, false, false]);
  });
});

describe('summarizeEmployeeAbsences', () => {
  it('counts unexcused days in the rolling 90-day window, inclusive of both ends', () => {
    const summary = summarizeEmployeeAbsences(
      ['2026-10-30', '2026-08-02', '2026-08-01'],
      ['2026-10-30', '2026-09-15', '2026-08-02', '2026-08-01', '2026-08-01'],
      '2026-10-30'
    );
    // Window is Aug 2 – Oct 30; Aug 1 falls outside and the duplicate day counts once.
    expect(summary.unexcusedCount).toBe(3);
    expect(summary.overUnexcusedLimit).toBe(false);
    expect(summary.absenceDates).toEqual(['2026-10-30']);
  });

  it('flags the limit at exactly 4', () => {
    const dates = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'];
    expect(summarizeEmployeeAbsences(dates, dates, '2026-10-30').overUnexcusedLimit).toBe(true);
  });
});

describe('loadRepeatedAbsenceReport', () => {
  it('lists an employee over the unexcused limit even with under 2 recent absences', async () => {
    const absent = (excused?: boolean) => [{ employeeId: 'E1', name: 'Ann Lee', excused }];
    mocks.rpc.mockResolvedValue({
      data: [
        { attendance_date: '2026-10-28', absent: absent(false) },
        { attendance_date: '2026-09-10', absent: absent(false) },
        { attendance_date: '2026-08-20', absent: absent(false) },
        { attendance_date: '2026-08-15', absent: absent(false) },
        { attendance_date: '2026-08-14', absent: absent(true) },
        { attendance_date: '2026-08-13', absent: absent() },
      ],
      error: null,
    });

    const rows = await loadRepeatedAbsenceReport({
      endDate: '2026-10-30',
      roster: [{ id: 'E1', first_name: 'Ann', last_name: 'Lee', department: 'Ops' }],
    });

    expect(mocks.rpc).toHaveBeenCalledWith('orbis_list_attendance_snapshots', {
      p_from: '2026-08-02',
      p_to: '2026-10-30',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      employeeId: 'E1',
      absenceCount: 1,
      unexcusedCount: 4,
      overUnexcusedLimit: true,
    });
  });
});
