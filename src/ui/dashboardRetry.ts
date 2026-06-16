export type DashboardSyncStatus = 'success' | 'partial' | 'error';

export type DashboardRetryHandler = () => void | Promise<void>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderDashboardRetryState(
  target: HTMLElement,
  message: string,
  onRetry: DashboardRetryHandler,
  options?: { retryLabel?: string }
): void {
  const retryToken = `retry-${Math.random().toString(36).slice(2, 9)}`;

  target.innerHTML = `
    <div class="dashboard-retry-state" role="status">
      <p class="dashboard-retry-message">${escapeHtml(message)}</p>
      <button
        type="button"
        class="button soft sm dashboard-retry-btn"
        data-dashboard-retry="${retryToken}"
      >
        ${escapeHtml(options?.retryLabel || 'Retry')}
      </button>
    </div>
  `;

  target.querySelector<HTMLButtonElement>(`[data-dashboard-retry="${retryToken}"]`)?.addEventListener(
    'click',
    () => {
      void Promise.resolve(onRetry());
    }
  );
}

export function renderDashboardRetryTableRow(
  tbody: HTMLElement,
  colspan: number,
  message: string,
  onRetry: DashboardRetryHandler
): void {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  row.appendChild(cell);
  tbody.innerHTML = '';
  tbody.appendChild(row);
  renderDashboardRetryState(cell, message, onRetry);
}

let kpiRetryBannerEl: HTMLElement | null = null;

export function showKpiRetryBanner(
  message: string,
  onRetry: DashboardRetryHandler
): void {
  const grid = document.querySelector('.kpi-grid');

  if (!grid) {
    return;
  }

  if (!kpiRetryBannerEl) {
    kpiRetryBannerEl = document.createElement('div');
    kpiRetryBannerEl.id = 'kpiRetryBanner';
    kpiRetryBannerEl.className = 'dashboard-retry-banner';
    grid.insertAdjacentElement('afterend', kpiRetryBannerEl);
  }

  kpiRetryBannerEl.classList.remove('hidden');
  renderDashboardRetryState(kpiRetryBannerEl, message, onRetry, {
    retryLabel: 'Retry KPIs',
  });
}

export function hideKpiRetryBanner(): void {
  kpiRetryBannerEl?.classList.add('hidden');
  if (kpiRetryBannerEl) {
    kpiRetryBannerEl.innerHTML = '';
  }
}

export function updateDashboardSyncStatus(
  status: DashboardSyncStatus,
  syncedAt: Date = new Date()
): void {
  const syncLine = document.getElementById('dashboardSyncLine');
  const time = syncedAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (!syncLine) {
    const fallback = document.getElementById('lastRefresh');
    if (fallback) {
      fallback.textContent = time;
    }
    return;
  }

  if (status === 'success') {
    syncLine.innerHTML = `Last synced: <span id="lastRefresh">${escapeHtml(time)}</span>`;
    syncLine.classList.remove('sync-partial', 'sync-error');
    return;
  }

  if (status === 'partial') {
    syncLine.innerHTML = `Some sections failed · Last attempt <span id="lastRefresh">${escapeHtml(time)}</span> · <button type="button" class="link-button dashboard-sync-retry" id="dashboardSyncRetryBtn">Retry all</button>`;
    syncLine.classList.add('sync-partial');
    syncLine.classList.remove('sync-error');
    bindDashboardSyncRetry();
    return;
  }

  syncLine.innerHTML = `Sync failed · Last attempt <span id="lastRefresh">${escapeHtml(time)}</span> · <button type="button" class="link-button dashboard-sync-retry" id="dashboardSyncRetryBtn">Retry all</button>`;
  syncLine.classList.add('sync-error');
  syncLine.classList.remove('sync-partial');
  bindDashboardSyncRetry();
}

function bindDashboardSyncRetry(): void {
  document.getElementById('dashboardSyncRetryBtn')?.addEventListener('click', () => {
    if (typeof window.loadAllDashboardData === 'function') {
      void window.loadAllDashboardData();
    }
  });
}

window.updateDashboardSyncStatus = updateDashboardSyncStatus;
