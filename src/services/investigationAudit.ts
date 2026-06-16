import { supabaseClient } from './supabaseClient';
import {
  type Investigation,
  formatInvestigationLabel,
} from '../types/investigationsTypes';
import { resolveInvestigatorEmail } from './investigationsAccess';

export async function recordInvestigationAudit(
  actionType: string,
  investigation: Investigation | null | undefined,
  details = ''
): Promise<void> {
  const investigationId = String(investigation?.id || '').trim();
  const cleanDetails = String(details || '').trim();

  if (!investigationId && !cleanDetails) {
    return;
  }

  const employeeId = String(
    investigation?.targeted_employee_id || investigation?.primary_employee_id || ''
  ).trim();
  const caseLabel = String(investigation?.case_number || investigation?.title || 'Investigation').trim();

  const payload = {
    employee_id: employeeId || 'investigation',
    employee_name: caseLabel,
    action_type: String(actionType || 'investigation_update').trim(),
    fields_changed: [{ summary: cleanDetails || actionType }],
    changed_at: new Date().toISOString(),
    changed_by: (await resolveInvestigatorEmail()) || 'Current user',
    metadata: {
      details: cleanDetails,
      investigation_id: investigationId,
      case_number: investigation?.case_number || null,
      userRole: (window as { currentUserRole?: string }).currentUserRole || 'admin',
    },
  };

  const { error } = await supabaseClient.from('employee_audit_logs').insert([payload]);

  if (error) {
    console.warn('[Investigations] Audit insert failed:', error);
  }
}

export function summarizeInvestigationChanges(
  before: Investigation | null,
  after: Investigation
): string {
  const fields: [string, keyof Investigation][] = [
    ['Status', 'status'],
    ['Severity', 'severity'],
    ['Title', 'title'],
    ['Category', 'category'],
    ['Outcome', 'outcome'],
    ['Targeted employee', 'targeted_employee_id'],
    ['Investigator', 'assigned_investigator_name'],
  ];

  return fields
    .map(([label, key]) => {
      const oldValue = String(before?.[key] ?? '').trim();
      const newValue = String(after[key] ?? '').trim();
      if (oldValue === newValue) return '';
      const display = (val: string) =>
        key === 'status' || key === 'category' || key === 'outcome' || key === 'severity'
          ? formatInvestigationLabel(val)
          : val || '—';
      return `${label}: ${display(oldValue)} → ${display(newValue)}`;
    })
    .filter(Boolean)
    .join(' | ');
}
