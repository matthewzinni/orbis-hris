import { isAdminUser } from '../services/accessState';
import { copySigningLink } from '../services/signatureRequests';
import {
  createHandbookSigningLink, HANDBOOK_ACKNOWLEDGMENT_TEXT,
  listHandbookAcknowledgments, type HandbookAcknowledgment,
} from '../services/handbookAcknowledgments';
function esc(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

let loadSequence = 0;

function dateLabel(value: string): string {
  return new Date(value).toLocaleString();
}

export function renderSignedHandbook(record: HandbookAcknowledgment): string {
  const signature = record.employee_signature || '';
  const image = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature)
    ? `<img src="${signature}" alt="Employee signature" style="max-width:320px;max-height:100px">`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(record.document_title)}</title>
    <style>body{font:16px/1.6 Georgia,serif;max-width:720px;margin:70px auto;padding:24px;color:#111}h1{font:700 21px Arial,sans-serif} .audit{margin-top:40px;font:12px/1.6 Arial,sans-serif;color:#555}@media print{button{display:none}body{margin:30px}}</style></head><body>
    <button type="button" id="print">Print / Save as PDF</button>
    <h1>${esc(record.document_title)}</h1><p>${esc(record.acknowledgment_text)}</p>
    <p>Employee Name: ${esc(record.employee_name)}</p>
    <p>Signed by: ${esc(record.signer_name || '')}</p>
    <div>Signature:<br>${image}</div>
    <p>Date: ${esc(record.signed_at ? dateLabel(record.signed_at) : '')}</p>
    <div class="audit">Electronically signed with consent.<br>Employee ID: ${esc(record.employee_id)}<br>Record: ${esc(record.id)}<br>Recorded at: ${esc(record.signed_at || '')}</div>
    </body></html>`;
}

function viewSignedHandbook(record: HandbookAcknowledgment): void {
  const viewer = window.open('about:blank', '_blank');
  if (!viewer) {
    window.showToast?.('Allow pop-ups to view the signed acknowledgement.', 'error');
    return;
  }
  viewer.opener = null;
  viewer.document.open();
  viewer.document.write(renderSignedHandbook(record));
  viewer.document.close();
  viewer.document.getElementById('print')?.addEventListener('click', () => viewer.print());
}

export async function loadHandbookAcknowledgments(employeeId: string): Promise<void> {
  const target = document.getElementById('handbookAcknowledgments');
  const sequence = ++loadSequence;
  if (!target) return;
  const isCurrent = () => sequence === loadSequence &&
    String(window.currentEmployee?.dbId || window.currentEmployee?.employee_id || window.currentEmployee?.id || '') === employeeId;
  target.innerHTML = '<div class="empty">Loading handbook acknowledgements…</div>';
  if (!employeeId) return;
  try {
    const rows = await listHandbookAcknowledgments(employeeId);
    if (!isCurrent()) return;
    target.innerHTML = `<p>${esc(HANDBOOK_ACKNOWLEDGMENT_TEXT)}</p>
      <p class="muted">Copy a link for the employee to review and sign. Their name, signature, and signing date are saved here.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${isAdminUser() && !rows.some(row => row.signed_at) ? '<button type="button" class="button primary" data-handbook-link>Copy signing link</button>' : ''}
        <button type="button" class="button soft" data-handbook-refresh>Refresh status</button>
      </div>
      <div data-handbook-link-result style="margin-top:12px" aria-live="polite"></div>
      <div class="history-list" style="margin-top:16px">${rows.length ? rows.map(row => `
        <div class="history-item"><div class="history-top"><div>
          <div class="history-title">${esc(row.document_title)}</div>
          <div class="history-date">${row.signed_at ? `Signed by ${esc(row.signer_name || row.employee_name)} · ${esc(dateLabel(row.signed_at))}` : `Awaiting signature · Created ${esc(dateLabel(row.created_at))}`}</div>
        </div>${row.signed_at ? `<button class="button soft" type="button" data-handbook-view="${esc(row.id)}">View signed form</button>` : '<span class="badge badge-soft">Unsigned</span>'}</div></div>`).join('') : '<div class="empty">No handbook acknowledgement requested yet.</div>'}</div>`;
    target.querySelector('[data-handbook-refresh]')?.addEventListener('click', () => void loadHandbookAcknowledgments(employeeId));
    target.querySelectorAll<HTMLButtonElement>('[data-handbook-view]').forEach(button => {
      button.addEventListener('click', () => {
        const record = rows.find(row => row.id === button.dataset.handbookView);
        if (record) viewSignedHandbook(record);
      });
    });
    const button = target.querySelector<HTMLButtonElement>('[data-handbook-link]');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      const result = target.querySelector<HTMLElement>('[data-handbook-link-result]');
      try {
        const url = await createHandbookSigningLink(employeeId);
        if (!isCurrent()) return;
        await loadHandbookAcknowledgments(employeeId);
        if (String(window.currentEmployee?.dbId || window.currentEmployee?.employee_id || window.currentEmployee?.id || '') !== employeeId) return;
        const currentResult = target.querySelector<HTMLElement>('[data-handbook-link-result]');
        if (currentResult) currentResult.innerHTML = `<label>Employee signing link<input type="text" readonly value="${esc(url)}" style="width:100%"></label><p class="muted">Links expire after 14 days. Copying again reuses an active link or replaces an expired link.</p>`;
        try {
          await copySigningLink(url);
          window.showToast?.('Handbook acknowledgement signing link copied.');
        } catch {
          window.showToast?.('Link created. Copy it from the field below.', 'warning');
        }
      } catch (error) {
        if (isCurrent() && result) result.textContent = error instanceof Error ? error.message : 'Could not create signing link.';
      } finally {
        button.disabled = false;
      }
    });
  } catch {
    if (isCurrent()) target.innerHTML = '<div class="empty">Could not load handbook acknowledgements. Please try again or contact your administrator.</div>';
  }
}
