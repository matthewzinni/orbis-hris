import {
  employeeMatchesPerformanceReviewScope,
  hasOrgWidePerformanceReviewAccess,
  isAdminUser,
  isSupervisorUser,
} from '../../access';
import {
  buildPerformanceReviewDueCandidates,
  formatPerformanceReviewDueDetail,
} from '../../performanceReviewDue';
import { buildAttentionDedupeKey } from '../dedupe';
import { severityFromDaysUntilDue, statusFromDueDate } from '../severity';
import type { AttentionItem } from '../types';
import { daysUntil, drawerEmployeeId, evaluationTimestamp, isoDateFromValue } from '../utils';

export async function collectPerformanceReviewAttentionItems(): Promise<AttentionItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) return [];

  const candidates = await buildPerformanceReviewDueCandidates();
  const evaluatedAt = evaluationTimestamp();

  return candidates.map((candidate) => {
    const days = daysUntil(candidate.dueDate);
    const employeeId = drawerEmployeeId({ id: candidate.employeeId });
    const dedupeKey = buildAttentionDedupeKey(
      'performance_review',
      'employee_review',
      employeeId,
      `${candidate.periodKind}:${candidate.dueDate}`
    );

    return {
      id: dedupeKey,
      dedupeKey,
      category: 'performance_review',
      severity: severityFromDaysUntilDue(days),
      status: statusFromDueDate(candidate.dueDate, days),
      title: `${candidate.reviewTypeLabel} — ${candidate.employeeName}`,
      explanation: formatPerformanceReviewDueDetail(candidate),
      employeeId,
      employeeName: candidate.employeeName,
      responsibleRole: hasOrgWidePerformanceReviewAccess() ? 'hr_leadership' : 'supervisor',
      dueDate: isoDateFromValue(candidate.dueDate),
      sourceType: 'employee_review',
      sourceId: employeeId,
      recommendedAction: 'Open the employee drawer and complete the performance review.',
      route: {
        type: 'employee',
        employeeId,
        drawerTab: 'reviews',
      },
      evaluatedAt,
    } satisfies AttentionItem;
  });
}

/** Scope guard used when attaching employee context to an attention item. */
export function employeeInPerformanceReviewAttentionScope(
  employee: Record<string, unknown> | null | undefined
): boolean {
  if (!employee) return false;
  if (hasOrgWidePerformanceReviewAccess()) return true;
  return employeeMatchesPerformanceReviewScope(employee);
}
