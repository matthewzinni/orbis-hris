import { canEditJanus, isAdminUser } from '../services/access';
import {
  createJanusAccount,
  createJanusContact,
  deleteJanusAccount,
  deleteJanusContact,
  fetchJanusAccount,
  fetchJanusContacts,
  updateJanusAccount,
  updateJanusContact,
  type JanusAccountDraft,
  type JanusContactDraft,
} from '../services/janusStore';
import { showOrbisConfirm } from '../ui/confirmModal';
import type { JanusAccount, JanusContact } from '../types/janusTypes';
import {
  JANUS_ACCOUNT_STATUSES,
  JANUS_ACCOUNT_TYPES,
  janusAccountStatusLabel,
  janusAccountTypeLabel,
  janusContactDisplayName,
  janusFormatAddress,
} from '../types/janusTypes';
import { initJanusAccountPanels, refreshJanusAccountPanels, syncJanusPanelsEditAccess } from './janusAccountPanels';
import { initJanusMeetingDictation, stopJanusMeetingDictation } from './dictation';

declare global {
  interface Window {
    openJanusAccountDrawer?: (accountId?: string, tab?: string) => Promise<void>;
    closeJanusAccountDrawer?: () => void;
    saveJanusAccountRecord?: () => Promise<void>;
    isJanusAccountDrawerOpen?: () => boolean;
    applyJanusDrawerAccess?: () => void;
  }
}

let currentJanusAccountId: string | null = null;
let editingContactId: string | null = null;
let janusDrawerBound = false;
let janusDrawerTab: 'overview' | 'contacts' | 'meetings' | 'documents' | 'activity' = 'overview';

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function applyDrawerOpenStyles(drawer: HTMLElement, backdrop: HTMLElement | null): void {
  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.classList.remove('hidden');
    backdrop.removeAttribute('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.setProperty('display', 'block', 'important');
    backdrop.style.setProperty('visibility', 'visible', 'important');
    backdrop.style.setProperty('opacity', '1', 'important');
    backdrop.style.setProperty('z-index', '99998', 'important');
  }

  drawer.classList.add('open');
  drawer.classList.remove('hidden');
  drawer.removeAttribute('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.style.setProperty('display', 'flex', 'important');
  drawer.style.setProperty('flex-direction', 'column', 'important');
  drawer.style.setProperty('visibility', 'visible', 'important');
  drawer.style.setProperty('opacity', '1', 'important');
  drawer.style.setProperty('pointer-events', 'auto', 'important');
  drawer.style.setProperty('position', 'fixed', 'important');
  drawer.style.setProperty('top', '0', 'important');
  drawer.style.setProperty('right', '0', 'important');
  drawer.style.setProperty('bottom', '0', 'important');
  drawer.style.setProperty('height', '100vh', 'important');
  drawer.style.setProperty('max-height', '100dvh', 'important');
  drawer.style.setProperty('width', 'min(760px, 92vw)', 'important');
  drawer.style.setProperty('max-width', '92vw', 'important');
  drawer.style.setProperty('overflow', 'hidden', 'important');
  drawer.style.setProperty('transform', 'translateX(0)', 'important');
  drawer.style.setProperty('z-index', '99999', 'important');
}

function closeOtherDrawers(): void {
  ['employeeDrawer', 'candidateDrawer', 'operationsIssueDrawer'].forEach((id) => {
    const drawer = safeGet(id);
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.style.removeProperty('display');
  });
}

function populateAccountSelects(account?: JanusAccount | null): void {
  const typeSelect = safeGet<HTMLSelectElement>('janusAccountTypeInput');
  const statusSelect = safeGet<HTMLSelectElement>('janusAccountStatusInput');

  if (typeSelect) {
    typeSelect.innerHTML = JANUS_ACCOUNT_TYPES.map(
      (value) =>
        `<option value="${esc(value)}"${account?.account_type === value ? ' selected' : ''}>${esc(janusAccountTypeLabel(value))}</option>`
    ).join('');
  }

  if (statusSelect) {
    statusSelect.innerHTML = JANUS_ACCOUNT_STATUSES.map(
      (value) =>
        `<option value="${esc(value)}"${account?.status === value ? ' selected' : ''}>${esc(janusAccountStatusLabel(value))}</option>`
    ).join('');
  }
}

function readAccountDraft(): JanusAccountDraft {
  return {
    name: safeGet<HTMLInputElement>('janusAccountNameInput')?.value || '',
    account_type: (safeGet<HTMLSelectElement>('janusAccountTypeInput')?.value ||
      'other') as JanusAccountDraft['account_type'],
    status: (safeGet<HTMLSelectElement>('janusAccountStatusInput')?.value ||
      'active') as JanusAccountDraft['status'],
    owner_email: safeGet<HTMLInputElement>('janusAccountOwnerInput')?.value || null,
    website: safeGet<HTMLInputElement>('janusAccountWebsiteInput')?.value || null,
    phone: safeGet<HTMLInputElement>('janusAccountPhoneInput')?.value || null,
    address_street: safeGet<HTMLInputElement>('janusAccountStreetInput')?.value || null,
    address_city: safeGet<HTMLInputElement>('janusAccountCityInput')?.value || null,
    address_state: safeGet<HTMLInputElement>('janusAccountStateInput')?.value || null,
    address_zip: safeGet<HTMLInputElement>('janusAccountZipInput')?.value || null,
    notes: safeGet<HTMLTextAreaElement>('janusAccountNotesInput')?.value || null,
  };
}

function fillAccountForm(account: JanusAccount | null): void {
  populateAccountSelects(account);

  const values: Record<string, string> = {
    janusAccountNameInput: account?.name || '',
    janusAccountOwnerInput: account?.owner_email || '',
    janusAccountWebsiteInput: account?.website || '',
    janusAccountPhoneInput: account?.phone || '',
    janusAccountStreetInput: account?.address_street || '',
    janusAccountCityInput: account?.address_city || '',
    janusAccountStateInput: account?.address_state || '',
    janusAccountZipInput: account?.address_zip || '',
    janusAccountNotesInput: account?.notes || '',
  };

  Object.entries(values).forEach(([id, value]) => {
    const field = safeGet<HTMLInputElement | HTMLTextAreaElement>(id);
    if (field) field.value = value;
  });

  const title = safeGet('janusAccountDrawerTitle');
  const sub = safeGet('janusAccountDrawerSub');
  if (title) title.textContent = account?.name || 'New account';
  if (sub) {
    sub.textContent = account
      ? `${janusAccountTypeLabel(account.account_type)} · ${janusAccountStatusLabel(account.status)}`
      : 'Add a client, vendor, or partner';
  }

  syncJanusAccountFormAccess();

  const deleteBtn = safeGet<HTMLButtonElement>('deleteJanusAccountBtn');
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !isAdminUser() || !account?.id);
  }
}

