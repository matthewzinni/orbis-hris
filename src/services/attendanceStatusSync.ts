/**
 * Apply roll-call results to employee.status for today's attendance save.
 * Absent → Absent; present after Absent → Active. Leave / approved PTO today stays Leave.
 */

import { isAdminUser } from './access';
import type { AttendancePerson, AttendanceSummary } from './attendance';
import { loadApprovedLeaveOutToday } from './leaveRequests';
import { supabaseClient } from './supabaseClient';

export type RollCallStatusSyncResult = {
  markedAbsent: number;
  markedActive: number;
  skippedLeave: number;
};

function normalizeStatus(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function isLeaveStatus(status: unknown): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'LEAVE' || normalized === 'ON LEAVE';
}

function rosterIdFromPerson(person: AttendancePerson): string {
  const id = String(person.employeeId || '').trim();
  return id && id !== '—' ? id : '';
}

export async function syncEmployeeStatusFromRollCall(
  snapshot: AttendanceSummary,
  attendanceDate: string,
  todayIsoDate: string,
  rosterEmployees: Array<{ id?: string; employee_id?: string; displayId?: string; dbId?: string; status?: string }>
): Promise<RollCallStatusSyncResult | null> {
  if (!isAdminUser()) return null;
  if (attendanceDate !== todayIsoDate) return null;

  const leaveToday = await loadApprovedLeaveOutToday();
  const leaveTodayIds = new Set(
    leaveToday.map((row) => String(row.employee_id || '').trim()).filter(Boolean)
  );

  const absentIds = new Set(
    snapshot.absent.map(rosterIdFromPerson).filter(Boolean)
  );
  const presentIds = new Set(
    snapshot.present.map(rosterIdFromPerson).filter(Boolean)
  );

  const result: RollCallStatusSyncResult = {
    markedAbsent: 0,
    markedActive: 0,
    skippedLeave: 0,
  };

  for (const employee of rosterEmployees) {
    const id = String(
      employee.id || employee.employee_id || employee.displayId || employee.dbId || ''
    ).trim();
    if (!id) continue;

    const onLeave = isLeaveStatus(employee.status) || leaveTodayIds.has(id);

    if (absentIds.has(id)) {
      if (onLeave) {
        result.skippedLeave += 1;
        continue;
      }
      if (normalizeStatus(employee.status) === 'ABSENT') continue;

      const { error } = await supabaseClient
        .from('employees')
        .update({ status: 'Absent' })
        .eq('id', id);

      if (!error) result.markedAbsent += 1;
      else console.error('[Attendance] Status sync absent failed:', id, error);
      continue;
    }

    if (presentIds.has(id) && normalizeStatus(employee.status) === 'ABSENT') {
      const { error } = await supabaseClient
        .from('employees')
        .update({ status: 'Active' })
        .eq('id', id);

      if (!error) result.markedActive += 1;
      else console.error('[Attendance] Status sync active failed:', id, error);
    }
  }

  return result;
}
