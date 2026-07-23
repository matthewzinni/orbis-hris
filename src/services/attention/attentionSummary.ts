import { getCurrentAuthEmail } from '../accessScopes';
import {
  buildAttentionWorkspace,
  invalidateAttentionWorkspaceCache,
  isAttentionItemDueSoon,
  isAttentionItemDueToday,
  isAttentionItemHighPriority,
} from './buildAttentionWorkspace';
import { syncAttentionSummaryKpis } from './attentionWorkspaceAlerts';
import type { AttentionItem, AttentionSummary, AttentionWorkspace } from './types';

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

export async function buildAttentionSummary(force = false): Promise<AttentionSummary> {
  const workspace = await buildAttentionWorkspace(force);
  return summarizeAttentionItems(workspace.items);
}

export async function loadAttentionSummary(force = false): Promise<AttentionSummary> {
  const workspace = await buildAttentionWorkspace(force);
  const summary = summarizeAttentionItems(workspace.items);

  window.__attentionWorkspaceCache = workspace;
  window.__attentionSummaryCache = summary;

  syncAttentionSummaryKpis(summary, workspace.items);

  if (typeof window.updateWorkspaceAlerts === 'function') {
    window.updateWorkspaceAlerts();
  }

  return summary;
}

export function getCachedAttentionWorkspace(): AttentionWorkspace | null {
  return window.__attentionWorkspaceCache || null;
}

export function getCachedAttentionSummary(): AttentionSummary | null {
  return window.__attentionSummaryCache || null;
}

window.buildAttentionSummary = buildAttentionSummary;
window.loadAttentionSummary = loadAttentionSummary;
window.getCachedAttentionWorkspace = getCachedAttentionWorkspace;
window.getCachedAttentionSummary = getCachedAttentionSummary;
window.invalidateAttentionWorkspaceCache = invalidateAttentionWorkspaceCache;
