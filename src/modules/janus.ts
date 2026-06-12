import { canAccessJanus, canEditJanus } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import type { JanusHomeStats } from '../types/janusTypes';

declare global {
  interface Window {
    loadJanus?: () => Promise<void>;
    applyJanusAccess?: () => void;
  }
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function fetchJanusStats(): Promise<JanusHomeStats> {
  const [accounts, contacts, meetings, documents] = await Promise.all([
    supabaseClient.from('janus_accounts').select('id', { count: 'exact', head: true }),
    supabaseClient.from('janus_contacts').select('id', { count: 'exact', head: true }),
    supabaseClient.from('janus_meetings').select('id', { count: 'exact', head: true }),
    supabaseClient.from('janus_documents').select('id', { count: 'exact', head: true }),
  ]);

  const firstError = accounts.error || contacts.error || meetings.error || documents.error;
  if (firstError) {
    throw firstError;
  }

  return {
    accountCount: accounts.count ?? 0,
    contactCount: contacts.count ?? 0,
    meetingCount: meetings.count ?? 0,
    documentCount: documents.count ?? 0,
  };
}

function renderJanusPlaceholder(stats: JanusHomeStats | null, errorMessage = ''): void {
  const summary = safeGet('janusHomeSummary');
  const body = safeGet('janusHomeBody');

  if (summary) {
    if (errorMessage) {
      summary.textContent = 'Could not load Janus data.';
    } else if (!stats) {
      summary.textContent = 'Loading relationship workspace…';
    } else {
      summary.textContent = `${stats.accountCount} account${stats.accountCount === 1 ? '' : 's'} · ${stats.contactCount} contact${stats.contactCount === 1 ? '' : 's'}`;
    }
  }

  if (!body) return;

  if (errorMessage) {
    body.innerHTML = `<div class="janus-empty muted">${esc(errorMessage)}</div>`;
    return;
  }

  const editHint = canEditJanus()
    ? 'Account list, meeting logs, and Copper import are next.'
    : 'You have read-only access to Janus.';

  body.innerHTML = `
    <div class="janus-scaffold-grid">
      <div class="kpi-card">
        <div class="kpi-label">Accounts</div>
        <div class="kpi-value">${esc(stats?.accountCount ?? '—')}</div>
        <div class="kpi-sub">Clients, vendors, partners</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Contacts</div>
        <div class="kpi-value">${esc(stats?.contactCount ?? '—')}</div>
        <div class="kpi-sub">People at each account</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Meetings</div>
        <div class="kpi-value">${esc(stats?.meetingCount ?? '—')}</div>
        <div class="kpi-sub">Recaps and follow-ups</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Documents</div>
        <div class="kpi-value">${esc(stats?.documentCount ?? '—')}</div>
        <div class="kpi-sub">Agreements and SOWs</div>
      </div>
    </div>
    <div class="card janus-scaffold-card">
      <div class="card-header">Getting started</div>
      <div class="card-body">
        <p class="muted janus-scaffold-lead">
          Janus is the Orbis relationship CRM — accounts, contacts, meeting recaps, and agreements in one place.
        </p>
        <ul class="janus-scaffold-list">
          <li>Import Copper companies and contacts</li>
          <li>Log meetings with AI summaries and follow-up dates</li>
          <li>Store agreements per account (Macmillan, Sourcebooks, etc.)</li>
          <li>Search contacts, phone numbers, and meeting history</li>
        </ul>
        <p class="muted janus-scaffold-foot">${esc(editHint)}</p>
      </div>
    </div>
  `;
}

export function applyJanusAccess(): void {
  const visible = canAccessJanus();
  document.querySelectorAll<HTMLElement>('[data-janus-access]').forEach((element) => {
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
}

export async function loadJanus(): Promise<void> {
  if (!canAccessJanus()) {
    applyJanusAccess();
    renderJanusPlaceholder(null, 'Janus requires admin or Janus CRM access.');
    return;
  }

  applyJanusAccess();
  renderJanusPlaceholder(null);

  try {
    const stats = await fetchJanusStats();
    renderJanusPlaceholder(stats);
  } catch (err) {
    console.error('[Janus] Load failed:', err);
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: string }).message)
        : 'Could not load Janus. Apply the Janus migration if this is a fresh environment.';
    renderJanusPlaceholder(null, message);
  }
}

let janusBound = false;

function bindJanusUi(): void {
  if (janusBound) return;
  janusBound = true;

  safeGet<HTMLButtonElement>('janusRefreshBtn')?.addEventListener('click', () => {
    void loadJanus();
  });
}

bindJanusUi();
applyJanusAccess();

window.loadJanus = loadJanus;
window.applyJanusAccess = applyJanusAccess;
