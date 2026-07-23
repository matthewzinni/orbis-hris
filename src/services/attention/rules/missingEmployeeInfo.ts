import {
  employeeMatchesSupervisorAccess,
  isAdminUser,
  isSupervisorUser,
} from '../../access';
import {
  employeeDisplayName,
  isActiveDashboardEmployee,
} from '../../employeeUtils';
import { getActiveEmployees, getEmployees, loadEmployees } from '../../../modules/employees';
import { supabaseClient } from '../../supabaseClient';
import { buildAttentionDedupeKey } from '../dedupe';
import type { AttentionItem } from '../types';
import { drawerEmployeeId, evaluationTimestamp } from '../utils';

type MissingField = 'supervisor' | 'department' | 'position' | 'emergency_contact';

function employeeInScope(employee: Record<string, unknown>): boolean {
  if (isAdminUser()) return true;
  return employeeMatchesSupervisorAccess(employee);
}

function missingFieldsForEmployee(
  employee: Record<string, unknown>,
  hasEmergencyContact: boolean
): MissingField[] {
  const missing: MissingField[] = [];

  if (!String(employee.supervisor || employee.displaySupervisor || '').trim()) {
    missing.push('supervisor');
  }
  if (!String(employee.department || employee.dept || '').trim()) {
    missing.push('department');
  }
  if (!String(employee.position || '').trim()) {
    missing.push('position');
  }
  if (!hasEmergencyContact) {
    missing.push('emergency_contact');
  }

  return missing;
}

function missingFieldLabel(field: MissingField): string {
  switch (field) {
    case 'supervisor':
      return 'Supervisor assignment';
    case 'department':
      return 'Department';
    case 'position':
      return 'Job title';
    case 'emergency_contact':
      return 'Emergency contact';
    default:
      return field;
  }
}

export async function collectMissingEmployeeInfoAttentionItems(): Promise<AttentionItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) return [];

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[Attention] Could not load employees for missing-info rule:', err);
    }
  }

  const scopedEmployees = getActiveEmployees().filter((employee) => {
    if (!isActiveDashboardEmployee(employee)) return false;
    return employeeInScope(employee as Record<string, unknown>);
  }) as Record<string, unknown>[];

  const employeeIds = scopedEmployees
    .map((employee) => drawerEmployeeId(employee))
    .filter(Boolean);

  const emergencyContactIds = new Set<string>();

  if (employeeIds.length) {
    const chunkSize = 100;
    for (let index = 0; index < employeeIds.length; index += chunkSize) {
      const chunk = employeeIds.slice(index, index + chunkSize);
      const { data, error } = await supabaseClient
        .from('emergency_contacts')
        .select('employee_id')
        .in('employee_id', chunk);

      if (error) {
        console.warn('[Attention] Emergency contacts query failed:', error.message || error);
        continue;
      }

      (data || []).forEach((row: { employee_id?: string }) => {
        const id = String(row.employee_id || '').trim();
        if (id) emergencyContactIds.add(id);
      });
    }
  }

  const evaluatedAt = evaluationTimestamp();
  const items: AttentionItem[] = [];

  scopedEmployees.forEach((employee) => {
    const employeeId = drawerEmployeeId(employee);
    if (!employeeId) return;

    const missing = missingFieldsForEmployee(employee, emergencyContactIds.has(employeeId));
    if (!missing.length) return;

    const name = employeeDisplayName(employee);
    const primary = missing[0];
    const dedupeKey = buildAttentionDedupeKey(
      'employee_record',
      'employee',
      employeeId,
      missing.sort().join('|')
    );

    items.push({
      id: dedupeKey,
      dedupeKey,
      category: 'employee_record',
      severity: missing.includes('emergency_contact') ? 'high' : 'normal',
      status: 'open',
      title: `Incomplete employee record — ${name}`,
      explanation: `Missing: ${missing.map(missingFieldLabel).join(', ')}`,
      employeeId,
      employeeName: name,
      responsibleRole: isAdminUser() ? 'admin' : 'supervisor',
      sourceType: 'employee',
      sourceId: employeeId,
      recommendedAction:
        primary === 'emergency_contact'
          ? 'Add an emergency contact on the Emergency tab.'
          : 'Complete missing fields on the Employee Admin tab.',
      route: {
        type: 'employee',
        employeeId,
        drawerTab: primary === 'emergency_contact' ? 'emergency' : 'employee',
      },
      evaluatedAt,
    });
  });

  return items;
}
