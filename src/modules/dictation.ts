/// <reference path="../types/speechRecognition.d.ts" />

export type DictationStatus = 'unsupported' | 'idle' | 'listening' | 'stopped';

export interface DictationTargetOption {
  id: string;
  label: string;
}

export interface DictationControllerOptions {
  targetTextareaId: string;
  startBtnId: string;
  stopBtnId: string;
  statusElId: string;
  consentCheckId: string;
  targetSelectId?: string;
  targetTextareaIds?: string[];
  targetLabelById?: Record<string, string>;
  stoppedHint?: string;
}

interface DictationController {
  init: () => void;
  stop: () => void;
  destroy: () => void;
  getStatus: () => DictationStatus;
}

interface MountDictationConfig {
  prefix: string;
  textareaId: string;
  targets?: DictationTargetOption[];
  consentText?: string;
  stoppedHint?: string;
}

const DEFAULT_CONSENT_TEXT =
  'Before using dictation, make sure the employee knows notes are being transcribed. Speech recognition runs in your browser; Orbis does not save or upload audio.';

const controllers = new Map<string, DictationController>();

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognition) | null {
  const win = window as Window;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function appendTranscript(textarea: HTMLTextAreaElement, transcript: string): void {
  const chunk = String(transcript || '').trim();
  if (!chunk) return;

  const existing = String(textarea.value || '').trimEnd();
  textarea.value = existing ? `${existing}\n${chunk}` : chunk;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function setTargetSelectValue(selectId: string | undefined, textareaId: string): void {
  if (!selectId || !textareaId) return;

  const select = safeGet<HTMLSelectElement>(selectId);
  if (!select) return;

  const hasOption = Array.from(select.options).some((option) => option.value === textareaId);
  if (hasOption) {
    select.value = textareaId;
  }
}

function getFocusedTargetId(targetIds: string[]): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement)) return null;

  const id = String(active.id || '').trim();
  return targetIds.includes(id) ? id : null;
}

function resolveTargetTextareaId(options: DictationControllerOptions): string | null {
  const focused = options.targetTextareaIds?.length
    ? getFocusedTargetId(options.targetTextareaIds)
    : null;
  if (focused) {
    setTargetSelectValue(options.targetSelectId, focused);
    return focused;
  }

  if (options.targetSelectId) {
    const select = safeGet<HTMLSelectElement>(options.targetSelectId);
    const selected = String(select?.value || '').trim();
    if (selected) return selected;
  }

  return String(options.targetTextareaId || '').trim() || null;
}

function listeningStatusForTarget(
  options: DictationControllerOptions,
  textareaId: string | null
): string {
  const label = textareaId ? options.targetLabelById?.[textareaId] : undefined;
  if (label) {
    return `Listening… dictating into: ${label}. Click another field to switch.`;
  }
  return 'Listening… speak naturally. Click a field or Stop when finished.';
}

