import { createTypedSignatureImage } from './ui/signaturePads';
import { getEdgeFunctionHeaders, getFormSignatureFunctionUrl } from './services/signatureRequests';
import { formatAcknowledgmentSummaryHtml } from './services/reviewAcknowledgmentSummary';
import type { SignPayload } from './types/signing';
import { esc } from './utils/helpers';

function formatDisplayDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function signingUrl(token: string): string {
  const url = new URL(getFormSignatureFunctionUrl(token));
  if (new URLSearchParams(window.location.search).has('group')) {
    url.searchParams.delete('token');
    url.searchParams.set('group', token);
  }
  return url.toString();
}

function getTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('group') || params.get('token') || params.get('signToken') || '').trim();
}

function renderError(message: string): void {
  const body = document.getElementById('signBody');
  if (!body) return;
  body.innerHTML = `<div class="sign-error">${esc(message)}</div>`;
}

function renderSuccess(): void {
  const body = document.getElementById('signBody');
  if (!body) return;
  body.innerHTML =
    '<div class="sign-success"><strong>Thank you.</strong> Your signature has been recorded.</div>';
}

async function fetchSigningContext(token: string): Promise<SignPayload> {
  const response = await fetch(signingUrl(token), {
    method: 'GET',
    headers: getEdgeFunctionHeaders(),
  });

  const payload = (await response.json()) as SignPayload;
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load signing request.');
  }

  return payload;
}

function renderSigningForm(payload: SignPayload, token: string): void {
  const title = document.getElementById('signTitle');
  const meta = document.getElementById('signMeta');
  const body = document.getElementById('signBody');

  if (!body) return;

  if (title) title.textContent = payload.title || 'Document signing';
  if (meta) {
    meta.textContent = [payload.subtitle, formatDisplayDate(payload.date)].filter(Boolean).join(' · ');
  }

  const groupSigning = payload.groupSigning === true;
  const defaultName = String(payload.signerName || payload.employeeName || '').trim();
  const summaryHtml = formatAcknowledgmentSummaryHtml(
    payload.summary || 'No document details were included with this signing request.'
  );

  body.innerHTML = `
    <div class="sign-summary">
      <div class="sign-summary-label">Document snapshot</div>
      <div class="sign-summary-body">${summaryHtml}</div>
    </div>
    <label style="display:flex; gap:8px; align-items:flex-start; font-size:14px;">
      <input type="checkbox" id="signAgree" />
      <span>I have reviewed this document and agree to sign electronically.</span>
    </label>
    <div class="signature-field-controls" style="margin-top:14px;">
      ${groupSigning ? `<p class="muted">Enter your first and last name as recorded with HR.</p>
      <label for="signFirstName">First name</label>
      <input id="signFirstName" name="given-name" autocomplete="given-name" maxlength="100" placeholder="First name" />
      <label for="signLastName">Last name</label>
      <input id="signLastName" name="family-name" autocomplete="family-name" maxlength="100" placeholder="Last name" />
      <button type="button" class="button soft" id="signApplyBtn">Preview signature</button>` : `
      <label for="signName" style="font-size:12px; font-weight:700; color:#667085; text-transform:uppercase;">Full legal name</label>
      <div class="signature-typed-row" style="display:flex; gap:8px;">
        <input
          id="signName"
          type="text"
          placeholder="Type your full name"
          value="${esc(defaultName)}"
          autocomplete="off"
          autocapitalize="words"
          data-lpignore="true"
          name="orbis-signer-legal-name"
        />
        <button type="button" class="button soft" id="signApplyBtn">Preview signature</button>
      </div>`}
    </div>
    <div id="signFeedback" role="alert" aria-live="polite"></div>
    <div class="sign-preview" id="signPreview"><span class="muted">Signature preview</span></div>
    <div class="sign-actions">
      <button type="button" class="button primary" id="signSubmitBtn">Sign document</button>
    </div>
  `;

  const field = (id: string) => String((document.getElementById(id) as HTMLInputElement | null)?.value || '').trim();
  const nameValue = () => groupSigning ? `${field('signFirstName')} ${field('signLastName')}`.trim() : field('signName');
  const validName = () => groupSigning ? Boolean(field('signFirstName') && field('signLastName')) : nameValue().length >= 2;
  let signatureData = '';

  ['signName', 'signFirstName', 'signLastName'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
    signatureData = '';
    const preview = document.getElementById('signPreview');
    if (preview) preview.innerHTML = '<span class="muted">Signature preview</span>';
  }));

  document.getElementById('signApplyBtn')?.addEventListener('click', () => {
    const name = nameValue();
    if (!validName()) {
      alert(groupSigning ? 'Enter both your first and last name.' : 'Enter your full legal name.');
      return;
    }

    signatureData = createTypedSignatureImage(name);
    const preview = document.getElementById('signPreview');
    if (preview) {
      preview.innerHTML = `<img src="${signatureData}" alt="Signature preview" />`;
    }
  });

  document.getElementById('signSubmitBtn')?.addEventListener('click', async () => {
    const agree = (document.getElementById('signAgree') as HTMLInputElement | null)?.checked;
    const name = nameValue();

    if (!agree) {
      alert('Please confirm you agree to sign electronically.');
      return;
    }

    if (!validName()) {
      alert(groupSigning ? 'Enter both your first and last name.' : 'Enter your full legal name.');
      return;
    }

    // Always sign the name currently entered, even if an earlier name was previewed.
    signatureData = createTypedSignatureImage(name);

    const submitBtn = document.getElementById('signSubmitBtn') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    const feedback = document.getElementById('signFeedback');
    if (feedback) feedback.textContent = '';
    try {
      const response = await fetch(signingUrl(token), {
        method: 'POST',
        headers: getEdgeFunctionHeaders(),
        body: JSON.stringify({
          signature: signatureData,
          signerName: name,
          ...(groupSigning ? { firstName: field('signFirstName'), lastName: field('signLastName') } : {}),
          agreed: true,
        }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Could not submit signature.');
      }

      renderSuccess();
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign document';
      }
      if (feedback) {
        feedback.className = 'sign-error';
        feedback.textContent = err instanceof Error ? err.message : 'Could not submit signature.';
      }
    }
  });
}

async function boot(): Promise<void> {
  const token = getTokenFromUrl();
  if (!token) {
    renderError('This signing link is missing a token.');
    return;
  }

  try {
    const payload = await fetchSigningContext(token);
    renderSigningForm(payload, token);
  } catch (err) {
    renderError(err instanceof Error ? err.message : 'Unable to load signing request.');
  }
}

void boot();
