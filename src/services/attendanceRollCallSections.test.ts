import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_ROLL_CALL_SECTIONS,
  getAttendanceRollCallSection,
} from './attendanceRollCallSections';

describe('attendance roll call pay sections', () => {
  it('defines Hourly, Salary, and Contract in order', () => {
    expect(ATTENDANCE_ROLL_CALL_SECTIONS.map((section) => section.label)).toEqual([
      'Hourly',
      'Salary',
      'Contract',
    ]);
  });

  it('classifies pay types into roll call sections', () => {
    expect(getAttendanceRollCallSection({ pay_type: 'Hourly' })).toBe('hourly');
    expect(getAttendanceRollCallSection({ payType: 'Salary' })).toBe('salary');
    expect(getAttendanceRollCallSection({ pay_type: 'Contract' })).toBe('contract');
    expect(getAttendanceRollCallSection({ pay_type: '' })).toBe('hourly');
  });
});
