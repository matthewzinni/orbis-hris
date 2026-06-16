/**
 * ER form signatures: typed digital signature + optional draw + remote signing links.
 */

import '../styles/signature-field.css';
import { type SignatureFormType } from '../services/signatureRequests';
import { requestAndCopyEmployeeSigningLink } from '../services/employeeAcknowledgmentSigning';
import { openErAcknowledgmentPdf } from '../services/erAcknowledgmentPdf';

const initializedPads = new Set<string>();

export type SignatureRequestContext = {
  formType: SignatureFormType;
  recordId: string;
  employeeId: string;
  signerName?: string;
  signerEmail?: string;
};

let signatureRequestContext: SignatureRequestContext | null = null;

export function setSignatureRequestContext(context: SignatureRequestContext | null): void {
  signatureRequestContext = context;
}

export function getSignatureRequestContext(): SignatureRequestContext | null {
  return signatureRequestContext;
}

function readCurrentDrawerEmployee(): Record<string, unknown> | null {
  return (window.currentEmployee as Record<string, unknown> | null | undefined) ?? null;
}

function employeeIdFromRecord(employee: Record<string, unknown> | null): string {
  return String(employee?.dbId || employee?.id || employee?.employee_id || '').trim();
}

function employeeNameFromRecord(employee: Record<string, unknown> | null): string {
  if (!employee) return '';
  return [
    employee.first_name || employee.first,
    employee.last_name || employee.last,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function employeeEmailFromRecord(employee: Record<string, unknown> | null): string {
  if (!employee) return '';
  return String(employee.work_email || employee.email || '').trim();
}

function isDrawerTabActive(tabName: string): boolean {
  return Boolean(
    document.querySelector(`#employeeDrawer .tab-btn.active[data-tab="${tabName}"]`)
  );
}

function resolveSignatureRequestContextFromWindow(): SignatureRequestContext | null {
  const employee = readCurrentDrawerEmployee();
  const employeeId = employeeIdFromRecord(employee);
  if (!employeeId) return null;

  const reviewRecordId = String(
    window.currentReviewId || window.reviewAttachmentContextId || ''
  ).trim();
  if (reviewRecordId && (isDrawerTabActive('reviews') || signatureRequestContext?.formType === 'review')) {
    return {
      formType: 'review',
      recordId: reviewRecordId,
      employeeId,
      signerName: employeeNameFromRecord(employee),
      signerEmail: employeeEmailFromRecord(employee),
    };
  }

  const disciplineRecordId = String(window.currentDisciplineId || '').trim();
  if (disciplineRecordId && (isDrawerTabActive('discipline') || signatureRequestContext?.formType === 'discipline')) {
    return {
      formType: 'discipline',
      recordId: disciplineRecordId,
      employeeId,
      signerName: employeeNameFromRecord(employee),
      signerEmail: employeeEmailFromRecord(employee),
    };
  }

  const incidentRecordId = String(window.currentIncidentId || '').trim();
  if (incidentRecordId && (isDrawerTabActive('incidents') || signatureRequestContext?.formType === 'incident')) {
    return {
      formType: 'incident',
      recordId: incidentRecordId,
      employeeId,
      signerName: employeeNameFromRecord(employee),
      signerEmail: employeeEmailFromRecord(employee),
    };
  }

  return null;
}

async function ensureSignatureRequestContext(): Promise<SignatureRequestContext | null> {
  const existing = getSignatureRequestContext();
  if (existing?.recordId) return existing;

  const resolved = resolveSignatureRequestContextFromWindow();
  if (resolved?.recordId) {
    setSignatureRequestContext(resolved);
    return resolved;
  }

  if (isDrawerTabActive('reviews') && typeof window.saveReviewRecord === 'function') {
    await window.saveReviewRecord();
    const afterSave = getSignatureRequestContext();
    if (afterSave?.recordId) return afterSave;
    return resolveSignatureRequestContextFromWindow();
  }

  if (isDrawerTabActive('discipline') && typeof window.saveDisciplineRecord === 'function') {
    await window.saveDisciplineRecord();
    return getSignatureRequestContext() || resolveSignatureRequestContextFromWindow();
  }

  if (isDrawerTabActive('incidents') && typeof window.saveIncidentRecord === 'function') {
    await window.saveIncidentRecord();
    return getSignatureRequestContext() || resolveSignatureRequestContextFromWindow();
  }

  return null;
}

const TENURE_AUTOFILL_PATTERN =
  /^\d+\s*[-–]\s*\d+(\s*(year|yr|month|mo)s?)?$/i;

function isLikelyAutofillLeak(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;

  if (TENURE_AUTOFILL_PATTERN.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  if (/\d+\s*[-–]\s*\d+/.test(lower) && /\b(year|yr|month|mo)\b/.test(lower)) {
    return true;
  }

  if (/^0\s*[-–]\s*1\b/.test(lower)) return true;

  return (
    lower === 'hourly' ||
    lower === 'salary' ||
    lower === 'active' ||
    lower === 'inactive' ||
    lower === 'terminated' ||
    lower.includes('0-6 month') ||
    lower.includes('1-2 year') ||
    lower.includes('0-1 year')
  );
}

function scrubSignatureNameInput(input: HTMLInputElement | null | undefined): void {
  if (!input) return;
  if (!isLikelyAutofillLeak(input.value)) return;

  input.value = '';

  const canvas = input
    .closest('.signature-field-controls')
    ?.parentElement?.querySelector('canvas') as HTMLCanvasElement | null;

  if (!canvas?.id) return;

  const statusId = canvas.id.replace(/Signature$/i, 'SigStatus');
  clearSignaturePad(canvas.id, statusId);
}

function applySignatureAutofillGuards(input: HTMLInputElement, canvasId: string): void {
  input.id = `sigLegalName_${canvasId}`;
  input.removeAttribute('name');
  input.setAttribute('autocomplete', 'new-password');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'words');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('data-lpignore', 'true');
  input.setAttribute('data-1p-ignore', 'true');
  input.setAttribute('data-form-type', 'other');
  input.setAttribute('aria-label', 'Signer full legal name');
  input.placeholder = 'Full legal name';

  input.readOnly = true;
  const enableEditing = () => {
    input.readOnly = false;
  };
  input.addEventListener('focus', enableEditing);
  input.addEventListener('pointerdown', enableEditing);

  const scrub = () => scrubSignatureNameInput(input);
  input.addEventListener('input', scrub);
  input.addEventListener('change', scrub);
  input.addEventListener('animationstart', (event) => {
    if (event.animationName === 'onAutoFillStart') {
      scrub();
    }
  });

  scrub();
  requestAnimationFrame(scrub);
  window.setTimeout(scrub, 0);
  window.setTimeout(scrub, 120);
  window.setTimeout(scrub, 400);
}

export function scrubAllSignatureNameInputs(): void {
  document.querySelectorAll<HTMLInputElement>('.signature-typed-name').forEach((input) => {
    scrubSignatureNameInput(input);
  });
}

function ensureCanvasSize(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 320));
  const height = Math.max(120, Math.floor(rect.height || 120));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function createTypedSignatureImage(name: string, width = 640, height = 160): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const trimmed = String(name || '').trim();
  const fontSize = Math.min(56, Math.max(28, Math.floor(width / Math.max(trimmed.length, 8))));

  ctx.fillStyle = '#111827';
  ctx.font = `italic ${fontSize}px "Segoe Script", "Snell Roundhand", "Brush Script MT", cursive`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(trimmed, width / 2, height / 2 + 4);

  ctx.fillStyle = '#6b7280';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Digitally signed', width - 12, height - 12);

  return canvas.toDataURL('image/png');
}

