/// <reference path="../types/speechRecognition.d.ts" />

export type DictationStatus = 'unsupported' | 'idle' | 'listening' | 'stopped';

export interface DictationControllerOptions {
  targetTextareaId: string;
  startBtnId: string;
  stopBtnId: string;
  statusElId: string;
  consentCheckId: string;
}

interface DictationController {
  init: () => void;
  stop: () => void;
  destroy: () => void;
  getStatus: () => DictationStatus;
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
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
      stopped: 'Stopped — review and edit notes, then click Save Meeting.',
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
      const textarea = safeGet<HTMLTextAreaElement>(options.targetTextareaId);
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

    const textarea = safeGet<HTMLTextAreaElement>(options.targetTextareaId);
    if (!textarea) {
      console.warn('[Dictation] Target textarea not found:', options.targetTextareaId);
      return;
    }

    recognition = buildRecognition();
    if (!recognition) return;

    shouldRestart = true;
    setStatus('listening');
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
  }

  return {
    init() {
      bindEvents();
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

let meetingDictationController: DictationController | null = null;

export function initMeetingDictation(): void {
  if (meetingDictationController) {
    meetingDictationController.init();
    return;
  }

  meetingDictationController = createDictationController({
    targetTextareaId: 'meetingNotes',
    startBtnId: 'meetingDictationStartBtn',
    stopBtnId: 'meetingDictationStopBtn',
    statusElId: 'meetingDictationStatus',
    consentCheckId: 'meetingDictationConsentCheck',
  });

  meetingDictationController.init();
}

export function stopMeetingDictation(): void {
  meetingDictationController?.stop();
}
