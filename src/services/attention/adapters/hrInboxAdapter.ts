import type { HrInboxItem, HrInboxKind, HrInboxRoute, HrInboxSeverity } from '../../hrInbox';
import { mapLegacyInboxSeverity } from '../severity';
import type { AttentionItem, AttentionRoute, AttentionSeverity } from '../types';

export const PHASE3_ATTENTION_CATEGORIES = new Set([
  'performance_review',
  'discipline',
  'meeting',
  'candidate',
  'employee_record',
]);

const CATEGORY_TO_INBOX_KIND: Record<string, HrInboxKind> = {
  performance_review: 'performance_review',
  discipline: 'discipline',
  meeting: 'meeting',
  candidate: 'candidate_interview',
  employee_record: 'employee_missing_info',
};

export function attentionSeverityToInboxSeverity(
  severity: AttentionSeverity
): HrInboxSeverity {
  if (severity === 'critical' || severity === 'high') return 'overdue';
  if (severity === 'upcoming' || severity === 'normal') return 'due_soon';
  return 'info';
}

function attentionRouteToInboxRoute(route: AttentionRoute): HrInboxRoute {
  if (route.type === 'candidate') {
    return { type: 'view', viewId: 'candidatesView' };
  }
  return route as HrInboxRoute;
}

export function attentionItemToHrInboxItem(item: AttentionItem): HrInboxItem {
  const kind = CATEGORY_TO_INBOX_KIND[item.category] || 'operations';

  return {
    id: item.id,
    kind,
    severity: attentionSeverityToInboxSeverity(item.severity),
    title: item.title,
    detail: item.explanation,
    employeeName: item.employeeName || '—',
    dueDate: item.dueDate || null,
    route: attentionRouteToInboxRoute(item.route),
  };
}

export function attentionItemsToHrInboxItems(items: AttentionItem[]): HrInboxItem[] {
  return items.map(attentionItemToHrInboxItem);
}

export function hrInboxItemToAttentionItem(item: HrInboxItem, evaluatedAt: string): AttentionItem {
  return {
    id: item.id,
    dedupeKey: item.id,
    category: item.kind === 'performance_review' ? 'performance_review' : 'other',
    severity: mapLegacyInboxSeverity(item.severity),
    status: item.severity === 'overdue' ? 'overdue' : 'open',
    title: item.title,
    explanation: item.detail,
    employeeName: item.employeeName,
    dueDate: item.dueDate,
    sourceType: 'other',
    sourceId: item.id,
    recommendedAction: 'Review and take action in Orbis.',
    route: item.route as AttentionRoute,
    evaluatedAt,
  };
}

export function isPhase3InboxKind(kind: HrInboxKind): boolean {
  return (
    kind === 'performance_review' ||
    kind === 'discipline' ||
    kind === 'meeting' ||
    kind === 'candidate_interview' ||
    kind === 'employee_missing_info'
  );
}