function paintSignatureOnCanvas(canvas: HTMLCanvasElement, signature: string): void {
  ensureCanvasSize(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx || !signature) return;

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };
  image.src = signature;
}

function setSignedStatus(status: HTMLElement | null, signed: boolean): void {
  if (!status) return;
  status.textContent = signed ? 'Signed' : 'Not signed';
  status.style.color = signed ? 'green' : '#667085';
}

function mountSignatureControls(
  canvas: HTMLCanvasElement,
  statusId: string,
  options?: { allowRemote?: boolean; signerRole?: 'employee' | 'manager' | 'witness' }
): void {
  if (canvas.dataset.signatureEnhanced === 'true') return;

  const status = document.getElementById(statusId);
  const wrapper = canvas.parentElement;
  if (!wrapper) return;

  wrapper.querySelectorAll('.signature-field-controls').forEach((node) => node.remove());

  const controls = document.createElement('div');
  controls.className = 'signature-field-controls';
  controls.setAttribute('autocomplete', 'section-orbis-signature');
  controls.innerHTML = `
    <div class="signature-mode-toggle" role="tablist" aria-label="Signature method">
      <button type="button" class="signature-mode-btn is-active" data-mode="type">Type name</button>
      <button type="button" class="signature-mode-btn" data-mode="draw">Draw</button>
    </div>
    <div class="signature-typed-row">
      <input
        type="text"
        class="signature-typed-name"
        placeholder="Full legal name"
        autocomplete="section-orbis-signature name"
      />
      <button type="button" class="button soft sm signature-apply-btn">Apply signature</button>
    </div>
    <div class="signature-draw-wrap is-hidden">
      <span class="muted" style="font-size:12px;">Use mouse or touch to sign below.</span>
    </div>
  `;

  wrapper.insertBefore(controls, canvas);

  const modeButtons = controls.querySelectorAll<HTMLButtonElement>('.signature-mode-btn');
  const typedRow = controls.querySelector('.signature-typed-row') as HTMLElement;
  const drawWrap = controls.querySelector('.signature-draw-wrap') as HTMLElement;
  const typedInput = controls.querySelector<HTMLInputElement>('.signature-typed-name');
  const applyBtn = controls.querySelector<HTMLButtonElement>('.signature-apply-btn');

  const setMode = (mode: 'type' | 'draw') => {
    modeButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
    typedRow.classList.toggle('is-hidden', mode !== 'type');
    drawWrap.classList.toggle('is-hidden', mode !== 'draw');
    canvas.style.display = mode === 'draw' ? 'block' : 'none';
  };

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      setMode(btn.dataset.mode === 'draw' ? 'draw' : 'type');
    });
  });

  if (typedInput) {
    applySignatureAutofillGuards(typedInput, canvas.id);
  }

  applyBtn?.addEventListener('click', () => {
    const name = String(typedInput?.value || '').trim();
    if (isLikelyAutofillLeak(name)) {
      if (typedInput) typedInput.value = '';
      window.showToast?.('Enter the signer’s full name (not tenure or pay type).', 'error');
      return;
    }
    if (name.length < 2) {
      window.showToast?.('Enter your full name to apply a signature.', 'error');
      return;
    }

    const signature = createTypedSignatureImage(name, canvas.width || 640, canvas.height || 160);
    canvas.dataset.signature = signature;
    paintSignatureOnCanvas(canvas, signature);
    setSignedStatus(status, true);
    canvas.style.display = 'block';
  });

  if (options?.allowRemote) {
    const remoteRow = document.createElement('div');
    remoteRow.className = 'signature-remote-row';
    remoteRow.innerHTML = `
      <button type="button" class="button primary sm signature-queue-portal-btn">Copy signing link</button>
      <button type="button" class="button soft sm signature-generate-pdf-btn">Generate PDF</button>
      <span class="muted signature-remote-help" style="font-size:12px;">Email or text the link to the employee. They can sign on any device without an Orbis login.</span>
    `;
    controls.appendChild(remoteRow);

    remoteRow.querySelector('.signature-queue-portal-btn')?.addEventListener('click', () => {
      void handleQueuePortalSignature(options.signerRole || 'employee');
    });

    remoteRow.querySelector('.signature-generate-pdf-btn')?.addEventListener('click', () => {
      void handleGenerateAcknowledgmentPdf();
    });
  }

  setMode('type');
  canvas.dataset.signatureEnhanced = 'true';
}

