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
  const dialog = backdrop?.querySelector('.orbis-confirm-dialog') as HTMLElement | null;

  confirmBtn?.addEventListener('click', () => closeConfirmModal(true));
  cancelBtn?.addEventListener('click', () => closeConfirmModal(false));

  dialog?.addEventListener('click', (event) => {
    // Prevent drawer/document click handlers from seeing modal clicks.
    event.stopPropagation();
  });

  backdrop?.addEventListener('click', (event) => {
    event.stopPropagation();
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
  options: ConfirmOptions | string = {}
): Promise<boolean> {
  bindConfirmModalEvents();

  const { backdrop, title, message: messageEl, confirmBtn, cancelBtn } = getModalElements();

  if (!backdrop || !messageEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  if (pendingResolve) {
    closeConfirmModal(false);
  }

  const normalizedOptions: ConfirmOptions =
    typeof options === 'string' ? { title: options } : options;

  if (title && normalizedOptions.title) {
    title.textContent = normalizedOptions.title;
    title.classList.remove('hidden');
  } else if (title) {
    title.textContent = '';
    title.classList.add('hidden');
  }

  messageEl.textContent = message;
  confirmBtn.textContent = normalizedOptions.confirmLabel || 'Confirm';
  cancelBtn.textContent = normalizedOptions.cancelLabel || 'Cancel';

  confirmBtn.classList.toggle('danger', Boolean(normalizedOptions.danger));
  confirmBtn.classList.toggle('primary', !normalizedOptions.danger);

  return new Promise<boolean>((resolve) => {
    pendingResolve = resolve;
    backdrop.classList.add('open');
    document.body.classList.add('orbis-modal-open');
    requestAnimationFrame(() => cancelBtn.focus());
  });
}

window.showOrbisConfirm = showOrbisConfirm;

bindConfirmModalEvents();
