import { findCareEmployeeById } from './careEmployeePicker';
import { recordAuditEvent } from './auditTrail';
import { employeeDisplayName } from './employeeUtils';

type AuditEmployee = Record<string, unknown>;

function asAuditEmployee(employeeId: string, employeeName = ''): AuditEmployee {
  const match = findCareEmployeeById(employeeId);
  if (match) {
    return match as AuditEmployee;
  }

  const name = String(employeeName || '').trim();
  return {
    id: employeeId,
    employee_id: employeeId,
    first_name: name || employeeId,
  };
}

export async function recordCareEmployeeAudit(
  action: string,
  employeeId: string,
  employeeName: string,
  details: string
): Promise<void> {
  const cleanDetails = String(details || '').trim();
  if (!cleanDetails) return;

  await recordAuditEvent(action, asAuditEmployee(employeeId, employeeName), cleanDetails);
}

export async function recordCareProgramAudit(action: string, details: string): Promise<void> {
  const cleanDetails = String(details || '').trim();
  if (!cleanDetails) return;

  await recordAuditEvent(
    action,
    asAuditEmployee('care-engagement', 'Care & Engagement'),
    cleanDetails
  );
}

export function formatCareEmployeeAuditLabel(employeeId: string, employeeName: string): string {
  const employee = findCareEmployeeById(employeeId);
  if (employee) {
    return employeeDisplayName(employee);
  }
  return employeeName || employeeId;
}
