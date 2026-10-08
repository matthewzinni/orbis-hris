import { canEditJanus } from '../services/access';
import { copySigningLink } from '../services/signatureRequests';
import { cancelSigningDocumentLink, fetchSigningDocuments, issueSigningDocumentLink, saveSigningDocument } from '../services/janusSigningDocuments';
import { emptyDocumentContent, validateDocumentContent, type SigningDocument, type SigningDocumentContent } from '../services/signingDocumentModel';
import { documentPreview, mountDocumentEditor } from '../ui/documentEditor';
import { esc } from '../utils/helpers';
import '../styles/document-editor.css';

let currentAccount = '';
let root: HTMLElement | null = null;
let records: SigningDocument[] = [];
let editingId: string | null = null;
let readContent: (() => SigningDocumentContent) | null = null;
let dirty = false;
let busy = false;

function message(text: string, error = false): void {
  const target = root?.querySelector('[data-signing-message]');
  if (target) target.textContent = text;
  window.showToast?.(text, error ? 'error' : 'success');
}
function editor(record?: SigningDocument): void {
  if (!root || !canEditJanus()) return;
  editingId = record?.id || null;
  const area = root.querySelector<HTMLElement>('[data-signing-editor]')!;
  area.hidden = false;
  area.innerHTML = `<h3>${record ? 'Edit draft' : 'Create a document'}</h3>
    <div data-signing-content></div>
    <div class="document-editor-fields" style="margin-top:16px">
      <label>Publisher / signer name<input data-signing-name maxlength="200" value="${esc(record?.signer_name || '')}" required></label>
      <label>Signer email<input data-signing-email type="email" maxlength="254" value="${esc(record?.signer_email || '')}" required></label>
      <label style="display:flex;gap:8px"><input data-signing-edits type="checkbox" ${record?.allow_recipient_edits !== false ? 'checked' : ''}>Allow the publisher to edit text and letterhead before signing</label>
    </div>
    <div class="button-row"><button class="button primary" data-signing-save type="button">Save draft</button><button class="button soft" data-signing-preview-pdf type="button">Preview PDF</button><button class="button soft" data-signing-close type="button">Close editor</button></div>`;
  readContent = mountDocumentEditor(area.querySelector<HTMLElement>('[data-signing-content]')!, record?.content || emptyDocumentContent(), () => { dirty = true; });
  area.addEventListener('input', () => { dirty = true; }, { once: true });
  dirty = false;
}
async function downloadRecord(record: SigningDocument): Promise<void> {
  const { downloadSigningPdf } = await import('../services/signingDocumentPdf');
  await downloadSigningPdf(record.signed_content || record.content, record.status === 'signed' ? record : undefined);
}
export async function loadJanusDocumentSigning(accountId: string): Promise<void> {
  const mount = document.getElementById('janusDocumentSigning');
  if (!mount) return;
  if (currentAccount === accountId && root === mount && dirty) return;
  currentAccount = accountId; root = mount;
  root.innerHTML = `<div class="card-header">Documents for signature</div><div class="card-body">
    <p class="muted">Write and edit publisher documents, add letterhead, and create an external signing link.</p>
    <div class="document-signing-actions">${canEditJanus() ? '<button class="button primary" data-signing-new type="button">Create document</button>' : ''}<button class="button soft" data-signing-refresh type="button">Refresh status</button></div>
    <div data-signing-message role="status" aria-live="polite"></div>
    <div data-signing-editor class="document-signing-editor" hidden></div><div data-signing-list class="document-signing-list">Loading signing documents…</div></div>`;
  root.onclick = (event) => {
    const button = (event.target as Element)?.closest<HTMLButtonElement>('button');
    if (!button || busy) return;
    void action(button).catch((error) => message(error instanceof Error ? error.message : String(error), true));
  };
  readContent = null; dirty = false;
  try {
    const data = await fetchSigningDocuments(accountId);
    if (currentAccount !== accountId) return;
    records = data;
    renderList();
  } catch (error) {
    if (currentAccount === accountId) root.querySelector('[data-signing-list]')!.textContent = error instanceof Error ? error.message : 'Could not load signing documents.';
  }
}
function renderList(): void {
  if (!root) return;
  root.querySelector('[data-signing-list]')!.innerHTML = records.length ? records.map((record) => `<article class="document-signing-item">
    <strong>${esc(record.content.title)}</strong><span>${esc(record.signer_name)} · ${esc(record.signer_email)}</span>
    <span>${record.status === 'signed' ? `Signed by ${esc(record.signed_name)} · ${esc(new Date(record.signed_at!).toLocaleString())}` : record.status === 'pending' ? 'Awaiting signature' : 'Draft'}</span>
    ${record.signed_content && JSON.stringify(record.signed_content) !== JSON.stringify(record.content) ? '<span class="muted">The publisher edited the document before signing. The signed PDF contains their final version.</span>' : ''}
    <div class="document-signing-actions"><button class="button soft" data-signing-download="${record.id}" type="button">${record.status === 'signed' ? 'Download signed PDF' : 'Download draft PDF'}</button>
      ${canEditJanus() && record.status === 'draft' ? `<button class="button soft" data-signing-edit="${record.id}" type="button">Edit draft</button>` : ''}
      ${canEditJanus() && record.status !== 'signed' ? `<button class="button primary" data-signing-link="${record.id}" type="button">${record.status === 'pending' ? 'Copy signing link' : 'Create signing link'}</button>` : ''}
      ${canEditJanus() && record.status === 'pending' ? `<button class="button soft" data-signing-cancel="${record.id}" type="button">Cancel signing link</button>` : ''}
    </div><div data-signing-link-result="${record.id}"></div>
    </article>`).join('') : '<p class="muted">No signing documents yet. Create one to get started.</p>';
}
async function action(button: HTMLButtonElement): Promise<void> {
  if (!root) return;
  if (button.hasAttribute('data-signing-new')) { if (dirty && !await confirmDiscard()) return; editor(); return; }
  if (button.hasAttribute('data-signing-close')) { if (dirty && !await confirmDiscard()) return; root.querySelector<HTMLElement>('[data-signing-editor]')!.hidden = true; dirty = false; return; }
  if (button.hasAttribute('data-signing-refresh')) { if (dirty && !await confirmDiscard()) return; dirty = false; await loadJanusDocumentSigning(currentAccount); return; }
  if (dirty && button.dataset.signingLink) { message('Save your draft edits before creating a signing link.', true); return; }
  const docId = button.dataset.signingEdit || button.dataset.signingLink || button.dataset.signingCancel || button.dataset.signingDownload;
  const record = records.find((item) => item.id === docId);
  if (button.dataset.signingEdit && record) { if (dirty && !await confirmDiscard()) return; editor(record); return; }
  busy = true; button.disabled = true;
  const controls = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-signing-editor] input,[data-signing-editor] textarea'));
  controls.forEach(control => { control.disabled = true; });
  const account = currentAccount;
  try {
    if (button.hasAttribute('data-signing-save') && readContent) {
      const content = readContent(); const invalid = validateDocumentContent(content); if (invalid) throw new Error(invalid);
      const name = root.querySelector<HTMLInputElement>('[data-signing-name]')!.value.trim();
      const email = root.querySelector<HTMLInputElement>('[data-signing-email]')!;
      if (name.length < 2 || !email.value.trim() || !email.checkValidity()) throw new Error('Enter the signer’s name and a valid email.');
      await saveSigningDocument(account, content, name, email.value.trim(), root.querySelector<HTMLInputElement>('[data-signing-edits]')!.checked, editingId);
      if (currentAccount !== account) return;
      dirty = false; await loadJanusDocumentSigning(account); message('Document draft saved.');
    } else if (button.hasAttribute('data-signing-preview-pdf') && readContent) {
      const content = readContent(); const invalid = validateDocumentContent(content); if (invalid) throw new Error(invalid);
      const { downloadSigningPdf } = await import('../services/signingDocumentPdf'); await downloadSigningPdf(content);
    } else if (button.dataset.signingDownload && record) { await downloadRecord(record); }
    else if (button.dataset.signingLink && record) {
      const url = await issueSigningDocumentLink(record.id);
      if (currentAccount !== account) return;
      await loadJanusDocumentSigning(account);
      const area = root.querySelector(`[data-signing-link-result="${record.id}"]`)!;
      area.innerHTML = `<label>Signing link<input class="document-signing-link" readonly value="${esc(url)}"></label><p class="muted">Share this link with ${esc(record.signer_name)}. It expires in 14 days. No Orbis account is needed.</p>`;
      try { await copySigningLink(url); message('Signing link copied.'); } catch { message('Signing link created. Copy the link above.'); }
    } else if (button.dataset.signingCancel && record) {
      const { showOrbisConfirm } = await import('../ui/confirmModal');
      if (!await showOrbisConfirm('Cancel this signing link? The publisher will no longer be able to sign with it.', {title:'Cancel signing link',confirmLabel:'Cancel link'})) return;
      await cancelSigningDocumentLink(record.id); if (currentAccount !== account) return; await loadJanusDocumentSigning(account); message('Link cancelled. You can edit the draft again.');
    }
  } finally { busy = false; button.disabled = false; controls.forEach(control => { control.disabled = false; }); }
}
async function confirmDiscard(): Promise<boolean> {
  const { showOrbisConfirm } = await import('../ui/confirmModal');
  return showOrbisConfirm('Discard your unsaved document edits?', { title: 'Unsaved document', confirmLabel: 'Discard edits' });
}
// Keep this pure preview available to test rendering of untrusted document text.
export { documentPreview };
