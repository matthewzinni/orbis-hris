import { createTypedSignatureImage } from './ui/signaturePads';
import { getEdgeFunctionHeaders, getFormSignatureFunctionUrl } from './services/signatureRequests';

type SignPayload = {
  status?: string;
  title?: string;
  subtitle?: string;
  date?: string;
  summary?: string;
  signerName?: string;
  error?: string;
};

function getTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('token') || params.get('signToken') || '').trim();
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function renderSigningForm(payload: SignPayload, token: string): void {
  const title = document.getElementById('signTitle');
  const meta = document.getElementById('signMeta');
  const body = document.getElementById('signBody');

  if (!body) return;

  if (title) title.textContent = payload.title || 'Document signing';
  if (meta) {
    meta.textContent = [payload.subtitle, payload.date].filter(Boolean).join(' · ');
  }

  const defaultName = String(payload.signerName || '').trim();

  body.innerHTML = `
    <div class="sign-summary">${esc(payload.summary || 'Please review and sign this document.')}</div>
    <label style="display:flex; gap:8px; align-items:flex-start; font-size:14px;">
      <input type="checkbox" id="signAgree" />
      <span>I have reviewed this document and agree to sign electronically.</span>
    </label>
    <div class="signature-field-controls" style="margin-top:14px;">
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
      </div>
    </div>
    <div class="sign-preview" id="signPreview"><span class="muted">Signature preview</span></div>
    <div class="sign-actions">
      <button type="button" class="button primary" id="signSubmitBtn">Sign document</button>
    </div>
  `;

  let signatureData = '';

  document.getElementById('signApplyBtn')?.addEventListener('click', () => {
    const name = String((document.getElementById('signName') as HTMLInputElement | null)?.value || '').trim();
    if (name.length < 2) {
      alert('Enter your full legal name.');
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
    const name = String((document.getElementById('signName') as HTMLInputElement | null)?.value || '').trim();

    if (!agree) {
      alert('Please confirm you agree to sign electronically.');
      return;
    }

    if (!name || name.length < 2) {
      alert('Enter your full legal name.');
      return;
    }

    if (!signatureData) {
      signatureData = createTypedSignatureImage(name);
    }

    const submitBtn = document.getElementById('signSubmitBtn') as HTMLButtonElement | null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }

    try {
      const response = await fetch(getFormSignatureFunctionUrl(token), {
        method: 'POST',
        headers: getEdgeFunctionHeaders(),
        body: JSON.stringify({
          signature: signatureData,
          signerName: name,
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
      alert(err instanceof Error ? err.message : 'Could not submit signature.');
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
