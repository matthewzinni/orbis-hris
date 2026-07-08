/**
 * PTO balance: baseline on employees + remaining after approved PTO deductions.
 */

import { supabaseClient } from './supabaseClient';
import type { LeaveRequestRecord } from './leaveRequests';

export type PtoBalanceSnapshot = {
  baselineHours: number | null;
  baselineAsOf: string | null;
  usedHours: number;
  remainingHours: number | null;
};

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

export function formatPtoHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—';
  return hours.toFixed(2);
}

export function isPtoDeductionLeave(record: LeaveRequestRecord): boolean {
  if (record.status !== 'approved') return false;
  if (String(record.leave_type || '').toLowerCase() !== 'pto') return false;
  if (record.deduct_from_pto_balance === false) return false;
  return true;
}

export function leaveRequestPtoHours(record: LeaveRequestRecord): number {
  const hours = record.hours;
  if (hours == null || Number.isNaN(Number(hours))) return 0;
  return Number(hours);
}

export function sumApprovedPtoDeductions(requests: LeaveRequestRecord[]): number {
  return requests.filter(isPtoDeductionLeave).reduce((sum, row) => sum + leaveRequestPtoHours(row), 0);
}

export function computePtoRemaining(
  baselineHours: number | null | undefined,
  requests: LeaveRequestRecord[]
): PtoBalanceSnapshot {
  const baseline =
    baselineHours == null || baselineHours === undefined || Number.isNaN(Number(baselineHours))
      ? null
      : Number(baselineHours);
  const usedHours = sumApprovedPtoDeductions(requests);
  const remainingHours = baseline == null ? null : Math.max(0, baseline - usedHours);

  return {
    baselineHours: baseline,
    baselineAsOf: null,
    usedHours,
    remainingHours,
  };
}

export function ptoPanelHeaderLabel(remainingHours: number | null | undefined): string {
  if (remainingHours == null || Number.isNaN(remainingHours)) {
    return 'Time Off — balance not set';
  }
  return `Time Off — ${formatPtoHours(remainingHours)} hours`;
}

export async function loadEmployeePtoBaseline(
  employeeId: string
): Promise<{ hours: number | null; asOf: string | null }> {
  const id = normalize(employeeId);
  if (!id) return { hours: null, asOf: null };

  const { data, error } = await supabaseClient
    .from('employees')
    .select('pto_balance_hours, pto_balance_as_of')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[PtoBalance] Load baseline failed:', error);
    return { hours: null, asOf: null };
  }

  const row = (data || {}) as Record<string, unknown>;
  const hoursRaw = row.pto_balance_hours;
  const hours =
    hoursRaw == null || hoursRaw === undefined || Number.isNaN(Number(hoursRaw))
      ? null
      : Number(hoursRaw);

  const asOfRaw = row.pto_balance_as_of;
  const asOf = asOfRaw ? String(asOfRaw).slice(0, 10) : null;

  return { hours, asOf };
}

export async function setEmployeePtoBaselineHours(
  employeeId: string,
  hours: number
): Promise<{ hours: number; asOf: string }> {
  const id = normalize(employeeId);
  if (!id) {
    throw new Error('Open an employee first.');
  }

  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error('PTO balance hours must be zero or greater.');
  }

  const rounded = Math.round(hours * 100) / 100;
  const asOf = new Date().toISOString().slice(0, 10);

  const { error } = await supabaseClient
    .from('employees')
    .update({
      pto_balance_hours: rounded,
      pto_balance_as_of: asOf,
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Could not update banked PTO hours.');
  }

  return { hours: rounded, asOf };
}

export async function adjustEmployeePtoBaselineHours(
  employeeId: string,
  deltaHours: number
): Promise<{ hours: number; asOf: string; previousHours: number }> {
  if (!Number.isFinite(deltaHours) || deltaHours === 0) {
    throw new Error('Enter a non-zero hour adjustment.');
  }

  const baseline = await loadEmployeePtoBaseline(employeeId);
  const previousHours = baseline.hours ?? 0;
  const nextHours = Math.max(0, Math.round((previousHours + deltaHours) * 100) / 100);
  const result = await setEmployeePtoBaselineHours(employeeId, nextHours);
  return { ...result, previousHours };
}

export async function loadEmployeePtoSnapshot(
  employeeId: string,
  requests: LeaveRequestRecord[]
): Promise<PtoBalanceSnapshot> {
  const baseline = await loadEmployeePtoBaseline(employeeId);
  const snapshot = computePtoRemaining(baseline.hours, requests);
  snapshot.baselineAsOf = baseline.asOf;
  return snapshot;
}

export function readEmployeePtoBaselineFromWindow(employeeId: string): number | null {
  const employees = (window.EMPLOYEES || window.ALL_EMPLOYEES || []) as Array<
    Record<string, unknown>
  >;
  const match = employees.find(
    (row) => String(row.id || row.employee_id || '') === String(employeeId)
  );
  if (!match) return null;

  const raw = match.pto_balance_hours;
  if (raw == null || raw === undefined || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}
