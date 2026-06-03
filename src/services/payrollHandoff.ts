/**
 * Payroll handoff log — track changes communicated to external payroll.
 */

import { getCurrentUserAccess } from './access';
import { supabaseClient } from './supabaseClient';
import { employeeDisplayName } from './employeeUtils';

export type PayrollHandoffStatus = 'pending' | 'sent' | 'confirmed' | 'cancelled';

export type PayrollChangeType =
  | 'new_hire'
  | 'termination'
  | 'rate'
  | 'title'
  | 'department'
  | 'benefits'
  | 'status'
  | 'other';

export type PayrollHandoffRecord = {
  id: string;
  employee_id: string;
  change_type: PayrollChangeType;
  effective_date: string;
  summary: string;
  payload: Record<string, unknown>;
  status: PayrollHandoffStatus;
  sent_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export type PayrollHandoffDraft = {
  employee_id: string;
  change_type: PayrollChangeType;
  effective_date: string;
  summary: string;
  payload?: Record<string, unknown>;
};

const CHANGE_LABELS: Record<PayrollChangeType, string> = {
  new_hire: 'New hire',
  termination: 'Termination',
  rate: 'Pay type / rate',
  title: 'Title',
  department: 'Department',
  benefits: 'Benefits',
  status: 'Status',
  other: 'Other',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalize(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeStatus(value: unknown): string {
  return normalize(value).toUpperCase();
}

function createdByEmail(): string | null {
  const access = getCurrentUserAccess();
  const email = normalize(access?.email);
  return email || null;
}

function mapRow(row: Record<string, unknown>): PayrollHandoffRecord {
  return {
    id: String(row.id || ''),
    employee_id: String(row.employee_id || ''),
    change_type: String(row.change_type || 'other') as PayrollChangeType,
    effective_date: String(row.effective_date || '').slice(0, 10),
    summary: String(row.summary || ''),
    payload: (row.payload as Record<string, unknown>) || {},
    status: String(row.status || 'pending') as PayrollHandoffStatus,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
    confirmed_by: row.confirmed_by ? String(row.confirmed_by) : null,
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at || ''),
    created_by: row.created_by ? String(row.created_by) : null,
  };
}

export function payrollChangeTypeLabel(type: PayrollChangeType): string {
  return CHANGE_LABELS[type] || type;
}

export function payrollHandoffStatusLabel(status: PayrollHandoffStatus): string {
  if (status === 'pending') return 'Pending';
  if (status === 'sent') return 'Sent to payroll';
  if (status === 'confirmed') return 'Confirmed';
  return 'Cancelled';
}

export async function loadPayrollHandoffsForEmployee(
  employeeId: string
): Promise<PayrollHandoffRecord[]> {
  const id = normalize(employeeId);
  if (!id) return [];

  const { data, error } = await supabaseClient
    .from('payroll_handoffs')
    .select('*')
    .eq('employee_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[PayrollHandoff] Load failed:', error);
    throw new Error(error.message || 'Could not load payroll handoffs.');
  }

  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function loadPendingPayrollHandoffs(): Promise<PayrollHandoffRecord[]> {
  const { data, error } = await supabaseClient
    .from('payroll_handoffs')
    .select('*')
    .eq('status', 'pending')
    .order('effective_date', { ascending: true });

  if (error) {
    console.error('[PayrollHandoff] Pending load failed:', error);
    return [];
  }

  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

async function hasPendingHandoff(
  employeeId: string,
  changeType: PayrollChangeType
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('payroll_handoffs')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('change_type', changeType)
    .eq('status', 'pending')
    .limit(1);

  if (error) {
    console.warn('[PayrollHandoff] Duplicate check failed:', error);
    return false;
  }

  return Boolean(data?.length);
}

export async function createPayrollHandoff(
  draft: PayrollHandoffDraft
): Promise<PayrollHandoffRecord | null> {
  const employeeId = normalize(draft.employee_id);
  if (!employeeId) return null;

  if (await hasPendingHandoff(employeeId, draft.change_type)) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('payroll_handoffs')
    .insert([
      {
        employee_id: employeeId,
        change_type: draft.change_type,
        effective_date: draft.effective_date || todayIso(),
        summary: draft.summary,
        payload: draft.payload || {},
        status: 'pending',
        created_by: createdByEmail(),
      },
    ])
    .select('*')
    .single();

  if (error) {
    console.error('[PayrollHandoff] Create failed:', error);
    throw new Error(error.message || 'Could not log payroll handoff.');
  }

  return mapRow((data || {}) as Record<string, unknown>);
}

export async function updatePayrollHandoffStatus(
  handoffId: string,
  status: PayrollHandoffStatus,
  notes?: string
): Promise<void> {
  const id = normalize(handoffId);
  if (!id) return;

  const patch: Record<string, unknown> = { status };

  if (notes !== undefined) {
    patch.notes = notes;
  }

  if (status === 'sent') {
    patch.sent_at = new Date().toISOString();
  }

  if (status === 'confirmed') {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by = createdByEmail();
    if (!patch.sent_at) {
      patch.sent_at = patch.confirmed_at;
    }
  }

  const { error } = await supabaseClient.from('payroll_handoffs').update(patch).eq('id', id);

  if (error) {
    console.error('[PayrollHandoff] Status update failed:', error);
    throw new Error(error.message || 'Could not update handoff.');
  }
}

export function detectPayrollHandoffDrafts(input: {
  employeeId: string;
  employeeName: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): PayrollHandoffDraft[] {
  const employeeId = normalize(input.employeeId);
  const name = normalize(input.employeeName) || employeeId;
  const before = input.before;
  const after = input.after;
  const drafts: PayrollHandoffDraft[] = [];

  const beforeStatus = normalizeStatus(before.status);
  const afterStatus = normalizeStatus(after.status);

  if (afterStatus === 'TERMINATED' && beforeStatus !== 'TERMINATED') {
    drafts.push({
      employee_id: employeeId,
      change_type: 'termination',
      effective_date:
        normalize(after.termination_date) || normalize(after.terminationDate) || todayIso(),
      summary: `Termination — ${name}`,
      payload: {
        from_status: beforeStatus,
        to_status: afterStatus,
        termination_date: after.termination_date || after.terminationDate || null,
      },
    });
  } else if (afterStatus && beforeStatus && afterStatus !== beforeStatus && afterStatus !== 'TERMINATED') {
    drafts.push({
      employee_id: employeeId,
      change_type: 'status',
      effective_date: todayIso(),
      summary: `Status ${beforeStatus || '—'} → ${afterStatus} — ${name}`,
      payload: { from: beforeStatus, to: afterStatus },
    });
  }

  const fieldMap: Array<{
    key: string;
    change_type: PayrollChangeType;
    label: string;
  }> = [
    { key: 'department', change_type: 'department', label: 'Department' },
    { key: 'position', change_type: 'title', label: 'Title' },
    { key: 'pay_type', change_type: 'rate', label: 'Pay type' },
    { key: 'benefits_status', change_type: 'benefits', label: 'Benefits' },
  ];

  fieldMap.forEach(({ key, change_type, label }) => {
    const prev = normalize(before[key]);
    const next = normalize(after[key]);
    if (!next || prev === next) return;

    drafts.push({
      employee_id: employeeId,
      change_type,
      effective_date: todayIso(),
      summary: `${label}: ${prev || '—'} → ${next} — ${name}`,
      payload: { field: key, from: prev || null, to: next },
    });
  });

  return drafts;
}

export async function logPayrollHandoffsFromEmployeeSave(input: {
  employeeId: string;
  employee?: Record<string, unknown> | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<number> {
  const employee =
    input.employee ||
    ((window.EMPLOYEES || []) as Array<Record<string, unknown>>).find(
      (row) => String(row.id || row.employee_id || '') === input.employeeId
    );

  const name = employee ? employeeDisplayName(employee) : input.employeeId;
  const drafts = detectPayrollHandoffDrafts({
    employeeId: input.employeeId,
    employeeName: name,
    before: input.before,
    after: input.after,
  });

  let created = 0;

  for (const draft of drafts) {
    const row = await createPayrollHandoff(draft);
    if (row) created += 1;
  }

  return created;
}

export function employeeToPayrollSnapshot(
  employee: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!employee) return {};

  return {
    status: employee.status || employee.displayStatus || employee.employee_status,
    department: employee.department || employee.dept,
    position: employee.position,
    pay_type: employee.pay_type || employee.payType,
    benefits_status: employee.benefits_status || employee.benefitsStatus,
    termination_date: employee.termination_date || employee.terminationDate,
  };
}

export async function logNewHirePayrollHandoff(
  employeeId: string,
  employeeName: string,
  hireDate?: string
): Promise<PayrollHandoffRecord | null> {
  return createPayrollHandoff({
    employee_id: employeeId,
    change_type: 'new_hire',
    effective_date: normalize(hireDate) || todayIso(),
    summary: `New hire — ${employeeName}`,
    payload: { hire_date: hireDate || todayIso() },
  });
}
