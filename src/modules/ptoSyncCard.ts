/**
 * Reports → "PTO balances (QuickBooks Time)" card (admins only).
 * Preview or run the QuickBooks Time → Orbis PTO balance sync on demand.
 * The same sync runs daily at 6 AM ET (sync-qbt-pto GitHub workflow).
 */
import { isAdminUser } from '../services/access';
import { PtoSyncError, syncPtoFromQuickBooksTime, type PtoSyncResult } from '../services/ptoSync';
import { showOrbisConfirm } from '../ui/confirmModal';

const CARD_ID = 'ptoSyncCard';

function toast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

function fmtHours(value: number | null | undefined): string {
  return value == null || Number.isNaN(Number(value)) ? '—' : Number(value).toFixed(2);
}

function setStatus(text: string, tone: 'muted' | 'success' | 'error' = 'muted'): void {
  const el = document.getElementById('ptoSyncStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = tone === 'error' ? 'var(--danger, #b91c1c)' : tone === 'success' ? 'var(--success, #15803d)' : '';
}

function setBusy(busy: boolean): void {
  ['ptoSyncPreviewBtn', 'ptoSyncRunBtn'].forEach((id) => {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = busy;
  });
}

function renderResult(result: PtoSyncResult): void {
  const el = document.getElementById('ptoSyncResults');
  if (!el) return;
  const matchedRows = result.matched
    .map((m) => {
      const parts = Object.entries(m.breakdown)
        .map(([k, v]) => `${esc(k)} ${fmtHours(v)}`)
        .join(', ');
      return `<tr><td>${esc(m.name)}</td><td>${fmtHours(m.hours)}</td><td>${fmtHours(m.previous)}</td><td class="muted">${parts || '—'}</td><td class="muted">${esc(m.how)}</td></tr>`;
    })
    .join('');
  const unmatchedRows = result.unmatched
    .map((u) => `<li>${esc(u.name)}${u.email ? ` (${esc(u.email)})` : ''} — <span class="muted">${esc(u.reason)}</span></li>`)
    .join('');
  const missing = result.activeWithoutQbtMatch.map((n) => `<li>${esc(n)}</li>`).join('');
  const failedRows = (result.failed || [])
    .map((f) => `<li>${esc(f.name)} — <span class="muted">${esc(f.reason)}</span></li>`)
    .join('');
  const failedSection = result.failed && result.failed.length
    ? `<details open style="margin-top: 8px">
        <summary><strong style="color: var(--danger, #b91c1c)">Failed to update (${result.failed.length})</strong> — balance left unchanged</summary>
        <ul>${failedRows}</ul>
      </details>`
    : '';

  el.innerHTML = `
    <details open style="margin-top: 12px">
      <summary><strong>Matched (${result.matched.length})</strong></summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Remaining hr</th><th>Was</th><th>By type</th><th>Matched by</th></tr></thead>
        <tbody>${matchedRows || '<tr><td colspan="5" class="muted">None</td></tr>'}</tbody>
      </table></div>
    </details>
    ${failedSection}
    <details ${result.unmatched.length ? 'open' : ''} style="margin-top: 8px">
      <summary><strong>QuickBooks Time users not matched (${result.unmatched.length})</strong> — skipped</summary>
      <ul>${unmatchedRows || '<li class="muted">None</li>'}</ul>
    </details>
    <details style="margin-top: 8px">
      <summary><strong>Active Orbis employees with no QuickBooks Time match (${result.activeWithoutQbtMatch.length})</strong></summary>
      <ul>${missing || '<li class="muted">None</li>'}</ul>
    </details>`;
}

async function run(dryRun: boolean): Promise<void> {
  if (!isAdminUser()) {
    toast('Admin access required to sync PTO.', 'error');
    return;
  }
  if (!dryRun) {
    const ok = await showOrbisConfirm(
      'Replace remaining PTO hours for every matched employee with the current QuickBooks Time balance?',
      { title: 'Refresh PTO from QuickBooks Time', confirmLabel: 'Refresh PTO' }
    );
    if (!ok) return;
  }

  setBusy(true);
  setStatus(dryRun ? 'Checking QuickBooks Time…' : 'Updating PTO balances from QuickBooks Time…');
  try {
    const result = await syncPtoFromQuickBooksTime({ dryRun });
    renderResult(result);
    const hasFailures = !dryRun && result.failed && result.failed.length > 0;
    const msg = dryRun
      ? `Preview: ${result.matched.length} would update, ${result.unmatched.length} not matched. Nothing was changed.`
      : `Updated ${result.updated} employees (as of ${result.asOf}). ${result.unmatched.length} not matched.${
          hasFailures ? ` ${result.failed.length} FAILED to update — see below.` : ''
        }`;
    setStatus(msg, hasFailures ? 'error' : 'success');
    if (!dryRun) {
      toast(
        hasFailures
          ? `PTO sync finished with ${result.failed.length} failure(s). Check the results below.`
          : 'PTO balances updated from QuickBooks Time.',
        hasFailures ? 'error' : 'success'
      );
      if (typeof window.refreshOrbisWorkspace === 'function') void window.refreshOrbisWorkspace();
    }
  } catch (err) {
    const message = err instanceof PtoSyncError ? err.message : 'Could not sync PTO from QuickBooks Time.';
    setStatus(message, 'error');
    toast(message, 'error');
  } finally {
    setBusy(false);
  }
}

function buildCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = CARD_ID;
  card.innerHTML = `
    <div class="card-header">PTO balances (QuickBooks Time)</div>
    <div class="card-body">
      <p class="muted" style="margin: 0 0 12px">
        Pulls each employee's remaining PTO hours from QuickBooks Time. This runs automatically every
        morning at 6:00 AM ET — use Preview to check matches, or Refresh to update now.
      </p>
      <div class="stay-org-themes-toolbar">
        <button class="button soft" id="ptoSyncPreviewBtn" type="button">Preview matches</button>
        <button class="button primary" id="ptoSyncRunBtn" type="button">Refresh PTO from QuickBooks Time</button>
      </div>
      <p class="muted" id="ptoSyncStatus" style="margin: 10px 0 0"></p>
      <div id="ptoSyncResults"></div>
    </div>`;
  card.querySelector('#ptoSyncPreviewBtn')?.addEventListener('click', () => void run(true));
  card.querySelector('#ptoSyncRunBtn')?.addEventListener('click', () => void run(false));
  return card;
}

/** Insert the card into Reports (admins only). Safe to call repeatedly. */
export function mountPtoSyncCard(): void {
  const content = document.getElementById('reportsAdminContent');
  if (!content) return;

  const existing = document.getElementById(CARD_ID);
  if (!isAdminUser()) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const card = buildCard();
  const anchor = document.getElementById('timeOffReportCard') || document.getElementById('stayOrgThemesCard');
  if (anchor?.id === 'timeOffReportCard' && anchor.parentElement) {
    anchor.parentElement.insertBefore(card, anchor.nextSibling);
  } else if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(card, anchor);
  } else {
    content.appendChild(card);
  }
}

function init(): void {
  mountPtoSyncCard();
  const section = document.getElementById('orbisSectionReports');
  if (section) {
    new MutationObserver(() => mountPtoSyncCard()).observe(section, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
