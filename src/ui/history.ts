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

declare global {
  interface Window {
    renderHistoryList?: (
      containerId: string,
      records: HistoryRecord[],
      emptyMessage?: string
    ) => void;
    appendHistoryItem?: (containerId: string, record: HistoryRecord) => void;
    clearHistoryList?: (containerId: string, emptyMessage?: string) => void;
    renderRecentActivity?: () => Promise<void>;
    loadRecentActivityFallback?: () => Promise<void>;
    getAuditTrail?: () => ActivityRecord[];
    getOrCreateDashboardSectionBody?: (title: string, id: string) => HTMLElement | null;
  }
}

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

export async function renderRecentActivity(): Promise<void> {
  const audit =
    typeof window.getAuditTrail === 'function'
      ? window.getAuditTrail()
      : [];

  const container =
    typeof window.getOrCreateDashboardSectionBody === 'function'
      ? window.getOrCreateDashboardSectionBody('Recent HR Activity', 'recentHrActivityList')
      : document.getElementById('recentHrActivityList');

  if (!container) return;

  if (!audit.length) {
    container.innerHTML = '<div class="empty">No recent HR activity yet.</div>';
    return;
  }

  container.innerHTML = audit
    .slice(0, 8)
    .map(
      (item) => `
        <div class="dashboard-list-item">
          <strong>${escapeHtml(item.action || 'Activity')}</strong>
          <span>${escapeHtml(item.employeeName || '')}</span>
          <small>${item.timestamp ? escapeHtml(new Date(item.timestamp).toLocaleString()) : ''}</small>
        </div>
      `
    )
    .join('');
}

window.renderHistoryList = renderHistoryList;
window.appendHistoryItem = appendHistoryItem;
window.clearHistoryList = clearHistoryList;
window.renderRecentActivity = renderRecentActivity;
window.loadRecentActivityFallback = renderRecentActivity;