import { supabaseClient } from '../services/supabaseClient';
import {
  resolveInvestigatorDisplayName,
  resolveInvestigatorEmail,
} from '../services/investigationsAccess';
import type { InvestigationTimelineEvent } from '../types/investigationsTypes';
import { formatInvestigationLabel } from '../types/investigationsTypes';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const TIMELINE_LABELS: Record<string, string> = {
  case_opened: 'Case opened',
  complainant_interviewed: 'Complainant interviewed',
  respondent_interviewed: 'Respondent interviewed',
  witness_interviewed: 'Witness interviewed',
  supervisor_interviewed: 'Supervisor interviewed',
  evidence_reviewed: 'Evidence reviewed',
  findings_drafted: 'Findings drafted',
  action_recommended: 'Action recommended',
  case_closed: 'Case closed',
  status_changed: 'Status changed',
  note_added: 'Note added',
  interview_added: 'Interview added',
  evidence_added: 'Evidence added',
};

export async function recordInvestigationTimelineEvent(
  investigationId: string,
  eventType: string,
  note = ''
): Promise<void> {
  const email = await resolveInvestigatorEmail();
  if (!email || !investigationId) return;

  const payload = {
    investigation_id: investigationId,
    event_type: eventType,
    note: note || null,
    actor_email: email,
    actor_name: resolveInvestigatorDisplayName(),
  };

  const { error } = await supabaseClient.from('investigation_timeline').insert(payload);

  if (error) {
    console.warn('[Investigations] Timeline insert failed:', error);
  }
}

export async function loadInvestigationTimeline(
  investigationId: string
): Promise<InvestigationTimelineEvent[]> {
  const { data, error } = await supabaseClient
    .from('investigation_timeline')
    .select('*')
    .eq('investigation_id', investigationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Investigations] Timeline load failed:', error);
    return [];
  }

  return (data || []) as InvestigationTimelineEvent[];
}

export function renderInvestigationTimeline(
  container: HTMLElement | null,
  events: InvestigationTimelineEvent[]
): void {
  if (!container) return;

  if (!events.length) {
    container.innerHTML = '<div class="empty">Timeline will populate as you work the case.</div>';
    return;
  }

  container.innerHTML = events
    .map((event) => {
      const label =
        TIMELINE_LABELS[String(event.event_type || '')] ||
        formatInvestigationLabel(String(event.event_type || 'update'));
      const when = event.created_at
        ? new Date(String(event.created_at)).toLocaleString()
        : '';
      const actor = event.actor_name || event.actor_email || 'HR';

      return `
        <div class="history-item">
          <div class="history-body">
            <strong>${escapeHtml(label)}</strong>
            <div class="muted">${escapeHtml(actor)} · ${escapeHtml(when)}</div>
            ${event.note ? `<div>${escapeHtml(event.note)}</div>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

export function timelineEventForStatus(status: string): string | null {
  const map: Record<string, string> = {
    intake: 'case_opened',
    open: 'case_opened',
    interviewing: 'complainant_interviewed',
    evidence_review: 'evidence_reviewed',
    findings_drafted: 'findings_drafted',
    action_pending: 'action_recommended',
    closed: 'case_closed',
  };
  return map[status] || 'status_changed';
}