async function handleGenerateAcknowledgmentPdf(): Promise<void> {
  const context = getSignatureRequestContext();
  if (!context?.recordId) {
    window.showToast?.('Save the form first, then generate the PDF.', 'error');
    return;
  }

  try {
    await openErAcknowledgmentPdf(context.formType, context.recordId);
    window.showToast?.('PDF downloaded.', 'success');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not generate PDF.';
    window.showToast?.(message, 'error');
  }
}

async function handleQueuePortalSignature(
  signerRole: 'employee' | 'manager' | 'witness'
): Promise<void> {
  if (signerRole !== 'employee') {
    window.showToast?.('Signing links are available for employee signatures only.', 'error');
    return;
  }

  const context = await ensureSignatureRequestContext();
  if (!context?.recordId) {
    window.showToast?.('Save the review first, then copy a signing link.', 'error');
    return;
  }

  try {
    const { reused } = await requestAndCopyEmployeeSigningLink({
      formType: context.formType,
      recordId: context.recordId,
      employeeId: context.employeeId,
      signerName: context.signerName,
      signerEmail: context.signerEmail,
    });
    window.showToast?.(
      reused
        ? 'Employee already has a pending acknowledgment in their portal — existing signing link copied.'
        : 'Signing link copied. Send it to the employee — no Orbis login required.',
      'success'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create signing link.';
    window.showToast?.(message, 'error');
  }
}

export function initSignaturePad(
  canvasId: string,
  statusId: string,
  options?: { allowRemote?: boolean; signerRole?: 'employee' | 'manager' | 'witness' }
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const status = document.getElementById(statusId);

  if (!canvas) return;

  const alreadyMounted =
    initializedPads.has(canvasId) && canvas.dataset.signatureEnhanced === 'true';
  if (alreadyMounted) return;

  if (initializedPads.has(canvasId) && canvas.dataset.signatureEnhanced !== 'true') {
    initializedPads.delete(canvasId);
    canvas.parentElement
      ?.querySelectorAll('.signature-field-controls')
      .forEach((node) => node.remove());
  }

  initializedPads.add(canvasId);
  canvas.dataset.sigInitialized = 'true';

  ensureCanvasSize(canvas);
  mountSignatureControls(canvas, statusId, options);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827';

  let drawing = false;

  const getPos = (event: MouseEvent | TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = 'touches' in event ? event.touches[0] : event;

    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (event: MouseEvent | TouchEvent) => {
    drawing = true;
    const pos = getPos(event);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (event: MouseEvent | TouchEvent) => {
    if (!drawing) return;

    if ('touches' in event) {
      event.preventDefault();
    }

    const pos = getPos(event);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!drawing) return;

    drawing = false;
    canvas.dataset.signature = canvas.toDataURL();
    setSignedStatus(status, true);
  };

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
}

export function clearSignaturePad(canvasId: string, statusId: string): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const status = document.getElementById(statusId);

  if (!canvas) return;

  ensureCanvasSize(canvas);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  delete canvas.dataset.signature;

  const typedInput = canvas.parentElement?.querySelector<HTMLInputElement>('.signature-typed-name');
  if (typedInput) typedInput.value = '';

  setSignedStatus(status, false);
}

export function getCanvasSignature(canvasId: string): string {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  return canvas?.dataset?.signature || '';
}

export function setCanvasSignature(canvasId: string, statusId: string, signature: string): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const status = document.getElementById(statusId);

  if (!canvas) return;

  if (signature) {
    ensureCanvasSize(canvas);
    canvas.style.display = 'block';
    canvas.style.background = '#ffffff';
    canvas.dataset.signature = signature;
    paintSignatureOnCanvas(canvas, signature);
    setSignedStatus(status, true);
    return;
  }

  clearSignaturePad(canvasId, statusId);
}

