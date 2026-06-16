// Employee audit trail — Supabase primary, localStorage fallback

import { supabaseClient } from './supabaseClient';

type EmployeeRow = Record<string, unknown>;

export type AuditEntry = {
  action: string;
  employeeId: string;
  employeeName: string;
  details: string;
  userRole: string;
  timestamp: string;
};

function normalizeEmployee(row: EmployeeRow): EmployeeRow {
  if (typeof window.normalizeEmployee === 'function') {
    return window.normalizeEmployee(row) as EmployeeRow;
  }
  return row;
}

function getEmployeeDisplayName(employee: EmployeeRow | null | undefined): string {
  if (!employee) {
    return '';
  }

  if (typeof window.employeeDisplayName === 'function') {
    return window.employeeDisplayName(employee as Parameters<typeof window.employeeDisplayName>[0]);
  }

  return `${employee.first || employee.first_name || ''} ${employee.last || employee.last_name || ''}`.trim();
}

function writeLocalAuditEntry(entry: AuditEntry): void {
  try {
    const raw = localStorage.getItem('btw_hris_audit_trail');
    const audit = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(audit) ? (audit as AuditEntry[]) : [];
    list.unshift(entry);
    localStorage.setItem('btw_hris_audit_trail', JSON.stringify(list.slice(0, 75)));
  } catch (err) {
    console.warn('[Audit] Could not write local audit fallback:', err);
  }
}

async function writeSupabaseAuditEntry(
  action: string,
  employee: EmployeeRow | null | undefined,
  details: string
): Promise<boolean> {
  const employeeId = String(employee?.id || employee?.dbId || employee?.employee_id || '').trim();

  if (!employeeId) {
    return false;
  }

  const payload = {
    employee_id: employeeId,
    employee_name: getEmployeeDisplayName(employee),
    action_type: String(action || 'employee_update').trim(),
    fields_changed: [{ summary: details }],
    changed_at: new Date().toISOString(),
    changed_by:
      String(
        (window as { currentUser?: { email?: string } }).currentUser?.email ||
          window.currentUserEmail ||
          'Current user'
      ).trim() || 'Current user',
    metadata: { details, userRole: window.currentUserRole || 'user' },
  };

  const { error } = await supabaseClient.from('employee_audit_logs').insert([payload]);

  if (error) {
    console.warn('[Audit] Supabase audit insert failed:', error);
    return false;
  }

  return true;
}

export function getAuditTrail(): AuditEntry[] {
  try {
    const raw = localStorage.getItem('btw_hris_audit_trail');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function buildEmployeeChangeLog(
  oldEmployee: EmployeeRow,
  newEmployee: EmployeeRow
): string {
  const oldData = normalizeEmployee(oldEmployee || {});
  const newData = normalizeEmployee(newEmployee || {});

  const fields: [string, string][] = [
    ['Status', 'status'],
    ['First Name', 'first_name'],
    ['Last Name', 'last_name'],
    ['Department', 'department'],
    ['Position', 'position'],
    ['Supervisor', 'supervisor'],
    ['Pay Type', 'pay_type'],
    ['Standard Hours', 'standard_hours'],
    ['Benefits Status', 'benefits_status'],
    ['Hire Date', 'hire_date'],
    ['Next Review Date', 'next_review_date'],
    ['Anniversary Date', 'anniversary_date'],
    ['Tenure Bracket', 'tenure_bracket'],
    ['Work Email', 'work_email'],
    ['Personal Email', 'personal_email'],
    ['Phone', 'phone'],
  ];

  const formatValue = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text || 'Blank';
  };

  return fields
    .map(([label, key]) => {
      const oldValue = formatValue(oldData[key]);
      const newValue = formatValue(newData[key]);
      return oldValue !== newValue ? `${label}: ${oldValue} → ${newValue}` : '';
    })
    .filter(Boolean)
    .join(' | ');
}

export async function recordAuditEvent(
  action: string,
  employee: EmployeeRow | null | undefined,
  details = ''
): Promise<void> {
  const cleanDetails = String(details || '').trim();

  if (!cleanDetails || cleanDetails === 'Blank → Blank') {
    console.warn('Skipped empty audit log entry.');
    return;
  }

  const entry: AuditEntry = {
    action,
    employeeId: String(employee?.id || employee?.dbId || employee?.employee_id || ''),
    employeeName: getEmployeeDisplayName(employee),
    details: cleanDetails,
    userRole: window.currentUserRole || 'user',
    timestamp: new Date().toISOString(),
  };

  const savedToSupabase = await writeSupabaseAuditEntry(action, employee, cleanDetails);

  if (!savedToSupabase) {
    writeLocalAuditEntry(entry);
  }
}

window.getAuditTrail = getAuditTrail;
window.buildEmployeeChangeLog = buildEmployeeChangeLog;
window.recordAuditEvent = recordAuditEvent;
