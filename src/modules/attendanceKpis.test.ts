import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  loadLive: vi.fn(), loadManual: vi.fn(), employees: [] as Record<string, unknown>[],
}));

vi.mock('../services/access', () => ({
  employeeMatchesAttendanceScope: () => true, isAdminUser: () => true, isSupervisorUser: () => false,
}));
vi.mock('../services/attendanceAbsenceReport', () => ({
  ATTENDANCE_LOOKBACK_DAYS: 28, ATTENDANCE_REPEAT_ABSENCE_MIN: 2,
  loadRepeatedAbsenceReport: async () => [],
}));
vi.mock('../services/attendance', () => ({
  AttendanceSyncError: class extends Error {}, loadManualAttendanceSnapshot: fixture.loadManual,
  saveManualAttendanceSnapshot: vi.fn(),
}));
vi.mock('../services/attendanceStatusSync', () => ({ syncEmployeeStatusFromRollCall: vi.fn() }));
vi.mock('../services/attendanceRemoteEmployees', () => ({ isRemoteEmployee: () => false }));
vi.mock('../services/leaveRequests', () => ({ loadApprovedLeaveOutToday: async () => [] }));
vi.mock('../services/attendanceRollCallSections', () => ({
  ATTENDANCE_ROLL_CALL_SECTIONS: [{ id: 'hourly', label: 'Hourly' }],
  getAttendanceRollCallSection: () => 'hourly',
}));
vi.mock('../services/employeeUtils', () => ({
  employeeDisplayName: (employee?: Record<string, unknown>) => String(employee?.first_name || ''),
}));
vi.mock('../services/attendanceLiveStatus', async () => {
  const { isNoPunchAbsent } = await import('../services/attendanceLiveKpis');
  return {
    AttendanceLiveSyncError: class extends Error {}, isNoPunchAbsent,
    loadTodaysLiveAttendance: fixture.loadLive, syncAttendanceFromQuickBooksTime: vi.fn(),
  };
});
vi.mock('./employees', () => ({
  getEmployees: () => fixture.employees,
  normalizeEmployeeStatus: (status: string) => status.toLowerCase(),
}));

type FakeElement = {
  textContent: string; value: string; dataset: Record<string, string>; innerHTML: string;
  addEventListener: ReturnType<typeof vi.fn>; querySelector: (selector: string) => null;
  querySelectorAll: () => unknown[];
};
let elements: Map<string, FakeElement>;
const element = (): FakeElement => ({
  textContent: '', value: '', dataset: {}, innerHTML: '', addEventListener: vi.fn(),
  querySelector: () => null, querySelectorAll: () => [],
});

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-29T15:00:00Z'));
  elements = new Map([
    'attendanceDateInput', 'attendanceChecklistBody', 'attendancePresentCount', 'attendanceAbsentCount',
    'attendancePresentDetail', 'attendanceAbsentDetail', 'attendanceLiveStatusBody', 'attendanceLiveSyncedAt',
    'attendanceAsOf', 'attendanceSource',
  ].map((id) => [id, element()]));
  vi.stubGlobal('document', {
    getElementById: (id: string) => elements.get(id) || null,
    querySelectorAll: () => [],
  });
  vi.stubGlobal('CSS', { escape: (text: string) => text });
  fixture.employees = ['A', 'B', 'C', 'D', 'E'].map((id) => ({
    id, first_name: id, status: 'Active', scheduled_start_time: '08:00:00',
  }));
  fixture.employees[4].status = 'Terminated';
  fixture.loadManual.mockResolvedValue(null);
  fixture.loadLive.mockResolvedValue([
    { employeeId: 'A', status: 'on_clock', clockInAt: null, syncedAt: '2026-10-29T15:00:00Z' },
    { employeeId: 'B', status: 'worked_clocked_out', clockInAt: null, syncedAt: '2026-10-29T15:00:00Z' },
    { employeeId: 'C', status: 'manual_entry', clockInAt: null, syncedAt: '2026-10-29T15:00:00Z' },
    { employeeId: 'D', status: 'no_punch', clockInAt: null, syncedAt: '2026-10-29T15:00:00Z' },
    { employeeId: 'E', status: 'on_clock', clockInAt: null, syncedAt: '2026-10-29T15:00:00Z' },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.loadAttendance;
  delete window.applyAttendanceAccess;
});

it('refreshes the KPI elements when live data loads, excluding terminated roster members', async () => {
  const { loadAttendance } = await import('./attendance');
  await loadAttendance(true);
  await vi.waitFor(() => expect(elements.get('attendancePresentCount')?.textContent).toBe('3'));
  expect(elements.get('attendanceAbsentCount')?.textContent).toBe('1');
  expect(elements.get('attendancePresentDetail')?.textContent).toContain('QuickBooks Time');
});

it('keeps a historical date on its saved roll call instead of substituting today’s live totals', async () => {
  elements.get('attendanceDateInput')!.value = '2026-10-28';
  fixture.loadManual.mockResolvedValue({
    asOf: '2026-10-28T15:00:00Z', source: 'Manual',
    present: [{ employeeId: 'A', name: 'A' }], absent: [],
  });
  const { loadAttendance } = await import('./attendance');
  await loadAttendance(true);
  await vi.waitFor(() => expect(elements.get('attendanceLiveSyncedAt')?.textContent).not.toBe(''));
  expect(elements.get('attendancePresentCount')?.textContent).toBe('1');
  expect(elements.get('attendanceAbsentCount')?.textContent).toBe('0');
  expect(elements.get('attendancePresentDetail')?.textContent).toBe('Checked in roll call');
});
