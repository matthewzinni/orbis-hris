import {
  getEdgeFunctionHeaders,
  getFormSignatureFunctionUrl,
  type SignatureFormType,
} from '../services/signatureRequests';
import { formatAcknowledgmentSummaryHtml } from '../services/reviewAcknowledgmentSummary';
import type { SignPayload } from '../types/signing';
import { createTypedSignatureImage } from '../ui/signaturePads';

let activeToken = '';

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function closeErSigningModal(): void {
  const backdrop = safeGet('erSigningBackdrop');
  backdrop?.classList.remove('open');
  document.body.classList.remove('orbis-modal-open', 'orbis-mobile-signing-open');
  activeToken = '';

  const body = safeGet('erSigningBody');
  if (body) body.innerHTML = '';
}

async function fetchSigningContext(token: string): Promise<SignPayload> {
  const response = await fetch(getFormSignatureFunctionUrl(token), {
    method: 'GET',
    headers: getEdgeFunctionHeaders(),
  });

  const payload = (await response.json()) as SignPayload;
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load signing request.');
  }

  return payload;
}

async function submitSignature(token: string, signature: string, signerName: string): Promise<void> {
  const response = await fetch(getFormSignatureFunctionUrl(token), {
    method: 'POST',
    headers: getEdgeFunctionHeaders(),
    body: JSON.stringify({
      signature,
      signerName,
      agreed: true,
    }),
  });

  const result = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(result.error || 'Could not submit signature.');
  }
}

function renderSigningForm(payload: SignPayload, token: string): void {
  const title = safeGet('erSigningTitle');
  const meta = safeGet('erSigningMeta');
  const body = safeGet('erSigningBody');
  if (!body) return;

  if (title) title.textContent = payload.title || 'Document acknowledgment';
  if (meta) {
    meta.textContent = [payload.subtitle, payload.date].filter(Boolean).join(' · ');
  }

  const defaultName = String(payload.signerName || payload.employeeName || '').trim();
  const summaryHtml = formatAcknowledgmentSummaryHtml(
    payload.summary || 'No document details were included with this signing request.',
    'er-signing-summary'
  );

  body.innerHTML = `
    <div class="er-signing-summary-wrap">
      <div class="er-signing-summary-label">Document snapshot</div>
      <div class="er-signing-summary-body">${summaryHtml}</div>
    </div>
    <label class="er-signing-agree">
      <input type="checkbox" id="erSigningAgree" />
      <span>I have reviewed this document and agree to sign electronically.</span>
    </label>
    <div class="signature-field-controls er-signing-signature-controls">
      <label for="erSigningName" class="er-signing-field-label">Full legal name</label>
      <div class="signature-typed-row">
        <input
          id="erSigningName"
          class="signature-typed-name"
          type="text"
          placeholder="Type your full name"
          value="${esc(defaultName)}"
          autocomplete="off"
          autocapitalize="words"
          data-lpignore="true"
          name="orbis-signer-legal-name"
        />
        <button type="button" class="button soft sm" id="erSigningPreviewBtn">Preview signature</button>
      </div>
    </div>
    <div class="er-signing-preview" id="erSigningPreview">
      <span class="muted">Signature preview</span>
    </div>
    <div class="er-signing-actions">
      <button type="button" class="button primary" id="erSigningSubmitBtn">Sign document</button>
      <button type="button" class="button soft" id="erSigningCancelBtn">Cancel</button>
    </div>
  `;

  let signatureData = '';

  safeGet<HTMLButtonElement>('erSigningPreviewBtn')?.addEventListener('click', () => {
    const name = String(safeGet<HTMLInputElement>('erSigningName')?.value || '').trim();
    if (name.length < 2) {
      showToast('Enter your full legal name.', 'error');
      return;
    }

    signatureData = createTypedSignatureImage(name);
    const preview = safeGet('erSigningPreview');
    if (preview) {
      preview.innerHTML = `<img src="${signatureData}" alt="Signature preview" />`;
    }
  });

  safeGet<HTMLButtonElement>('erSigningCancelBtn')?.addEventListener('click', () => {
    closeErSigningModal();
  });

  safeGet<HTMLButtonElement>('erSigningSubmitBtn')?.addEventListener('click', async () => {
    const agree = Boolean(safeGet<HTMLInputElement>('erSigningAgree')?.checked);
    const name = String(safeGet<HTMLInputElement>('erSigningName')?.value || '').trim();
    const submitBtn = safeGet<HTMLButtonElement>('erSigningSubmitBtn');

    if (!agree) {
      showToast('Please confirm you agree to sign electronically.', 'error');
      return;
    }

    if (!name || name.length < 2) {
      showToast('Enter your full legal name.', 'error');
      return;
    }

    if (!signatureData) {
      signatureData = createTypedSignatureImage(name);
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    try {
      await submitSignature(token, signatureData, name);
      body.innerHTML =
        '<div class="er-signing-success"><strong>Thank you.</strong> Your signature has been recorded in Orbis.</div>';
      showToast('Signature saved.');
      if (typeof window.loadMyTasksPortal === 'function') {
        void window.loadMyTasksPortal();
      }
      window.setTimeout(() => closeErSigningModal(), 1200);
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign document';
      }
      const message = err instanceof Error ? err.message : 'Could not submit signature.';
      showToast(message, 'error');
    }
  });
}

