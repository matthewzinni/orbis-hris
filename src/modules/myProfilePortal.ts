import { getLinkedEmployeeId, hasPersonalEmployeePortal } from '../services/access';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  deleteMyEmergencyContact,
  loadMyEmergencyContacts,
  loadMyProfile,
  saveMyEmergencyContact,
  saveMyProfileContactFields,
  type MyEmergencyContactRecord,
  type MyProfileRecord,
} from '../services/employeeSelfService';
import { employeePersonalEmail, employeeWorkEmail } from '../services/employeeUtils';

declare global {
  interface Window {
    loadMyProfilePortal?: () => Promise<void>;
    saveMyProfileContactInfo?: () => Promise<void>;
    saveMyEmergencyContactPortal?: () => Promise<void>;
    deleteMyEmergencyContactPortal?: () => Promise<void>;
    resetMyEmergencyContactForm?: () => void;
  }
}

let currentMyEmergencyContactId: string | null = null;

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

function displayName(profile: MyProfileRecord): string {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.id;
}

function workLocation(profile: MyProfileRecord): string {
  return profile.is_remote ? 'Overseas / remote' : 'In house';
}

function renderReadOnlyDetails(profile: MyProfileRecord): void {
  const target = safeGet('myProfileReadOnlyGrid');
  if (!target) return;

  const rows: Array<[string, string]> = [
    ['Employee ID', profile.id],
    ['Status', String(profile.status || '—')],
    ['Department', String(profile.department || '—')],
    ['Position', String(profile.position || '—')],
    ['Supervisor', String(profile.supervisor || '—')],
    ['Work email', employeeWorkEmail(profile) || '—'],
    ['Work location', workLocation(profile)],
  ];

  target.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="detail-card">
          <div class="detail-label">${esc(label)}</div>
          <div class="detail-value">${esc(value)}</div>
        </div>
      `
    )
    .join('');
}

function populateContactFields(profile: MyProfileRecord): void {
  const phone = safeGet<HTMLInputElement>('myProfilePhoneInput');
  const personalEmail = safeGet<HTMLInputElement>('myProfilePersonalEmailInput');

  if (phone) phone.value = String(profile.phone || '').trim();
  if (personalEmail) {
    personalEmail.value = employeePersonalEmail(profile) || '';
  }

  const title = safeGet('myProfilePageTitle');
  if (title) title.textContent = displayName(profile);
}

export function resetMyEmergencyContactForm(): void {
  currentMyEmergencyContactId = null;

  const name = safeGet<HTMLInputElement>('myEcName');
  const relationship = safeGet<HTMLInputElement>('myEcRelationship');
  const phone = safeGet<HTMLInputElement>('myEcPhone');
  const altPhone = safeGet<HTMLInputElement>('myEcAltPhone');
  const notes = safeGet<HTMLTextAreaElement>('myEcNotes');

  if (name) name.value = '';
  if (relationship) relationship.value = '';
  if (phone) phone.value = '';
  if (altPhone) altPhone.value = '';
  if (notes) notes.value = '';

  safeGet('myEcDeleteBtn')?.classList.add('hidden');
}

function populateEmergencyContactForm(record: MyEmergencyContactRecord): void {
  currentMyEmergencyContactId = record.id;

  const name = safeGet<HTMLInputElement>('myEcName');
  const relationship = safeGet<HTMLInputElement>('myEcRelationship');
  const phone = safeGet<HTMLInputElement>('myEcPhone');
  const altPhone = safeGet<HTMLInputElement>('myEcAltPhone');
  const notes = safeGet<HTMLTextAreaElement>('myEcNotes');

  if (name) name.value = String(record.contact_name || '');
  if (relationship) relationship.value = String(record.relationship || '');
  if (phone) phone.value = String(record.phone || '');
  if (altPhone) altPhone.value = String(record.alternate_phone || '');
  if (notes) notes.value = String(record.notes || '');

  safeGet('myEcDeleteBtn')?.classList.remove('hidden');
}

function renderEmergencyContactList(rows: MyEmergencyContactRecord[]): void {
  const list = safeGet('myEcList');
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = '<div class="muted">No emergency contacts on file yet.</div>';
    resetMyEmergencyContactForm();
    return;
  }

  list.innerHTML = rows
    .map(
      (row) => `
        <button
          class="employee-portal-ec-card${currentMyEmergencyContactId === row.id ? ' is-active' : ''}"
          type="button"
          data-my-ec-id="${esc(row.id)}"
        >
          <div class="employee-portal-ec-card-top">
            <strong>${esc(row.contact_name || 'Emergency contact')}</strong>
            <span class="muted">${esc(row.relationship || '')}</span>
          </div>
          <div class="muted">${esc(row.phone || '')}</div>
        </button>
      `
    )
    .join('');

  list.querySelectorAll<HTMLButtonElement>('[data-my-ec-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = rows.find((item) => item.id === button.dataset.myEcId);
      if (!row) return;
      populateEmergencyContactForm(row);
      list.querySelectorAll('.employee-portal-ec-card').forEach((card) => {
        card.classList.remove('is-active');
      });
      button.classList.add('is-active');
    });
  });
}

async function loadEmergencyContactsSection(employeeId: string): Promise<void> {
  const list = safeGet('myEcList');
  if (list) list.innerHTML = '<div class="muted">Loading…</div>';

  const rows = await loadMyEmergencyContacts(employeeId);
  renderEmergencyContactList(rows);
}

export async function loadMyProfilePortal(): Promise<void> {
  if (!hasPersonalEmployeePortal()) return;

  const employeeId = getLinkedEmployeeId();
  const readOnly = safeGet('myProfileReadOnlyGrid');
  const ecList = safeGet('myEcList');

  if (!employeeId) {
    if (readOnly) {
      readOnly.innerHTML =
        '<div class="muted">No employee record is linked to your account. Contact HR to match your login email to your profile.</div>';
    }
    if (ecList) {
      ecList.innerHTML = '<div class="muted">Unable to load emergency contacts.</div>';
    }
    return;
  }

  if (readOnly) readOnly.innerHTML = '<div class="muted">Loading…</div>';

  try {
    const profile = await loadMyProfile(employeeId);
    if (!profile) {
      if (readOnly) readOnly.innerHTML = '<div class="muted">Profile not found.</div>';
      return;
    }

    renderReadOnlyDetails(profile);
    populateContactFields(profile);
    await loadEmergencyContactsSection(employeeId);
  } catch (err) {
    console.error('[MyProfilePortal]', err);
    if (readOnly) readOnly.innerHTML = '<div class="muted">Could not load your profile.</div>';
    if (ecList) ecList.innerHTML = '<div class="muted">Could not load emergency contacts.</div>';
    showToast('Could not load profile.', 'error');
  }
}

export async function saveMyProfileContactInfo(): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  if (!employeeId) {
    showToast('Your employee record is not linked. Contact HR.', 'error');
    return;
  }

  const personalEmail = String(safeGet<HTMLInputElement>('myProfilePersonalEmailInput')?.value || '').trim();
  const phone = String(safeGet<HTMLInputElement>('myProfilePhoneInput')?.value || '').trim();

  try {
    const updated = await saveMyProfileContactFields({ personalEmail, phone });
    populateContactFields(updated);
    showToast('Contact info saved.');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save profile.';
    showToast(message, 'error');
  }
}

export async function saveMyEmergencyContactPortal(): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  if (!employeeId) {
    showToast('Your employee record is not linked. Contact HR.', 'error');
    return;
  }

  const contactName = String(safeGet<HTMLInputElement>('myEcName')?.value || '').trim();
  if (!contactName) {
    showToast('Emergency contact name is required.', 'error');
    return;
  }

  try {
    await saveMyEmergencyContact({
      employeeId,
      contactId: currentMyEmergencyContactId,
      contactName,
      relationship: String(safeGet<HTMLInputElement>('myEcRelationship')?.value || '').trim(),
      phone: String(safeGet<HTMLInputElement>('myEcPhone')?.value || '').trim(),
      alternatePhone: String(safeGet<HTMLInputElement>('myEcAltPhone')?.value || '').trim(),
      notes: String(safeGet<HTMLTextAreaElement>('myEcNotes')?.value || '').trim(),
    });

    showToast('Emergency contact saved.');
    await loadEmergencyContactsSection(employeeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save emergency contact.';
    showToast(message, 'error');
  }
}

export async function deleteMyEmergencyContactPortal(): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  if (!currentMyEmergencyContactId) {
    showToast('No emergency contact selected.', 'error');
    return;
  }

  if (!(await showOrbisConfirm('Delete this emergency contact?', { confirmLabel: 'Delete' }))) {
    return;
  }

  try {
    await deleteMyEmergencyContact(currentMyEmergencyContactId);
    showToast('Emergency contact deleted.');
    resetMyEmergencyContactForm();
    if (employeeId) await loadEmergencyContactsSection(employeeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete emergency contact.';
    showToast(message, 'error');
  }
}

function bindMyProfilePortalUi(): void {
  safeGet('myProfileSaveBtn')?.addEventListener('click', () => {
    void saveMyProfileContactInfo();
  });

  safeGet('myEcSaveBtn')?.addEventListener('click', () => {
    void saveMyEmergencyContactPortal();
  });

  safeGet('myEcDeleteBtn')?.addEventListener('click', () => {
    void deleteMyEmergencyContactPortal();
  });

  safeGet('myEcAddBtn')?.addEventListener('click', () => {
    resetMyEmergencyContactForm();
    safeGet('myEcList')?.querySelectorAll('.employee-portal-ec-card').forEach((card) => {
      card.classList.remove('is-active');
    });
  });
}

bindMyProfilePortalUi();

window.loadMyProfilePortal = loadMyProfilePortal;
window.saveMyProfileContactInfo = saveMyProfileContactInfo;
window.saveMyEmergencyContactPortal = saveMyEmergencyContactPortal;
window.deleteMyEmergencyContactPortal = deleteMyEmergencyContactPortal;
window.resetMyEmergencyContactForm = resetMyEmergencyContactForm;
