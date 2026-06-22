import { isSystemEmployeeNoteType } from '../services/employeeSystemNotes';
import { canViewDisciplineReports } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import { esc } from '../utils/helpers';

type HistoryRecord = {
  id?: string | number;
  type?: string;
  title?: string;
  subtitle?: string;
  date?: string;
  body?: string;
  meta?: string;
  source?: string;
  [key: string]: unknown;
};

type ActivityRecord = {
  action?: string;
  employeeName?: string;
  timestamp?: string | number | Date;
  [key: string]: unknown;
};

type TimelineItem = {
  type: string;
  date?: string;
  text?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nl2br(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function getHistoryContainer(containerId: string): HTMLElement | null {
  return document.getElementById(containerId);
}

function normalizeHistoryRecord(record: HistoryRecord): Required<Pick<HistoryRecord, 'title' | 'subtitle' | 'date' | 'body' | 'meta' | 'source'>> {
  return {
    title:
      String(record.title || record.type || record.source || 'History Item'),
    subtitle: String(record.subtitle || ''),
    date: String(record.date || record.created_at || record.updated_at || ''),
    body: String(record.body || record.notes || record.description || ''),
    meta: String(record.meta || ''),
    source: String(record.source || ''),
  };
}

function renderHistoryItem(record: HistoryRecord): string {
  const normalized = normalizeHistoryRecord(record);

  return `
    <div class="history-item" data-history-id="${escapeHtml(record.id || '')}">
      <div class="history-top">
        <div>
          <strong>${escapeHtml(normalized.title)}</strong>
          ${normalized.subtitle ? `<span>${escapeHtml(normalized.subtitle)}</span>` : ''}
        </div>
        ${normalized.date ? `<span>${escapeHtml(normalized.date)}</span>` : ''}
      </div>
      <div class="history-body">
        ${normalized.meta ? `<strong>${escapeHtml(normalized.meta)}</strong><br>` : ''}
        ${nl2br(normalized.body)}
      </div>
    </div>
  `;
}

export function renderHistoryList(
  containerId: string,
  records: HistoryRecord[],
  emptyMessage: string = 'No history found.'
): void {
  const container = getHistoryContainer(containerId);

  if (!container) {
    console.warn(`[History] Container not found: ${containerId}`);
    return;
  }

  if (!records.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  container.innerHTML = records.map(renderHistoryItem).join('');
}

export function appendHistoryItem(containerId: string, record: HistoryRecord): void {
  const container = getHistoryContainer(containerId);

  if (!container) {
    console.warn(`[History] Container not found: ${containerId}`);
    return;
  }

  const existingEmpty = container.querySelector('.empty');

  if (existingEmpty) {
    container.innerHTML = '';
  }

  container.insertAdjacentHTML('afterbegin', renderHistoryItem(record));
}

export function clearHistoryList(
  containerId: string,
  emptyMessage: string = 'No history found.'
): void {
  const container = getHistoryContainer(containerId);

  if (!container) {
    console.warn(`[History] Container not found: ${containerId}`);
    return;
  }

  container.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
}

export function getResolvedHistoryEmployeeId(employeeId: string | null = null): string {
  const employee = window.currentEmployee;

  return String(employee?.dbId || employee?.id || employee?.employee_id || employeeId || '').trim();
}

async function fetchHistoryRows(
  table: string,
  employeeId: string,
  orderColumn: string
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabaseClient
    .from(table)
    .select('*')
    .eq('employee_id', employeeId)
    .order(orderColumn, { ascending: false });

  if (error) {
    console.warn(`[History] Could not load ${table}:`, error);
    return [];
  }

  return (data || []) as Record<string, unknown>[];
}

export async function loadEmployeeHistory(employeeId: string): Promise<void> {
  const actualEmployeeId = getResolvedHistoryEmployeeId(employeeId);
  const target = document.getElementById('historyFeed');

  if (!actualEmployeeId || !target) {
    return;
  }

  target.innerHTML = '<div class="empty">Loading history...</div>';

  const includeDiscipline = canViewDisciplineReports();

  const [notes, meetings, discipline, incidents, reviews] = await Promise.all([
    fetchHistoryRows('employee_notes', actualEmployeeId, 'note_date'),
    fetchHistoryRows('employee_meetings', actualEmployeeId, 'meeting_date'),
    includeDiscipline
      ? fetchHistoryRows('discipline_reports', actualEmployeeId, 'incident_date')
      : Promise.resolve([]),
    fetchHistoryRows('incident_reports', actualEmployeeId, 'incident_date'),
    fetchHistoryRows('employee_reviews', actualEmployeeId, 'review_date'),
  ]);

  const timeline: TimelineItem[] = [
    ...notes
      .filter((note) => !isSystemEmployeeNoteType(note.note_type))
      .map((note) => ({
        type: 'Note',
        date: String(note.note_date || ''),
        text: String(note.note_text || ''),
      })),
    ...meetings.map((meeting) => ({
      type: 'Meeting',
      date: String(meeting.meeting_date || ''),
      text: String(meeting.subject || meeting.notes || ''),
    })),
    ...discipline.map((record) => ({
      type: 'Discipline',
      date: String(record.incident_date || ''),
      text: String(record.description || ''),
    })),
    ...incidents.map((incident) => ({
      type: 'Incident',
      date: String(incident.incident_date || ''),
      text: String(incident.description || ''),
    })),
    ...reviews.map((review) => ({
      type: 'Review',
      date: String(review.review_date || ''),
      text: String(review.overall_result || ''),
    })),
  ];

  timeline.sort((a, b) => {
    const dateA = a.date ? new Date(`${a.date}T00:00:00`).getTime() : 0;
    const dateB = b.date ? new Date(`${b.date}T00:00:00`).getTime() : 0;

    return dateB - dateA;
  });

  if (!timeline.length) {
    target.innerHTML = '<div class="empty">No history available.</div>';
    return;
  }

  target.innerHTML = timeline
    .map((item) => {
      const date = item.date
        ? new Date(`${item.date}T00:00:00`).toLocaleDateString()
        : '—';

      return `
        <div class="card" style="margin-bottom:10px;">
          <strong>${esc(item.type)}</strong>
          <div style="font-size:12px; color:#64748b;">${date}</div>
          <div style="margin-top:4px;">${esc(item.text || '—')}</div>
        </div>
      `;
    })
    .join('');
}

window.renderHistoryList = renderHistoryList;
window.appendHistoryItem = appendHistoryItem;
window.clearHistoryList = clearHistoryList;
window.loadEmployeeHistory = loadEmployeeHistory;
window.getResolvedHistoryEmployeeId = getResolvedHistoryEmployeeId;