function syncJanusContactFormAccess(): void {
  const editable = canEditJanus();

  document
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '#janusAccountDrawer [data-janus-contact-field]'
    )
    .forEach((field) => {
      field.disabled = !editable;
    });

  const contactSave = safeGet<HTMLButtonElement>('saveJanusContactBtn');
  const contactCancel = safeGet<HTMLButtonElement>('cancelJanusContactBtn');
  if (contactSave) contactSave.classList.toggle('hidden', !editable);
  if (contactCancel) contactCancel.classList.toggle('hidden', !editable);
}

function syncJanusAccountFormAccess(): void {
  const editable = canEditJanus();

  document
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '#janusAccountDrawer [data-janus-account-field]'
    )
    .forEach((field) => {
      field.disabled = !editable;
    });

  const saveBtn = safeGet<HTMLButtonElement>('saveJanusAccountBtn');
  if (saveBtn) saveBtn.classList.toggle('hidden', !editable);
}

function clearContactForm(): void {
  editingContactId = null;
  const ids = [
    'janusContactFirstNameInput',
    'janusContactLastNameInput',
    'janusContactTitleInput',
    'janusContactEmailInput',
    'janusContactPhoneInput',
    'janusContactStreetInput',
    'janusContactCityInput',
    'janusContactStateInput',
    'janusContactZipInput',
    'janusContactNotesInput',
  ];
  ids.forEach((id) => {
    const field = safeGet<HTMLInputElement | HTMLTextAreaElement>(id);
    if (field) field.value = '';
  });
  const primary = safeGet<HTMLInputElement>('janusContactPrimaryInput');
  if (primary) primary.checked = false;
  const label = safeGet('janusContactFormTitle');
  if (label) label.textContent = 'Add contact';
}