export function createDictationController(options: DictationControllerOptions): DictationController {
  const RecognitionCtor = getSpeechRecognitionConstructor();
  let status: DictationStatus = RecognitionCtor ? 'idle' : 'unsupported';
  let recognition: SpeechRecognition | null = null;
  let shouldRestart = false;
  let bound = false;

  function setStatus(next: DictationStatus, message?: string): void {
    status = next;
    const statusEl = safeGet(options.statusElId);
    if (!statusEl) return;

    statusEl.classList.remove('listening', 'stopped', 'unsupported');

    const labels: Record<DictationStatus, string> = {
      unsupported:
        'Dictation is not supported in this browser. Use Chrome or Edge, or type notes manually.',
      idle: 'Not started',
      listening: 'Listening… speak naturally. Click Stop when finished.',
      stopped: options.stoppedHint || 'Stopped — review and edit, then save.',
    };

    statusEl.textContent = message || labels[next];
    statusEl.classList.toggle('listening', next === 'listening');
    statusEl.classList.toggle('stopped', next === 'stopped');
    statusEl.classList.toggle('unsupported', next === 'unsupported');
  }

  function updateButtons(): void {
    const startBtn = safeGet<HTMLButtonElement>(options.startBtnId);
    const stopBtn = safeGet<HTMLButtonElement>(options.stopBtnId);
    const consentCheck = safeGet<HTMLInputElement>(options.consentCheckId);
    const consentOk = Boolean(consentCheck?.checked);

    if (!startBtn || !stopBtn) return;

    if (status === 'unsupported') {
      startBtn.classList.add('hidden');
      stopBtn.classList.add('hidden');
      startBtn.disabled = true;
      stopBtn.disabled = true;
      return;
    }

    if (status === 'listening') {
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      startBtn.disabled = true;
      stopBtn.disabled = false;
      return;
    }

    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    stopBtn.disabled = true;
    startBtn.disabled = !consentOk;
  }

  function buildRecognition(): SpeechRecognition | null {
    if (!RecognitionCtor) return null;

    const instance = new RecognitionCtor();
    instance.continuous = true;
    instance.interimResults = false;
    instance.lang = 'en-US';

    instance.onresult = (event: SpeechRecognitionEvent) => {
      const targetId = resolveTargetTextareaId(options);
      const textarea = targetId ? safeGet<HTMLTextAreaElement>(targetId) : null;
      if (!textarea) return;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const transcript = result[0]?.transcript || '';
        appendTranscript(textarea, transcript);
      }
    };

    instance.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        return;
      }

      console.warn('[Dictation] Recognition error:', event.error, event.message);
      shouldRestart = false;

      if (event.error === 'not-allowed') {
        setStatus('idle', 'Microphone access was denied. Allow the mic and try again.');
      } else {
        setStatus('stopped', 'Dictation stopped due to a recognition error.');
      }

      updateButtons();
    };

    instance.onend = () => {
      if (shouldRestart && status === 'listening') {
        try {
          instance.start();
        } catch (err) {
          console.warn('[Dictation] Could not restart recognition:', err);
          shouldRestart = false;
          setStatus('stopped');
          updateButtons();
        }
        return;
      }

      if (status === 'listening') {
        setStatus('stopped');
        updateButtons();
      }
    };

    return instance;
  }

  function syncTargetFromFocus(): string | null {
    const focused = options.targetTextareaIds?.length
      ? getFocusedTargetId(options.targetTextareaIds)
      : null;
    if (focused) {
      setTargetSelectValue(options.targetSelectId, focused);
      return focused;
    }
    return resolveTargetTextareaId(options);
  }

  function bindTargetFocusRouting(): void {
    if (!options.targetTextareaIds?.length) return;

    options.targetTextareaIds.forEach((textareaId) => {
      const textarea = safeGet<HTMLTextAreaElement>(textareaId);
      if (!textarea || textarea.dataset.dictationFocusBound === 'true') return;

      textarea.dataset.dictationFocusBound = 'true';
      textarea.addEventListener('focus', () => {
        setTargetSelectValue(options.targetSelectId, textareaId);
        if (status === 'listening') {
          setStatus('listening', listeningStatusForTarget(options, textareaId));
        }
      });
    });
  }

  function start(): void {
    if (status === 'unsupported' || !RecognitionCtor) {
      setStatus('unsupported');
      updateButtons();
      return;
    }

    const consentCheck = safeGet<HTMLInputElement>(options.consentCheckId);
    if (!consentCheck?.checked) {
      setStatus('idle', 'Confirm participant notice before starting dictation.');
      updateButtons();
      return;
    }

    const targetId = syncTargetFromFocus();
    const textarea = targetId ? safeGet<HTMLTextAreaElement>(targetId) : null;
    if (!textarea) {
      console.warn('[Dictation] Target textarea not found:', targetId);
      return;
    }

    recognition = buildRecognition();
    if (!recognition) return;

    shouldRestart = true;
    setStatus('listening', listeningStatusForTarget(options, targetId));
    updateButtons();

    try {
      recognition.start();
    } catch (err) {
      console.warn('[Dictation] Could not start recognition:', err);
      shouldRestart = false;
      setStatus('idle', 'Could not start dictation. Try again.');
      updateButtons();
    }
  }

  function stop(): void {
    shouldRestart = false;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
    }

    if (status === 'listening') {
      setStatus('stopped');
    }

    updateButtons();
  }

  function bindEvents(): void {
    if (bound) return;
    bound = true;

    const startBtn = safeGet<HTMLButtonElement>(options.startBtnId);
    const stopBtn = safeGet<HTMLButtonElement>(options.stopBtnId);
    const consentCheck = safeGet<HTMLInputElement>(options.consentCheckId);
    const targetSelect = options.targetSelectId
      ? safeGet<HTMLSelectElement>(options.targetSelectId)
      : null;

    startBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      start();
    });

    stopBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      stop();
    });

    consentCheck?.addEventListener('change', () => {
      if (status === 'idle' || status === 'stopped') {
        updateButtons();
      }
    });

    targetSelect?.addEventListener('change', () => {
      if (status === 'listening') {
        stop();
      }
    });
  }

  return {
    init() {
      bindEvents();
      bindTargetFocusRouting();
      setStatus(status);
      updateButtons();
    },
    stop,
    destroy() {
      stop();
      bound = false;
    },
    getStatus() {
      return status;
    },
  };
}