export function clearCanvasSignature(canvasId: string, statusId: string): void {
  clearSignaturePad(canvasId, statusId);
}

function refreshSignaturePadGuards(
  canvasId: string,
  statusId: string,
  options?: { allowRemote?: boolean; signerRole?: 'employee' | 'manager' | 'witness' }
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return;

  const typedInput = canvas.parentElement?.querySelector<HTMLInputElement>('.signature-typed-name');
  if (typedInput) {
    applySignatureAutofillGuards(typedInput, canvasId);
  }

  if (!initializedPads.has(canvasId)) {
    initSignaturePad(canvasId, statusId, options);
  }
}

export function initErSignaturePads(formPrefix: 'discipline' | 'incident' | 'review'): void {
  refreshSignaturePadGuards(`${formPrefix}EmployeeSignature`, `${formPrefix}EmployeeSigStatus`, {
    allowRemote: true,
    signerRole: 'employee',
  });
  refreshSignaturePadGuards(`${formPrefix}ManagerSignature`, `${formPrefix}ManagerSigStatus`, {
    signerRole: 'manager',
  });
  refreshSignaturePadGuards(`${formPrefix}WitnessSignature`, `${formPrefix}WitnessSigStatus`, {
    signerRole: 'witness',
  });

  document.querySelectorAll<HTMLButtonElement>('.signature-queue-portal-btn').forEach((button) => {
    button.textContent = 'Copy signing link';
  });
  document.querySelectorAll<HTMLElement>('.signature-remote-help').forEach((help) => {
    help.textContent =
      'Email or text the link to the employee. They can sign on any device without an Orbis login.';
  });

  scrubAllSignatureNameInputs();
}

window.clearSig = clearSignaturePad;
window.initDisciplineSignaturePads = () => initErSignaturePads('discipline');
window.initIncidentSignaturePads = () => initErSignaturePads('incident');
window.initReviewSignaturePads = () => initErSignaturePads('review');
window.setSignatureRequestContext = setSignatureRequestContext;
window.scrubAllSignatureNameInputs = scrubAllSignatureNameInputs;

window.requestEmployeeSignatureLink = async (
  formType,
  recordId,
  employeeId,
  signerName,
  signerEmail
) => {
  setSignatureRequestContext({
    formType,
    recordId,
    employeeId,
    signerName,
    signerEmail,
  });
  await requestAndCopyEmployeeSigningLink({
    formType,
    recordId,
    employeeId,
    signerName,
    signerEmail,
  }).then(({ reused }) => {
    window.showToast?.(
      reused
        ? 'Employee already has a pending acknowledgment in their portal — existing signing link copied.'
        : 'Signing link copied. Send it to the employee — no Orbis login required.',
      'success'
    );
  });
};

document.addEventListener('DOMContentLoaded', () => {
  initErSignaturePads('discipline');
});