function fillContactForm(contact: JanusContact): void {
  editingContactId = contact.id;
  safeGet<HTMLInputElement>('janusContactFirstNameInput')!.value = contact.first_name || '';
  safeGet<HTMLInputElement>('janusContactLastNameInput')!.value = contact.last_name || '';
  safeGet<HTMLInputElement>('janusContactTitleInput')!.value = contact.title || '';
  safeGet<HTMLInputElement>('janusContactEmailInput')!.value = contact.email || '';
  safeGet<HTMLInputElement>('janusContactPhoneInput')!.value = contact.phone || '';
  safeGet<HTMLInputElement>('janusContactStreetInput')!.value = contact.address_street || '';
  safeGet<HTMLInputElement>('janusContactCityInput')!.value = contact.address_city || '';
  safeGet<HTMLInputElement>('janusContactStateInput')!.value = contact.address_state || '';
  safeGet<HTMLInputElement>('janusContactZipInput')!.value = contact.address_zip || '';
  safeGet<HTMLTextAreaElement>('janusContactNotesInput')!.value = contact.notes || '';
  const primary = safeGet<HTMLInputElement>('janusContactPrimaryInput');
  if (primary) primary.checked = Boolean(contact.is_primary);
  const label = safeGet('janusContactFormTitle');
  if (label) label.textContent = `Edit ${janusContactDisplayName(contact)}`;
}

function readContactDraft(accountId: string): JanusContactDraft {
  return {
    account_id: accountId,
    first_name: safeGet<HTMLInputElement>('janusContactFirstNameInput')?.value || '',
    last_name: safeGet<HTMLInputElement>('janusContactLastNameInput')?.value || '',
    title: safeGet<HTMLInputElement>('janusContactTitleInput')?.value || null,
    email: safeGet<HTMLInputElement>('janusContactEmailInput')?.value || null,
    phone: safeGet<HTMLInputElement>('janusContactPhoneInput')?.value || null,
    address_street: safeGet<HTMLInputElement>('janusContactStreetInput')?.value || null,
    address_city: safeGet<HTMLInputElement>('janusContactCityInput')?.value || null,
    address_state: safeGet<HTMLInputElement>('janusContactStateInput')?.value || null,
    address_zip: safeGet<HTMLInputElement>('janusContactZipInput')?.value || null,
    notes: safeGet<HTMLTextAreaElement>('janusContactNotesInput')?.value || null,
    is_primary: Boolean(safeGet<HTMLInputElement>('janusContactPrimaryInput')?.checked),
  };
}

function renderContactsList(contacts: JanusContact[]): void {
  const list = safeGet('janusContactsList');
  if (!list) return;

  if (!contacts.length) {
    list.innerHTML = '<div class="muted janus-empty">No contacts yet.</div>';
    return;
  }

  list.innerHTML = contacts
    .map((contact) => {
      const address = janusFormatAddress(contact);
      const actions = canEditJanus()
        ? `<div class="janus-contact-actions">
            <button type="button" class="button soft sm" data-janus-edit-contact="${esc(contact.id)}">Edit</button>
            <button type="button" class="button soft sm" data-janus-delete-contact="${esc(contact.id)}">Delete</button>
          </div>`
        : '';

      return `
        <article class="janus-contact-row">
          <div class="janus-contact-row-main">
            <div class="janus-contact-row-top">
              <strong>${esc(janusContactDisplayName(contact))}</strong>
              ${contact.is_primary ? '<span class="badge badge-active">Primary</span>' : ''}
            </div>
            <div class="muted">${esc(contact.title || '—')}</div>
            <div class="janus-contact-meta">
              ${contact.email ? `<span>${esc(contact.email)}</span>` : ''}
              ${contact.phone ? `<span>${esc(contact.phone)}</span>` : ''}
            </div>
            ${address ? `<div class="muted janus-contact-address">${esc(address)}</div>` : ''}
            ${contact.notes ? `<div class="janus-contact-notes">${esc(contact.notes)}</div>` : ''}
          </div>
          ${actions}
        </article>
      `;
    })
    .join('');
}

