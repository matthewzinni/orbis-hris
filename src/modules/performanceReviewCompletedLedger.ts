import { canViewCompletedPerformanceReviewsLedger } from '../services/access';
import {
  loadCompletedPerformanceReviewsLedger,
  type CompletedPerformanceReviewLedgerRow,
} from '../services/performanceReviewCompletedLedger';

let ledgerBound = false;
let cachedRows: CompletedPerformanceReviewLedgerRow[] = [];

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

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function scoreLabel(row: CompletedPerformanceReviewLedgerRow): string {
  if (row.overallResult) return row.overallResult;
  if (row.averageScore == null) return 'No score';
  return `Avg ${row.averageScore.toFixed(1)}`;
}

function renderLedgerRow(row: CompletedPerformanceReviewLedgerRow): string {
  return `
    <article class="completed-reviews-ledger-row">
      <button
        type="button"
        class="completed-reviews-ledger-main"
        data-completed-review-employee="${esc(row.employeeId)}"
      >
        <span class="completed-reviews-ledger-title">
          <strong>${esc(row.employeeName)}</strong>
          <span class="badge badge-soft">${esc(row.reviewTypeLabel)}</span>
        </span>
        <span class="completed-reviews-ledger-detail muted">
          ${esc(row.reviewDateLabel)} · ${esc(scoreLabel(row))} · ${esc(row.department)}
        </span>
        <span class="completed-reviews-ledger-meta muted">
          Supervisor: ${esc(row.supervisor)} · Saved by ${esc(row.createdBy)}
        </span>
      </button>
    </article>
  `;
}

async function openCompletedReviewEmployee(employeeId: string): Promise<void> {
  const id = String(employeeId || '').trim();
  if (!id) return;

  // Stay on My Tasks / Attention so closing the drawer returns to this ledger.
  if (typeof window.openEmployeeDrawer === 'function') {
    await window.openEmployeeDrawer(id);
  }

  if (typeof window.switchDrawerTab === 'function') {
    window.switchDrawerTab('reviews');
  } else if (typeof window.switchTab === 'function') {
    window.switchTab('reviews');
  }
}

function bindCompletedReviewsLedgerActions(): void {
  if (ledgerBound) return;
  ledgerBound = true;

  const root = safeGet('completedPerformanceReviewsLedgerCard');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const refreshBtn = (event.target as Element | null)?.closest<HTMLElement>(
      '#completedPerformanceReviewsLedgerRefreshBtn'
    );
    if (refreshBtn) {
      event.preventDefault();
      void loadCompletedPerformanceReviewsLedgerPanel();
      return;
    }

    const button = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-completed-review-employee]'
    );
    if (!button) return;

    event.preventDefault();
    const employeeId = button.dataset.completedReviewEmployee || '';
    void openCompletedReviewEmployee(employeeId).catch((err) => {
      const message = err instanceof Error ? err.message : 'Could not open employee review.';
      showToast(message, 'error');
    });
  });
}

export async function loadCompletedPerformanceReviewsLedgerPanel(): Promise<void> {
  const card = safeGet('completedPerformanceReviewsLedgerCard');
  const list = safeGet('completedPerformanceReviewsLedgerList');
  const summary = safeGet('completedPerformanceReviewsLedgerSummary');
  if (!card || !list) return;

  bindCompletedReviewsLedgerActions();

  if (!canViewCompletedPerformanceReviewsLedger()) {
    card.classList.add('hidden');
    cachedRows = [];
    return;
  }

  card.classList.remove('hidden');
  list.innerHTML = '<div class="muted">Loading completed reviews…</div>';
  if (summary) summary.textContent = 'Private to your account.';

  try {
    cachedRows = await loadCompletedPerformanceReviewsLedger();

    if (summary) {
      summary.textContent = cachedRows.length
        ? `${cachedRows.length} completed review${cachedRows.length === 1 ? '' : 's'} · private to you`
        : 'No completed reviews yet · private to you';
    }

    if (!cachedRows.length) {
      list.innerHTML =
        '<div class="employee-portal-task-empty">No performance reviews have been saved yet.</div>';
      return;
    }

    list.innerHTML = cachedRows.map(renderLedgerRow).join('');
  } catch (err) {
    console.warn('[CompletedReviewsLedger]', err);
    list.innerHTML = '<div class="muted">Could not load completed performance reviews.</div>';
    if (summary) summary.textContent = 'Private to your account.';
  }
}

window.loadCompletedPerformanceReviewsLedgerPanel = loadCompletedPerformanceReviewsLedgerPanel;
