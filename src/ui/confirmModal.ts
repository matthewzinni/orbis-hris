type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

let confirmModalBound = false;
let pendingResolve: ((value: boolean) => void) | null = null;

function getModalElements() {
  return {
    backdrop: document.getElementById('orbisConfirmBackdrop'),
    title: document.getElementById('orbisConfirmTitle'),
    message: document.getElementById('orbisConfirmMessage'),
    confirmBtn: document.getElementById('orbisConfirmAccept') as HTMLButtonElement | null,
    cancelBtn: document.getElementById('orbisConfirmCancel') as HTMLButtonElement | null,
  };
}

function closeConfirmModal(result: boolean): void {
  const { backdrop, confirmBtn, cancelBtn } = getModalElements();

  backdrop?.classList.remove('open');
  document.body.classList.remove('orbis-modal-open');

  if (confirmBtn) confirmBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;

  const resolve = pendingResolve;
  pendingResolve = null;

  resolve?.(result);
}

function bindConfirmModalEvents(): void {
  if (confirmModalBound) return;
  confirmModalBound = true;

  const { backdrop, confirmBtn, cancelBtn } = getModalElements();

  confirmBtn?.addEventListener('click', () => closeConfirmModal(true));
  cancelBtn?.addEventListener('click', () => closeConfirmModal(false));

  backdrop?.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeConfirmModal(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!backdrop?.classList.contains('open')) return;
    event.preventDefault();
    closeConfirmModal(false);
  });
}

export function showOrbisConfirm(
  message: string,
  options: ConfirmOptions = {}
): Promise<boolean> {
  bindConfirmModalEvents();

  const { backdrop, title, message: messageEl, confirmBtn, cancelBtn } = getModalElements();

  if (!backdrop || !messageEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  if (pendingResolve) {
    closeConfirmModal(false);
  }

  if (title) {
    title.textContent = options.title;
    title.classList.remove('hidden');
  } else if (title) {
    title.textContent = '';
    title.classList.add('hidden');
  }

  messageEl.textContent = message;
  confirmBtn.textContent = options.confirmLabel || 'Confirm';
  cancelBtn.textContent = options.cancelLabel || 'Cancel';

  confirmBtn.classList.toggle('danger', Boolean(options.danger));
  confirmBtn.classList.toggle('primary', !options.danger);

  return new Promise<boolean>((resolve) => {
    pendingResolve = resolve;
    backdrop.classList.add('open');
    document.body.classList.add('orbis-modal-open');
    requestAnimationFrame(() => cancelBtn.focus());
  });
}

declare global {
  interface Window {
    showOrbisConfirm?: typeof showOrbisConfirm;
  }
}

window.showOrbisConfirm = showOrbisConfirm;

bindConfirmModalEvents();