function buildDictationMarkup(config: MountDictationConfig): string {
  const prefix = config.prefix;
  const consentText = config.consentText || DEFAULT_CONSENT_TEXT;
  const targetSelectHtml = config.targets?.length
    ? `
      <div class="field">
        <label for="${prefix}DictationTarget">Dictate into</label>
        <p class="muted dictation-target-hint" style="margin: 0 0 6px; font-size: 0.82rem">
          Click the field you want to fill before starting, or pick a target below. While listening,
          click another field to switch where speech goes.
        </p>
        <select id="${prefix}DictationTarget">
          ${config.targets
            .map(
              (target) =>
                `<option value="${escapeHtml(target.id)}">${escapeHtml(target.label)}</option>`
            )
            .join('')}
        </select>
      </div>
    `
    : '';

  return `
    ${targetSelectHtml}
    <div class="field dictation-field" data-dictation-prefix="${escapeHtml(prefix)}">
      <label>Voice dictation</label>
      <div class="dictation-consent" role="note">${escapeHtml(consentText)}</div>
      <label class="dictation-consent-check" for="${prefix}DictationConsentCheck">
        <input type="checkbox" id="${prefix}DictationConsentCheck" />
        I confirm the employee was informed that notes are being transcribed.
      </label>
      <div class="button-row">
        <button class="button soft" type="button" id="${prefix}DictationStartBtn" disabled>
          Start Dictation
        </button>
        <button class="button soft hidden" type="button" id="${prefix}DictationStopBtn">
          Stop Dictation
        </button>
      </div>
      <div class="dictation-status muted" id="${prefix}DictationStatus" aria-live="polite">
        Not started
      </div>
    </div>
  `;
}

function mountDictation(config: MountDictationConfig): DictationController | null {
  const textarea = safeGet<HTMLTextAreaElement>(config.textareaId);
  if (!textarea) {
    console.warn('[Dictation] Could not mount — textarea missing:', config.textareaId);
    return null;
  }

  const field = textarea.closest('.field');
  if (!field?.parentElement) {
    return null;
  }

  const existing = field.parentElement.querySelector(
    `[data-dictation-prefix="${config.prefix}"]`
  );
  if (!existing) {
    const mount = document.createElement('div');
    mount.className = 'dictation-mount';
    mount.innerHTML = buildDictationMarkup(config);
    field.parentElement.insertBefore(mount, field);
  }

  const defaultTargetId = config.targets?.[0]?.id || config.textareaId;
  const targetLabelById = Object.fromEntries(
    (config.targets || []).map((target) => [target.id, target.label])
  );
  const controller = createDictationController({
    targetTextareaId: defaultTargetId,
    targetSelectId: config.targets?.length ? `${config.prefix}DictationTarget` : undefined,
    targetTextareaIds: config.targets?.map((target) => target.id),
    targetLabelById: config.targets?.length ? targetLabelById : undefined,
    startBtnId: `${config.prefix}DictationStartBtn`,
    stopBtnId: `${config.prefix}DictationStopBtn`,
    statusElId: `${config.prefix}DictationStatus`,
    consentCheckId: `${config.prefix}DictationConsentCheck`,
    stoppedHint: config.stoppedHint,
  });

  controller.init();
  controllers.set(config.prefix, controller);
  return controller;
}

export function stopAllDictation(): void {
  controllers.forEach((controller) => controller.stop());
}

export function stopMeetingDictation(): void {
  stopAllDictation();
}

function registerCareDictationController(targets: DictationTargetOption[]): void {
  const usable = targets.filter((target) => Boolean(safeGet<HTMLTextAreaElement>(target.id)));
  if (!usable.length) return;

  controllers.get('care')?.destroy();

  const targetLabelById = Object.fromEntries(usable.map((target) => [target.id, target.label]));
  const controller = createDictationController({
    targetTextareaId: usable[0].id,
    targetSelectId: 'careDictationTarget',
    targetTextareaIds: usable.map((target) => target.id),
    targetLabelById,
    startBtnId: 'careDictationStartBtn',
    stopBtnId: 'careDictationStopBtn',
    statusElId: 'careDictationStatus',
    consentCheckId: 'careDictationConsentCheck',
    stoppedHint: 'Stopped — review and edit, then save the care record.',
  });

  controller.init();
  controllers.set('care', controller);
}