function setJanusDrawerTab(tab: typeof janusDrawerTab): void {
  janusDrawerTab = tab;
  document.querySelectorAll<HTMLElement>('[data-janus-drawer-tab]').forEach((button) => {
    const active = button.dataset.janusDrawerTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLElement>('[data-janus-drawer-panel]').forEach((panel) => {
    const active = panel.dataset.janusDrawerPanel === tab;
    panel.classList.toggle('hidden', !active);
    panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  if (currentJanusAccountId && (tab === 'meetings' || tab === 'documents' || tab === 'activity')) {
    void refreshJanusAccountPanels(currentJanusAccountId, tab);
  }

  if (tab === 'meetings') {
    initJanusMeetingDictation();
  }
}

async function refreshContactsPanel(): Promise<void> {
  if (!currentJanusAccountId) return;
  const contacts = await fetchJanusContacts(currentJanusAccountId);
  renderContactsList(contacts);
}

export function isJanusAccountDrawerOpen(): boolean {
  const drawer = safeGet('janusAccountDrawer');
  return Boolean(drawer?.classList.contains('open'));
}

export function closeJanusAccountDrawer(): void {
  stopJanusMeetingDictation();
  const drawer = safeGet('janusAccountDrawer');
  const backdrop = safeGet('drawerBackdrop');
  if (!drawer) return;

  drawer.classList.remove('open');
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.style.removeProperty('display');

  if (
    !safeGet('employeeDrawer')?.classList.contains('open') &&
    !safeGet('candidateDrawer')?.classList.contains('open') &&
    !safeGet('operationsIssueDrawer')?.classList.contains('open')
  ) {
    backdrop?.classList.remove('open');
    backdrop?.classList.add('hidden');
    backdrop?.setAttribute('aria-hidden', 'true');
    backdrop?.style.removeProperty('display');
    document.body.classList.remove('orbis-drawer-open');
    document.body.style.overflow = '';
  }

  currentJanusAccountId = null;
  editingContactId = null;
  clearContactForm();
}

export async function openJanusAccountDrawer(
  accountId?: string,
  tab: typeof janusDrawerTab | string = 'overview'
): Promise<void> {
  if (!canEditJanus() && !accountId) {
    showToast('You have read-only Janus access.', 'error');
    return;
  }

  const resolvedTab: typeof janusDrawerTab = [
    'overview',
    'contacts',
    'meetings',
    'documents',
    'activity',
  ].includes(String(tab))
    ? (tab as typeof janusDrawerTab)
    : 'overview';

  closeOtherDrawers();
  currentJanusAccountId = accountId || null;
  setJanusDrawerTab(resolvedTab);
  clearContactForm();

  const account = accountId ? await fetchJanusAccount(accountId) : null;
  if (accountId && !account) {
    showToast('Account not found.', 'error');
    return;
  }

  fillAccountForm(account);
  syncJanusContactFormAccess();

  const drawer = safeGet('janusAccountDrawer');
  const backdrop = safeGet('drawerBackdrop');
  if (!drawer) return;

  applyDrawerOpenStyles(drawer, backdrop);
  document.body.classList.add('orbis-drawer-open');
  document.body.style.overflow = 'hidden';

  if (currentJanusAccountId) {
    await refreshContactsPanel();
    await refreshJanusAccountPanels(currentJanusAccountId);
  } else {
    renderContactsList([]);
  }

  drawer.querySelector('.drawer-body')?.scrollTo(0, 0);
}

export async function saveJanusAccountRecord(): Promise<void> {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return;
  }

  const draft = readAccountDraft();
  if (!draft.name.trim()) {
    showToast('Account name is required.', 'error');
    return;
  }

  try {
    if (currentJanusAccountId) {
      await updateJanusAccount(currentJanusAccountId, draft);
      showToast('Account saved.');
    } else {
      const created = await createJanusAccount(draft);
      currentJanusAccountId = created.id;
      fillAccountForm(created);
      showToast('Account created.');
    }

    if (typeof window.loadJanus === 'function') {
      void window.loadJanus();
    }
  } catch (err) {
    console.error('[Janus] Save account failed:', err);
    showToast(err instanceof Error ? err.message : 'Could not save account.', 'error');
  }
}

async function saveContactRecord(): Promise<void> {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return;
  }

  if (!currentJanusAccountId) {
    showToast('Save the account before adding contacts.', 'error');
    return;
  }

  const draft = readContactDraft(currentJanusAccountId);
  if (!draft.first_name?.trim() && !draft.last_name?.trim()) {
    showToast('Contact name is required.', 'error');
    return;
  }

  try {
    if (editingContactId) {
      await updateJanusContact(editingContactId, draft);
      showToast('Contact updated.');
    } else {
      await createJanusContact(draft);
      showToast('Contact added.');
    }

    clearContactForm();
    await refreshContactsPanel();
    if (typeof window.loadJanus === 'function') {
      void window.loadJanus();
    }
  } catch (err) {
    console.error('[Janus] Save contact failed:', err);
    showToast(err instanceof Error ? err.message : 'Could not save contact.', 'error');
  }
}

async function deleteAccountRecord(): Promise<void> {
  if (!isAdminUser()) {
    showToast('Only admins can delete accounts.', 'error');
    return;
  }

  if (!currentJanusAccountId) {
    showToast('No account selected.', 'error');
    return;
  }

  const account = await fetchJanusAccount(currentJanusAccountId);
  if (!account) {
    showToast('Account not found.', 'error');
    return;
  }

  const ok = await showOrbisConfirm(
    `Delete "${account.name}" and all related contacts, meetings, documents, and activity? This cannot be undone.`,
    {
      title: 'Delete account',
      confirmLabel: 'Delete',
      danger: true,
    }
  );
  if (!ok) return;

  try {
    await deleteJanusAccount(currentJanusAccountId);
    showToast('Account deleted.');
    closeJanusAccountDrawer();
    if (typeof window.loadJanus === 'function') {
      void window.loadJanus(true);
    }
  } catch (err) {
    console.error('[Janus] Delete account failed:', err);
    showToast(err instanceof Error ? err.message : 'Could not delete account.', 'error');
  }
}

function bindJanusAccountDrawer(): void {
  if (janusDrawerBound) return;
  janusDrawerBound = true;

  const previousCloseActiveDrawer = window.closeActiveDrawer;
  window.closeActiveDrawer = () => {
    if (isJanusAccountDrawerOpen()) {
      closeJanusAccountDrawer();
      return;
    }
    previousCloseActiveDrawer?.();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!isJanusAccountDrawerOpen()) return;
    event.preventDefault();
    closeJanusAccountDrawer();
  });

  safeGet('saveJanusAccountBtn')?.addEventListener('click', () => {
    void saveJanusAccountRecord();
  });

  safeGet('saveJanusContactBtn')?.addEventListener('click', () => {
    void saveContactRecord();
  });

  safeGet('deleteJanusAccountBtn')?.addEventListener('click', () => {
    void deleteAccountRecord();
  });

  safeGet('cancelJanusContactBtn')?.addEventListener('click', () => {
    clearContactForm();
  });

  document.querySelectorAll<HTMLButtonElement>('[data-janus-drawer-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.janusDrawerTab as typeof janusDrawerTab;
      if (!tab) return;
      setJanusDrawerTab(tab);
    });
  });

  safeGet('janusContactsList')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const editBtn = target?.closest<HTMLElement>('[data-janus-edit-contact]');
    if (editBtn) {
      const contactId = editBtn.dataset.janusEditContact || '';
      if (!currentJanusAccountId || !contactId) return;
      void fetchJanusContacts(currentJanusAccountId).then((contacts) => {
        const contact = contacts.find((row) => row.id === contactId);
        if (contact) fillContactForm(contact);
      });
      return;
    }

    const deleteBtn = target?.closest<HTMLElement>('[data-janus-delete-contact]');
    if (deleteBtn) {
      const contactId = deleteBtn.dataset.janusDeleteContact || '';
      if (!contactId) return;
      void (async () => {
        const ok = await showOrbisConfirm('Delete this contact?', {
          title: 'Delete contact',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        try {
          await deleteJanusContact(contactId);
          showToast('Contact deleted.');
          clearContactForm();
          await refreshContactsPanel();
          if (typeof window.loadJanus === 'function') {
            void window.loadJanus();
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Could not delete contact.', 'error');
        }
      })();
    }
  });

  applyJanusDrawerAccess();
}

export function applyJanusDrawerAccess(): void {
  syncJanusAccountFormAccess();
  syncJanusContactFormAccess();
  syncJanusPanelsEditAccess();
}

bindJanusAccountDrawer();
initJanusAccountPanels(() => currentJanusAccountId);

window.openJanusAccountDrawer = openJanusAccountDrawer;
window.closeJanusAccountDrawer = closeJanusAccountDrawer;
window.saveJanusAccountRecord = saveJanusAccountRecord;
window.isJanusAccountDrawerOpen = isJanusAccountDrawerOpen;
window.applyJanusDrawerAccess = applyJanusDrawerAccess;
