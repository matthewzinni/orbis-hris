// Local audit trail (legacy localStorage bridge)

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

export function recordAuditEvent(
  action: string,
  employee: EmployeeRow | null | undefined,
  details = ''
): void {
  try {
    const cleanDetails = String(details || '').trim();
    if (!cleanDetails || cleanDetails === 'Blank → Blank') {
      console.warn('Skipped empty audit log entry.');
      return;
    }

    const audit = getAuditTrail();
    const entry: AuditEntry = {
      action,
      employeeId: String(employee?.id || employee?.dbId || ''),
      employeeName: employee
        ? `${employee.first || employee.first_name || ''} ${employee.last || employee.last_name || ''}`.trim()
        : '',
      details: cleanDetails,
      userRole: window.currentUserRole || 'user',
      timestamp: new Date().toISOString(),
    };

    audit.unshift(entry);
    localStorage.setItem('btw_hris_audit_trail', JSON.stringify(audit.slice(0, 75)));
  } catch (err) {
    console.error('Could not write audit trail.', err);
  }
}

declare global {
  interface Window {
    getAuditTrail?: () => AuditEntry[];
    buildEmployeeChangeLog?: (oldEmployee: EmployeeRow, newEmployee: EmployeeRow) => string;
    recordAuditEvent?: (
      action: string,
      employee: EmployeeRow | null | undefined,
      details?: string
    ) => void;
  }
}

window.getAuditTrail = getAuditTrail;
window.buildEmployeeChangeLog = buildEmployeeChangeLog;
window.recordAuditEvent = recordAuditEvent;
