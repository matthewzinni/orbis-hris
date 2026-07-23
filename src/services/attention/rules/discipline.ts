import { canQueryDisciplineReports, isAdminUser, isSupervisorUser } from '../../access';
import { getEmployeeById, getEmployees, loadEmployees } from '../../../modules/employees';
import { supabaseClient } from '../../supabaseClient';
import { isOpenDisciplineStatus } from '../../hrIntelligence';
import { employeeDisplayName } from '../../employeeUtils';
import { buildAttentionDedupeKey } from '../dedupe';
import type { AttentionItem } from '../types';
import { drawerEmployeeId, evaluationTimestamp } from '../utils';

type DisciplineRow = {
  id?: string | number;
  employee_id?: string;
  issue_type?: string;
  report_status?: string;
  follow_up_date?: string | null;
};

function resolveEmployee(refId: string): Record<string, unknown> | undefined {
  const trimmed = String(refId || '').trim();
  if (!trimmed) return undefined;

  const direct = getEmployeeById(trimmed);
  if (direct) return direct as Record<string, unknown>;

  return getEmployees().find((employee) => {
    const ids = [employee.employee_id, employee.displayId, employee.id, employee.dbId]
      .filter(Boolean)
      .map(String);
    return ids.includes(trimmed);
  }) as Record<string, unknown> | undefined;
}

export async function collectDisciplineAttentionItems(): Promise<AttentionItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) return [];
  if (!canQueryDisciplineReports()) return [];

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[Attention] Could not load employees for discipline rule:', err);
    }
  }

  const { data, error } = await supabaseClient
    .from('discipline_reports')
    .select('id, employee_id, issue_type, report_status, follow_up_date');

  if (error) {
    console.warn('[Attention] Discipline query failed:', error.message || error);
    return [];
  }

  const evaluatedAt = evaluationTimestamp();
  const items: AttentionItem[] = [];

  (data || []).forEach((row: DisciplineRow) => {
    if (!isOpenDisciplineStatus(row.report_status)) return;

    const sourceId = String(row.id || '').trim();
    if (!sourceId) return;

    const employee = resolveEmployee(String(row.employee_id || ''));
    const employeeId = employee ? drawerEmployeeId(employee) : '';
    const name = employee ? employeeDisplayName(employee) : 'Employee';
    const issue = String(row.issue_type || 'Discipline').trim() || 'Open case';
    const dedupeKey = buildAttentionDedupeKey('discipline', 'discipline_report', sourceId);

    items.push({
      id: dedupeKey,
      dedupeKey,
      category: 'discipline',
      severity: 'normal',
      status: 'open',
      title: `Open discipline — ${name}`,
      explanation: issue,
      employeeId: employeeId || undefined,
      employeeName: name,
      responsibleRole: 'supervisor',
      dueDate: row.follow_up_date || null,
      sourceType: 'discipline_report',
      sourceId,
      recommendedAction: 'Review the discipline record and schedule follow-up or closure.',
      route: employeeId
        ? { type: 'employee', employeeId, drawerTab: 'discipline' }
        : { type: 'view', viewId: 'dashboardView' },
      evaluatedAt,
    });
  });

  return items;
}
