import { supabaseClient } from '../services/supabaseClient';
import {
  resolveCurrentUserDisplayName,
  resolveCurrentUserEmail,
} from '../services/operationsAccess';
import type { OperationsIssueEvent } from '../types/operationsTypes';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatEventTime(value: unknown): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export async function recordOperationsIssueEvent(
  issueId: string,
  eventType: string,
  options: {
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    note?: string;
  } = {}
): Promise<void> {
  const email = await resolveCurrentUserEmail();
  if (!email || !issueId) return;

  const payload = {
    issue_id: issueId,
    event_type: eventType,
    field_name: options.fieldName || null,
    old_value: options.oldValue ?? null,
    new_value: options.newValue ?? null,
    note: options.note || null,
    actor_email: email,
    actor_name: resolveCurrentUserDisplayName(),
  };

  const { error } = await supabaseClient.from('operations_issue_events').insert(payload);

  if (error) {
    console.warn('[Operations] Could not record issue event:', error);
  }
}

export async function loadOperationsIssueEvents(issueId: string): Promise<OperationsIssueEvent[]> {
  const { data, error } = await supabaseClient
    .from('operations_issue_events')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Operations] Could not load issue events:', error);
    return [];
  }

  return (data || []) as OperationsIssueEvent[];
}

export function renderOperationsIssueEvents(
  container: HTMLElement | null,
  events: OperationsIssueEvent[]
): void {
  if (!container) return;

  if (!events.length) {
    container.innerHTML = '<div class="empty">No activity recorded yet.</div>';
    return;
  }

  container.innerHTML = events
    .map((event) => {
      const detail = [
        event.field_name
          ? `<strong>${escapeHtml(event.field_name)}:</strong> ${escapeHtml(event.old_value || '—')} → ${escapeHtml(event.new_value || '—')}`
          : '',
        event.note ? escapeHtml(event.note) : '',
      ]
        .filter(Boolean)
        .join('<br>');

      return `
        <div class="history-item">
          <div class="history-top">
            <div>
              <strong>${escapeHtml(String(event.event_type || 'update').replace(/_/g, ' '))}</strong>
              <span>${escapeHtml(event.actor_name || event.actor_email || '')}</span>
            </div>
            <span class="muted">${escapeHtml(formatEventTime(event.created_at))}</span>
          </div>
          ${detail ? `<div class="history-body">${detail}</div>` : ''}
        </div>
      `;
    })
    .join('');
}