export async function openErSigningModal(token: string): Promise<void> {
  const normalized = String(token || '').trim();
  if (!normalized) {
    showToast('Signing request is missing.', 'error');
    return;
  }

  const backdrop = safeGet('erSigningBackdrop');
  const body = safeGet('erSigningBody');
  if (!backdrop || !body) {
    showToast('Signing dialog is not available.', 'error');
    return;
  }

  activeToken = normalized;
  backdrop.classList.add('open');
  document.body.classList.add('orbis-modal-open', 'orbis-mobile-signing-open');
  body.innerHTML = '<div class="muted">Loading document…</div>';

  try {
    const payload = await fetchSigningContext(normalized);
    renderSigningForm(payload, normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to load signing request.';
    body.innerHTML = `<div class="er-signing-error">${esc(message)}</div>`;
  }
}

export async function queueEmployeeSignatureAndOpenPdf(input: {
  formType: SignatureFormType;
  recordId: string;
  employeeId: string;
  signerName?: string;
  signerEmail?: string;
}): Promise<void> {
  const { requestAndCopyEmployeeSigningLink } = await import(
    '../services/employeeAcknowledgmentSigning'
  );

  try {
    const { reused } = await requestAndCopyEmployeeSigningLink(input);
    showToast(
      reused
        ? 'Employee already has a pending acknowledgment in their portal — existing signing link copied.'
        : 'Signing link copied. Send it to the employee — no Orbis login required.'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create signing link.';
    showToast(message, 'error');
  }
}

function bindErSigningModal(): void {
  if ((window as { __erSigningModalBound?: boolean }).__erSigningModalBound) return;
  (window as { __erSigningModalBound?: boolean }).__erSigningModalBound = true;

  safeGet('erSigningBackdrop')?.addEventListener('click', (event) => {
    if (event.target === safeGet('erSigningBackdrop')) {
      closeErSigningModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!safeGet('erSigningBackdrop')?.classList.contains('open')) return;
    closeErSigningModal();
  });
}

export function bootErSigningFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const token = String(params.get('signToken') || params.get('token') || '').trim();
  if (!token) return;

  // Public signing page — no Orbis or Vercel login required.
  if (!window.location.pathname.endsWith('/sign.html')) {
    window.location.replace(`/sign.html?token=${encodeURIComponent(token)}`);
    return;
  }

  void openErSigningModal(token);
}

bindErSigningModal();

window.openErSigningModal = openErSigningModal;
window.queueEmployeeSignatureAndOpenPdf = queueEmployeeSignatureAndOpenPdf;
window.bootErSigningFromUrl = bootErSigningFromUrl;
