import { getCurrentAuthEmail } from '../accessScopes';
import {
  buildAttentionWorkspace,
  isAttentionItemDueSoon,
  isAttentionItemDueToday,
  isAttentionItemHighPriority,
} from './buildAttentionWorkspace';
import type { AttentionItem, AttentionSummary } from './types';

export function summarizeAttentionItems(items: AttentionItem[]): AttentionSummary {
  const openItems = items.filter(
    (item) => item.status !== 'resolved' && item.status !== 'dismissed'
  );

  return {
    totalOpen: openItems.length,
    overdue: openItems.filter((item) => item.status === 'overdue').length,
    dueToday: openItems.filter((item) => isAttentionItemDueToday(item)).length,
    dueSoon: openItems.filter((item) => isAttentionItemDueSoon(item)).length,
    highPriority: openItems.filter((item) => isAttentionItemHighPriority(item)).length,
    assignedToCurrentUser: countAssignedToCurrentUser(openItems),
  };
}

function countAssignedToCurrentUser(items: AttentionItem[]): number {
  const email = getCurrentAuthEmail();
  if (!email) return 0;

  // Until explicit assignment exists, supervisors see team items as assigned queue work.
  return items.filter((item) => item.responsibleRole === 'supervisor' || item.responsibleRole === 'admin')
    .length;
}

export async function buildAttentionSummary(): Promise<AttentionSummary> {
  const workspace = await buildAttentionWorkspace();
  return summarizeAttentionItems(workspace.items);
}

export async function loadAttentionSummary(): Promise<AttentionSummary> {
  return buildAttentionSummary();
}

window.buildAttentionSummary = buildAttentionSummary;
window.loadAttentionSummary = loadAttentionSummary;
