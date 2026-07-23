import {
  getSupervisorDepartmentScope,
  isAdminUser,
  isSupervisorUser,
} from '../../access';
import { parseDueDate } from '../../employeeUtils';
import { supabaseClient } from '../../supabaseClient';
import { buildAttentionDedupeKey } from '../dedupe';
import { severityFromDaysUntilDue, statusFromDueDate } from '../severity';
import type { AttentionItem } from '../types';
import { daysUntil, evaluationTimestamp, isoDateFromValue, todayIsoDate } from '../utils';

type CandidateRow = {
  id?: string;
  first_name?: string;
  last_name?: string;
  department?: string | null;
  position?: string | null;
  stage?: string | null;
  interview_date?: string | null;
  interview_status?: string | null;
  interview_type?: string | null;
  linked_employee_id?: string | null;
};

const AWAITING_INTERVIEW_STATUSES = new Set([
  'scheduled',
  'pending',
  'confirmed',
  'awaiting confirmation',
  'needs confirmation',
]);

const CLOSED_STAGES = new Set(['hired', 'rejected', 'withdrawn', 'declined', 'archived']);

function candidateDisplayName(row: CandidateRow): string {
  return `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim() || 'Candidate';
}

function candidateInScope(row: CandidateRow): boolean {
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const department = String(row.department || '').trim();
  if (!department) return false;
  return getSupervisorDepartmentScope().includes(department);
}

function interviewNeedsAction(row: CandidateRow, today: string): boolean {
  const stage = String(row.stage || '').trim().toLowerCase();
  if (CLOSED_STAGES.has(stage)) return false;
  if (String(row.linked_employee_id || '').trim()) return false;

  const interviewDate = isoDateFromValue(row.interview_date);
  if (!interviewDate) return false;

  const status = String(row.interview_status || '').trim().toLowerCase();
  if (status && !AWAITING_INTERVIEW_STATUSES.has(status) && status !== 'completed') {
    return false;
  }

  const days = daysUntil(interviewDate);
  if (days === null) return false;

  // Interview today or overdue without disposition
  return days <= 0;
}

export async function collectCandidateInterviewAttentionItems(): Promise<AttentionItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) return [];

  const today = todayIsoDate();
  const { data, error } = await supabaseClient
    .from('candidates')
    .select(
      'id, first_name, last_name, department, position, stage, interview_date, interview_status, interview_type, linked_employee_id'
    )
    .not('interview_date', 'is', null);

  if (error) {
    console.warn('[Attention] Candidates query failed:', error.message || error);
    return [];
  }

  const evaluatedAt = evaluationTimestamp();
  const items: AttentionItem[] = [];

  (data || []).forEach((row: CandidateRow) => {
    if (!candidateInScope(row)) return;
    if (!interviewNeedsAction(row, today)) return;

    const sourceId = String(row.id || '').trim();
    if (!sourceId) return;

    const name = candidateDisplayName(row);
    const interviewDate = isoDateFromValue(row.interview_date);
    const days = daysUntil(interviewDate);
    const interviewType = String(row.interview_type || 'Interview').trim() || 'Interview';
    const dedupeKey = buildAttentionDedupeKey('candidate', 'candidate', sourceId, 'interview');

    const title =
      days !== null && days < 0
        ? `Interview follow-up needed — ${name}`
        : `Interview today — ${name}`;

    items.push({
      id: dedupeKey,
      dedupeKey,
      category: 'candidate',
      severity: severityFromDaysUntilDue(days),
      status: statusFromDueDate(interviewDate, days),
      title,
      explanation: `${interviewType} · ${String(row.stage || 'Pipeline').trim()} · ${parseDueDate(interviewDate)?.toLocaleDateString() || interviewDate}`,
      candidateId: sourceId,
      employeeName: name,
      responsibleRole: isAdminUser() ? 'admin' : 'supervisor',
      dueDate: interviewDate,
      sourceType: 'candidate',
      sourceId,
      recommendedAction: 'Update interview status or move the candidate to the next pipeline stage.',
      route: { type: 'candidate', candidateId: sourceId, drawerTab: 'interview' },
      evaluatedAt,
    });
  });

  return items;
}
