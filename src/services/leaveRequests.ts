/**
 * Time off / leave request cases with PTO balance display (baseline on employee).
 */

import {
  employeeMatchesSupervisorAccess,
  getCurrentUserAccess,
  getLinkedEmployeeId,
  isAdminUser,
  isEmployeeUser,
  isSupervisorUser,
} from './access';
import { supabaseClient } from './supabaseClient';
import { employeeDisplayName } from './employeeUtils';
import { createPayrollHandoff } from './payrollHandoff';

export type LeaveRequestStatus = 'requested' | 'approved' | 'denied' | 'cancelled';

export type LeaveType =
  | 'pto'
  | 'sick'
  | 'bereavement'
  | 'fmla'
  | 'unpaid'
  | 'other';

export type LeaveRequestRecord = {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string | null;
  hours: number | null;
  status: LeaveRequestStatus;
  intermittent: boolean;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  payroll_notified: boolean;
  deduct_from_pto_balance: boolean;
  created_at: string;
  created_by: string | null;
};

export type LeaveRequestDraft = {
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date?: string | null;
  hours?: number | null;
  intermittent?: boolean;
  notes?: string | null;
};

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  pto: 'PTO',
  sick: 'Sick',
  bereavement: 'Bereavement',
  fmla: 'FMLA',
  unpaid: 'Unpaid',
  other: 'Other',
};

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function actorEmail(): string | null {
  const email = normalize(getCurrentUserAccess()?.email);
  return email || null;
}

function mapRow(row: Record<string, unknown>): LeaveRequestRecord {
  return {
    id: String(row.id || ''),
    employee_id: String(row.employee_id || ''),
    leave_type: String(row.leave_type || 'other') as LeaveType,
    start_date: String(row.start_date || '').slice(0, 10),
    end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
    hours: row.hours === null || row.hours === undefined ? null : Number(row.hours),
    status: String(row.status || 'requested') as LeaveRequestStatus,
    intermittent: Boolean(row.intermittent),
    notes: row.notes ? String(row.notes) : null,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    payroll_notified: Boolean(row.payroll_notified),
    deduct_from_pto_balance: row.deduct_from_pto_balance === false ? false : true,
    created_at: String(row.created_at || ''),
    created_by: row.created_by ? String(row.created_by) : null,
  };
}

export function leaveTypeLabel(type: LeaveType | string): string {
  const key = String(type || 'other').toLowerCase() as LeaveType;
  return LEAVE_TYPE_LABELS[key] || String(type || 'Leave');
}

export function leaveStatusLabel(status: LeaveRequestStatus | string): string {
  const raw = String(status || '').toLowerCase();
  if (raw === 'approved') return 'Approved';
  if (raw === 'denied') return 'Denied';
  if (raw === 'cancelled') return 'Cancelled';
  return 'Requested';
}

export function formatLeaveDateRange(record: LeaveRequestRecord): string {
  const start = record.start_date;
  const end = record.end_date;
  if (!start) return '—';
  if (!end || end === start) return start;
  return `${start} → ${end}`;
}