export function updateCareDictationTargets(targets: DictationTargetOption[]): void {
  const select = safeGet<HTMLSelectElement>('careDictationTarget');
  const root = document.querySelector('[data-care-dictation-root]') as HTMLElement | null;
  if (!select) return;

  const usable = targets.filter((target) => Boolean(safeGet<HTMLTextAreaElement>(target.id)));
  if (root) {
    root.classList.toggle('hidden', !usable.length);
  }

  if (!usable.length) {
    select.innerHTML = '<option value="">No text fields in this form</option>';
    controllers.get('care')?.stop();
    return;
  }

  select.innerHTML = usable
    .map((target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(target.label)}</option>`)
    .join('');

  registerCareDictationController(usable);
}

function initCareEngagementDictation(): void {
  const cardBody = document.querySelector('#careEngagementDrawer .card-body');
  if (!cardBody || cardBody.querySelector('[data-care-dictation-root]')) {
    return;
  }

  const mount = document.createElement('div');
  mount.dataset.careDictationRoot = 'true';
  mount.className = 'dictation-mount';
  mount.innerHTML = buildDictationMarkup({
    prefix: 'care',
    textareaId: 'careNoteSummaryInput',
    targets: [{ id: 'careNoteSummaryInput', label: 'Notes / summary' }],
    consentText:
      'Before using dictation, confirm the employee knows notes are being transcribed. Speech recognition runs in your browser; Orbis does not save or upload audio.',
    stoppedHint: 'Stopped — review and edit, then save the care record.',
  }).replace(
    'id="careDictationTarget"',
    'id="careDictationTarget" aria-label="Dictation target field"'
  );

  cardBody.insertBefore(mount, cardBody.firstChild);

  registerCareDictationController([
    { id: 'careNoteSummaryInput', label: 'Notes / summary' },
  ]);
}

export function initInvestigationDictation(): void {
  if (controllers.has('invInterview')) {
    controllers.get('invInterview')?.init();
    return;
  }

  mountDictation({
    prefix: 'invInterview',
    textareaId: 'invInterviewNotesInput',
    consentText:
      'Before using dictation, confirm the interview participant knows notes are being transcribed. Speech recognition runs in your browser; Orbis does not save or upload audio.',
    stoppedHint: 'Stopped — review and edit, then click Add Interview.',
  });
}

export function stopInvestigationDictation(): void {
  controllers.get('invInterview')?.stop();
}

export function initMeetingDictation(): void {
  if (controllers.has('meeting')) {
    controllers.get('meeting')?.init();
    return;
  }

  const controller = createDictationController({
    targetTextareaId: 'meetingNotes',
    startBtnId: 'meetingDictationStartBtn',
    stopBtnId: 'meetingDictationStopBtn',
    statusElId: 'meetingDictationStatus',
    consentCheckId: 'meetingDictationConsentCheck',
    stoppedHint: 'Stopped — review and edit notes, then click Save Meeting.',
  });

  controller.init();
  controllers.set('meeting', controller);
}

export function initEmployeeDrawerDictation(): void {
  initMeetingDictation();

  mountDictation({
    prefix: 'note',
    textareaId: 'noteText',
    stoppedHint: 'Stopped — review and edit, then click Save Note.',
  });

  mountDictation({
    prefix: 'discipline',
    textareaId: 'disciplineDescription',
    targets: [
      { id: 'disciplineDescription', label: 'Description' },
      { id: 'disciplineAction', label: 'Action Taken' },
    ],
    stoppedHint: 'Stopped — review and edit, then click Save Discipline Report.',
  });

  mountDictation({
    prefix: 'incident',
    textareaId: 'incidentDescription',
    targets: [
      { id: 'incidentDescription', label: 'Description' },
      { id: 'incidentFollowUp', label: 'Follow-Up / Corrective Action' },
    ],
    stoppedHint: 'Stopped — review and edit, then click Save Incident Report.',
  });

  mountDictation({
    prefix: 'stayInterview',
    textareaId: 'stayQ1',
    targets: [
      { id: 'stayQ1', label: 'Question 1' },
      { id: 'stayQ2', label: 'Question 2' },
      { id: 'stayQ3', label: 'Question 3' },
      { id: 'stayQ4', label: 'Question 4' },
      { id: 'stayQ5', label: 'Question 5' },
      { id: 'stayQ6', label: 'Question 6' },
      { id: 'stayQ7', label: 'Question 7' },
      { id: 'stayManagerSummary', label: 'HR / Manager Summary' },
    ],
    stoppedHint: 'Stopped — review and edit, then click Save Stay Interview.',
  });

  mountDictation({
    prefix: 'review',
    textareaId: 'reviewStrengths',
    targets: [
      { id: 'reviewStrengths', label: 'Strongest contributions' },
      { id: 'reviewImprovements', label: 'Areas needing improvement' },
      { id: 'reviewEmployeeComments', label: 'Employee comments' },
      { id: 'reviewManagerComments', label: 'Manager action plan' },
    ],
    stoppedHint: 'Stopped — review and edit, then click Save Review.',
  });

  initCareEngagementDictation();
}

function initOrbisDictation(): void {
  initEmployeeDrawerDictation();
  initInvestigationDictation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOrbisDictation);
} else {
  initOrbisDictation();
}
