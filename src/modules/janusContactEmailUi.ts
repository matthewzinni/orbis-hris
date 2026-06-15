import { canEditJanus } from '../services/access';
import { openJanusContactOutreachEmail } from '../services/janusContactEmail';
import { openJanusMeetingRequestEmail } from '../services/janusMeetingEmail';
import type { JanusContact } from '../types/janusTypes';

let contactEmailCache = new Map<string, JanusContact>();
let contactEmailAccountName = '';

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

export function syncJanusContactEmailCache(
  accountName: string,
  contacts: JanusContact[]
): void {
  contactEmailAccountName = String(accountName || '').trim();
  contactEmailCache.clear();
  contacts.forEach((contact) => contactEmailCache.set(contact.id, contact));
}

export function clearJanusContactEmailCache(): void {
  contactEmailAccountName = '';
  contactEmailCache.clear();
}

function readContactFromForm(): JanusContact | null {
  const email = safeGet<HTMLInputElement>('janusContactEmailInput')?.value?.trim() || '';
  if (!email) return null;

  return {
    id: '',
    account_id: '',
    first_name: safeGet<HTMLInputElement>('janusContactFirstNameInput')?.value?.trim() || '',
    last_name: safeGet<HTMLInputElement>('janusContactLastNameInput')?.value?.trim() || '',
    title: safeGet<HTMLInputElement>('janusContactTitleInput')?.value?.trim() || null,
    email,
    phone: safeGet<HTMLInputElement>('janusContactPhoneInput')?.value?.trim() || null,
    address_street: null,
    address_city: null,
    address_state: null,
    address_zip: null,
    notes: safeGet<HTMLTextAreaElement>('janusContactNotesInput')?.value?.trim() || null,
    is_primary: Boolean(safeGet<HTMLInputElement>('janusContactPrimaryInput')?.checked),
    copper_id: null,
    created_at: '',
    updated_at: '',
  };
}

function resolveContactEmailContext(
  contactId?: string,
  fallbackContact?: JanusContact | null,
  fallbackAccountName?: string
): { contact: JanusContact; accountName: string } | null {
  const accountName =
    String(fallbackAccountName || '').trim() ||
    contactEmailAccountName ||
    safeGet<HTMLInputElement>('janusAccountNameInput')?.value?.trim() ||
    '';

  const cached = contactId ? contactEmailCache.get(contactId) : null;
  const contact = cached || fallbackContact || readContactFromForm();

  if (!contact?.email) {
    return null;
  }

  return { contact, accountName: accountName || 'your organization' };
}

export function launchJanusContactOutreachEmail(options: {
  contactId?: string;
  contact?: JanusContact | null;
  accountName?: string;
} = {}): boolean {
  const context = resolveContactEmailContext(
    options.contactId,
    options.contact,
    options.accountName
  );
  if (!context) {
    showToast('Add a contact email before sending.', 'error');
    return false;
  }

  openJanusContactOutreachEmail({
    accountName: context.accountName,
    contact: context.contact,
  });
  showToast(`Opening email to ${context.contact.email}.`);
  return true;
}

export function launchJanusContactMeetingRequestEmail(options: {
  contactId?: string;
  contact?: JanusContact | null;
  accountName?: string;
  title?: string;
  notes?: string;
} = {}): boolean {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return false;
  }

  const context = resolveContactEmailContext(
    options.contactId,
    options.contact,
    options.accountName
  );
  if (!context) {
    showToast('Add a contact email before sending a meeting request.', 'error');
    return false;
  }

  const accountName = context.accountName;
  openJanusMeetingRequestEmail({
    account: { name: accountName },
    contact: context.contact,
    title: options.title || `Meeting with ${accountName}`,
    notes: options.notes || context.contact.notes || '',
  });
  showToast(`Opening meeting request to ${context.contact.email}.`);
  return true;
}
