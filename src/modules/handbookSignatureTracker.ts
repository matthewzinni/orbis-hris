import { isAdminUser } from '../services/accessState';
import { loadHandbookStatus, type HandbookStatusRow } from '../services/handbookSignatureStatus';
import { listHandbookAcknowledgments } from '../services/handbookAcknowledgments';
import { viewSignedHandbook } from './handbookAcknowledgments';

function esc(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderHandbookStatusRows(rows: HandbookStatusRow[]): string {
  return rows.length ? rows.map(row => `<tr>
    <td>${esc(row.name)}</td><td>${esc(row.department)}</td>
    <td><span class="badge ${row.signedAt ? 'badge-active' : 'badge-leave'}">${row.signedAt ? 'Signed' : 'Pending'}</span></td>
    <td>${row.signedAt ? esc(new Date(row.signedAt).toLocaleString()) : '—'}</td>
    <td>${esc(row.signerName || '—')}</td>
    <td>${row.recordId ? `<button type="button" class="button soft sm" data-handbook-record="${esc(row.recordId)}">View signed form</button>` : 'Not signed yet'}</td>
  </tr>`).join('') : '<tr><td colspan="6">No employees match these filters.</td></tr>';
}

export function initializeHandbookSignatureTracker(): void {
  const panel = document.getElementById('handbookSignatureTracker');
  if (!panel) return;
  panel.classList.toggle('hidden', !isAdminUser());
  if (!isAdminUser()) { panel.innerHTML = ''; return; }
  let rows: HandbookStatusRow[] = [];
  let sequence = 0;
  panel.innerHTML = `<div class="card-header"><div><h2>Handbook 4.1 signatures</h2>
    <p class="muted">Effective September 1, 2026. Current employees, including those on leave. Inactive, terminated, and archived employees are excluded.</p></div></div>
    <div class="card-body"><p data-handbook-counts role="status">Loading signatures…</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <label>Find employee <input type="search" data-handbook-search placeholder="Name or department"></label>
      <label>Signature status <select data-handbook-filter><option value="all">Everyone</option><option value="signed">Signed</option><option value="pending">Pending</option></select></label>
      <button type="button" class="button soft" data-handbook-status-refresh>Refresh status</button>
    </div><p data-handbook-error role="alert"></p>
    <div style="overflow-x:auto"><table><thead><tr><th scope="col">Employee</th><th scope="col">Department</th><th scope="col">Status</th><th scope="col">Signed on</th><th scope="col">Signed by</th><th scope="col">Acknowledgment</th></tr></thead>
    <tbody data-handbook-status-rows></tbody></table></div></div>`;
  const search = panel.querySelector<HTMLInputElement>('[data-handbook-search]')!;
  const filter = panel.querySelector<HTMLSelectElement>('[data-handbook-filter]')!;
  const body = panel.querySelector<HTMLElement>('[data-handbook-status-rows]')!;
  const counts = panel.querySelector<HTMLElement>('[data-handbook-counts]')!;
  const error = panel.querySelector<HTMLElement>('[data-handbook-error]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-handbook-status-refresh]')!;
  function render(): void {
    const query = search.value.trim().toLowerCase();
    body.innerHTML = renderHandbookStatusRows(rows.filter(row =>
      `${row.name} ${row.department}`.toLowerCase().includes(query) &&
      (filter.value === 'all' || (filter.value === 'signed' ? !!row.signedAt : !row.signedAt))));
  }
  async function reload(): Promise<void> {
    const current = ++sequence;
    rows = []; body.innerHTML = ''; error.textContent = ''; counts.textContent = 'Loading signatures…';
    refresh.disabled = true;
    try {
      const result = await loadHandbookStatus();
      if (current !== sequence || !counts.isConnected || !isAdminUser()) return;
      rows = result;
      const signed = rows.filter(row => row.signedAt).length;
      counts.textContent = `${signed} signed · ${rows.length - signed} pending · ${rows.length} employees`;
      render();
    } catch {
      if (current !== sequence || !counts.isConnected) return;
      counts.textContent = 'Signature status unavailable';
      error.textContent = 'Could not load signatures. Select Refresh status to try again.';
    } finally { if (current === sequence) refresh.disabled = false; }
  }
  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  refresh.addEventListener('click', () => void reload());
  body.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-handbook-record]');
    const row = rows.find(item => item.recordId === button?.dataset.handbookRecord);
    if (!button || !row || !isAdminUser()) return;
    button.disabled = true;
    try {
      const records = await listHandbookAcknowledgments(row.employeeId);
      const record = records.find(item => item.id === row.recordId && item.signed_at);
      if (!record) throw new Error('Missing signed form');
      if (isAdminUser()) viewSignedHandbook(record);
    } catch { error.textContent = 'Could not open the signed form. Please try again.'; }
    finally { button.disabled = false; }
  });
  void reload();
}