export function leaveOverlapsToday(record: LeaveRequestRecord): boolean {
  if (record.status !== 'approved') return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(`${record.start_date}T00:00:00`);
  const endRaw = record.end_date || record.start_date;
  const end = new Date(`${endRaw}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  return start <= today && end >= today;
}

export async function loadLeaveRequestsForEmployee(
  employeeId: string
): Promise<LeaveRequestRecord[]> {
  const id = normalize(employeeId);
  if (!id) return [];

  const { data, error } = await supabaseClient
    .from('leave_requests')
    .select('*')
    .eq('employee_id', id)
    .order('start_date', { ascending: false });

  if (error) {
    console.error('[LeaveRequests] Load failed:', error);
    throw new Error(error.message || 'Could not load leave requests.');
  }

  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function loadPendingLeaveRequests(): Promise<LeaveRequestRecord[]> {
  const { data, error } = await supabaseClient
    .from('leave_requests')
    .select('*')
    .eq('status', 'requested')
    .order('start_date', { ascending: true });

  if (error) {
    console.error('[LeaveRequests] Pending load failed:', error);
    return [];
  }

  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function loadApprovedLeaveOutToday(): Promise<LeaveRequestRecord[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseClient
    .from('leave_requests')
    .select('*')
    .eq('status', 'approved')
    .lte('start_date', today)
    .order('start_date', { ascending: true });

  if (error) {
    console.error('[LeaveRequests] Out today load failed:', error);
    return [];
  }

  return (data || [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter(leaveOverlapsToday);
}

export async function createLeaveRequest(draft: LeaveRequestDraft): Promise<LeaveRequestRecord> {
  const employeeId = normalize(draft.employee_id);
  const startDate = normalize(draft.start_date);
  if (!employeeId || !startDate) {
    throw new Error('Employee and start date are required.');
  }

  if (isEmployeeUser()) {
    const linked = getLinkedEmployeeId();
    if (!linked || linked !== employeeId) {
      throw new Error('You can only submit time off for your own employee record.');
    }
  }

  const endDate = normalize(draft.end_date || '') || null;
  if (endDate && endDate < startDate) {
    throw new Error('End date cannot be before start date.');
  }

  const { data, error } = await supabaseClient
    .from('leave_requests')
    .insert([
      {
        employee_id: employeeId,
        leave_type: draft.leave_type || 'other',
        start_date: startDate,
        end_date: endDate,
        hours: draft.hours ?? null,
        intermittent: Boolean(draft.intermittent),
        notes: normalize(draft.notes) || null,
        status: 'requested',
        deduct_from_pto_balance: true,
        created_by: actorEmail(),
      },
    ])
    .select('*')
    .single();

  if (error) {
    console.error('[LeaveRequests] Create failed:', error);
    throw new Error(error.message || 'Could not create leave request.');
  }

  const record = mapRow((data || {}) as Record<string, unknown>);

  void supabaseClient.functions
    .invoke('notify-leave-request', {
      body: { leave_request_id: record.id },
    })
    .then(({ error: notifyErr }) => {
      if (notifyErr) {
        console.warn('[LeaveRequests] Notification email skipped:', notifyErr.message);
      }
    })
    .catch((notifyErr) => {
      console.warn('[LeaveRequests] Notification email failed:', notifyErr);
    });

  return record;
}

export async function approveLeaveRequest(
  requestId: string,
  options?: { setEmployeeLeaveStatus?: boolean; employeeName?: string }
): Promise<void> {
  const id = normalize(requestId);
  if (!id) return;

  if (isEmployeeUser()) {
    throw new Error('Only your supervisor or HR can approve time off.');
  }

  const { data: existing, error: loadError } = await supabaseClient
    .from('leave_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (loadError || !existing) {
    throw new Error('Leave request not found.');
  }

  const record = mapRow(existing as Record<string, unknown>);

  if (!canApproveLeaveRequest(record.employee_id)) {
    throw new Error('You can only approve time off for your direct reports.');
  }

  const approver = actorEmail();

  const { error } = await supabaseClient
    .from('leave_requests')
    .update({
      status: 'approved',
      approved_by: approver,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Could not approve leave request.');
  }

  const shouldSetLeave = options?.setEmployeeLeaveStatus !== false;
  const name = options?.employeeName || record.employee_id;

  if (shouldSetLeave && leaveOverlapsToday({ ...record, status: 'approved' })) {
    await supabaseClient
      .from('employees')
      .update({ status: 'Leave' })
      .eq('id', record.employee_id);
  }

  if (!record.payroll_notified) {
    const handoff = await createPayrollHandoff({
      employee_id: record.employee_id,
      change_type: 'status',
      effective_date: record.start_date,
      summary: `Leave approved (${leaveTypeLabel(record.leave_type)}) — ${name} · ${formatLeaveDateRange(record)}`,
      payload: {
        leave_request_id: record.id,
        leave_type: record.leave_type,
        start_date: record.start_date,
        end_date: record.end_date,
      },
    });

    if (handoff) {
      await supabaseClient
        .from('leave_requests')
        .update({ payroll_notified: true })
        .eq('id', id);
    }
  }
}

export async function denyLeaveRequest(requestId: string, notes?: string): Promise<void> {
  const id = normalize(requestId);
  if (!id) return;

  if (isEmployeeUser()) {
    throw new Error('Only your supervisor or HR can deny time off.');
  }

  const { data: existing, error: loadError } = await supabaseClient
    .from('leave_requests')
    .select('employee_id')
    .eq('id', id)
    .single();

  if (loadError || !existing) {
    throw new Error('Leave request not found.');
  }

  const employeeId = String((existing as { employee_id?: string }).employee_id || '');
  if (!canApproveLeaveRequest(employeeId)) {
    throw new Error('You can only deny time off for your direct reports.');
  }

  const patch: Record<string, unknown> = {
    status: 'denied',
    approved_by: actorEmail(),
    approved_at: new Date().toISOString(),
  };

  if (notes !== undefined) {
    patch.notes = notes;
  }

  const { error } = await supabaseClient.from('leave_requests').update(patch).eq('id', id);

  if (error) {
    throw new Error(error.message || 'Could not deny leave request.');
  }
}

export async function cancelLeaveRequest(requestId: string): Promise<void> {
  const id = normalize(requestId);
  if (!id) return;

  const { error } = await supabaseClient
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) {
    throw new Error(error.message || 'Could not cancel leave request.');
  }
}

export async function updateLeaveRequest(
  requestId: string,
  patch: Partial<Pick<LeaveRequestDraft, 'start_date' | 'end_date' | 'hours' | 'leave_type' | 'notes'>>
): Promise<LeaveRequestRecord> {
  const id = normalize(requestId);
  if (!id) throw new Error('Leave request id is required.');

  const update: Record<string, unknown> = {};
  if (patch.start_date !== undefined) update.start_date = normalize(patch.start_date);
  if (patch.end_date !== undefined) {
    update.end_date = normalize(patch.end_date || '') || null;
  }
  if (patch.hours !== undefined) update.hours = patch.hours;
  if (patch.leave_type !== undefined) update.leave_type = patch.leave_type;
  if (patch.notes !== undefined) update.notes = normalize(patch.notes) || null;

  if (!Object.keys(update).length) {
    throw new Error('Nothing to update.');
  }

  const { data, error } = await supabaseClient
    .from('leave_requests')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Could not update leave request.');
  }

  return mapRow((data || {}) as Record<string, unknown>);
}

export async function deleteLeaveRequest(requestId: string): Promise<void> {
  if (!isAdminUser()) {
    throw new Error('Only admins can delete leave requests.');
  }

  const id = normalize(requestId);
  if (!id) return;

  const { error } = await supabaseClient.from('leave_requests').delete().eq('id', id);

  if (error) {
    throw new Error(error.message || 'Could not delete leave request.');
  }
}

export function canManageLeaveRequests(): boolean {
  return isAdminUser() || isSupervisorUser();
}

export function canSubmitLeaveRequests(): boolean {
  return canManageLeaveRequests() || (isEmployeeUser() && Boolean(getLinkedEmployeeId()));
}

export function canApproveLeaveRequest(employeeId: string): boolean {
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const employees = (window.EMPLOYEES || window.ALL_EMPLOYEES || []) as Array<
    Record<string, unknown>
  >;
  const match = employees.find(
    (row) => String(row.id || row.employee_id || '').trim() === String(employeeId).trim()
  );
  if (!match) {
    return employeeMatchesSupervisorAccess({ id: employeeId });
  }
  return employeeMatchesSupervisorAccess(match);
}

export function employeeNameForLeave(employeeId: string): string {
  const employees = (window.EMPLOYEES || window.ALL_EMPLOYEES || []) as Array<
    Record<string, unknown>
  >;
  const match = employees.find(
    (row) => String(row.id || row.employee_id || '') === String(employeeId)
  );
  return match ? employeeDisplayName(match) : employeeId;
}
