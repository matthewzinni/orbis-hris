import { supabaseClient } from '../services/supabaseClient';

interface EmergencyContactRecord {
  id?: string;
  employee_id?: string;
  contact_name?: string;
  relationship?: string;
  phone?: string;
  alternate_phone?: string;
  notes?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface EmergencyContactEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    currentEmployee?: EmergencyContactEmployee;
    currentEmergencyContactId?: string | null;

    loadEmergencyContacts?: (employeeId: string) => Promise<void>;
    saveEmergencyContact?: () => Promise<void>;
    deleteEmergencyContact?: () => Promise<void>;
    resetEmergencyContactForm?: () => void;

    showToast?: (message: string, type?: string) => void;
    safeGet?: (id: string) => HTMLElement | null;
    applyRolePermissions?: () => void;
  }
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }

  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: string = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nl2br(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function getCurrentEmployee(): EmergencyContactEmployee | null {
  return window.currentEmployee || null;
}

function getEmployeeLookupIds(
  employee: EmergencyContactEmployee | null,
  fallbackId?: string
): string[] {
  return [employee?.dbId, employee?.employee_id, employee?.id, employee?.displayId, fallbackId]
    .filter(Boolean)
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function getResolvedEmployeeId(fallbackId?: string): string {
  const employee = getCurrentEmployee();

  return String(
    employee?.dbId || employee?.employee_id || employee?.id || employee?.displayId || fallbackId || ''
  ).trim();
}

export function resetEmergencyContactForm(): void {
  window.currentEmergencyContactId = null;

  const name = safeGet<HTMLInputElement>('ecName');
  const relationship = safeGet<HTMLInputElement>('ecRelationship');
  const phone = safeGet<HTMLInputElement>('ecPhone');
  const altPhone = safeGet<HTMLInputElement>('ecAltPhone');
  const notes = safeGet<HTMLTextAreaElement>('ecNotes');

  if (name) name.value = '';
  if (relationship) relationship.value = '';
  if (phone) phone.value = '';
  if (altPhone) altPhone.value = '';
  if (notes) notes.value = '';

  safeGet('deleteECBtn')?.classList.add('hidden');

  if (typeof window.applyRolePermissions === 'function') {
    window.applyRolePermissions();
  }
}

function bindAddEmergencyContactButton(): void {
  safeGet('addEmergencyContactBtn')?.addEventListener('click', () => {
    resetEmergencyContactForm();
  });
}

function populateEmergencyContactForm(record: EmergencyContactRecord): void {
  window.currentEmergencyContactId = record.id || null;

  const name = safeGet<HTMLInputElement>('ecName');
  const relationship = safeGet<HTMLInputElement>('ecRelationship');
  const phone = safeGet<HTMLInputElement>('ecPhone');
  const altPhone = safeGet<HTMLInputElement>('ecAltPhone');
  const notes = safeGet<HTMLTextAreaElement>('ecNotes');

  if (name) name.value = record.contact_name || '';
  if (relationship) relationship.value = record.relationship || '';
  if (phone) phone.value = record.phone || '';
  if (altPhone) altPhone.value = record.alternate_phone || '';
  if (notes) notes.value = record.notes || '';

  safeGet('deleteECBtn')?.classList.remove('hidden');

  if (typeof window.applyRolePermissions === 'function') {
    window.applyRolePermissions();
  }
}

export async function loadEmergencyContacts(employeeId: string): Promise<void> {
  const target = safeGet('ecHistory');

  if (!target) {
    console.warn('[EmergencyContacts] ecHistory container not found.');
    return;
  }

  const activeEmployee = getCurrentEmployee();
  const primaryEmployeeId = String(employeeId || getResolvedEmployeeId() || '').trim();
  const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

  if (!primaryEmployeeId && !employeeIds.length) {
    resetEmergencyContactForm();
    target.innerHTML = '<div class="empty">No employee selected.</div>';
    return;
  }

  const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];
  const saveEmployeeId = getResolvedEmployeeId(primaryEmployeeId);

  target.innerHTML = '<div class="empty">Loading emergency contacts...</div>';

  try {
    const { data, error } = await supabaseClient
      .from('emergency_contacts')
      .select('*')
      .in('employee_id', idsToSearch)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[EmergencyContacts] Load failed:', error);
      target.innerHTML = '<div class="empty">Could not load emergency contacts.</div>';
      return;
    }

    const rows = (data || []) as EmergencyContactRecord[];

    if (!rows.length) {
      resetEmergencyContactForm();
      target.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:600;">Emergency Contacts</div>
          <button class="button soft" id="addEmergencyContactBtn" type="button">+ Add New</button>
        </div>
        <div class="empty">No emergency contacts on file</div>
      `;
      bindAddEmergencyContactButton();
      return;
    }

    const selectedId = window.currentEmergencyContactId;

    if (
      !selectedId ||
      !rows.some((row) => String(row.id) === String(selectedId))
    ) {
      resetEmergencyContactForm();
    }

    target.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-weight:600;">Emergency Contacts</div>
        <button class="button soft" id="addEmergencyContactBtn" type="button">+ Add New</button>
      </div>
      ${rows
        .map(
          (row, index) => `
        <div class="history-item" data-ec-id="${escapeHtml(row.id || '')}" style="cursor:pointer; ${String(window.currentEmergencyContactId) === String(row.id) ? 'border:1px solid var(--blue, #2e75b6);' : ''}">
          <div class="history-top">
            <div>
              <div class="history-title">${escapeHtml(row.contact_name || 'Emergency Contact')}</div>
              <div class="history-date">${escapeHtml(row.relationship || '')}</div>
            </div>
            <span class="badge badge-soft">${index === 0 ? 'Primary' : 'Contact'}</span>
          </div>
          <div class="history-body">
            <strong>Phone:</strong> ${escapeHtml(row.phone || '')}<br>
            <strong>Alternate:</strong> ${escapeHtml(row.alternate_phone || '')}<br><br>
            <strong>Notes:</strong><br>${nl2br(row.notes || '')}
          </div>
        </div>
      `
        )
        .join('')}
    `;

    bindAddEmergencyContactButton();

    target.querySelectorAll<HTMLElement>('[data-ec-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const row = rows.find((item) => String(item.id) === String(card.dataset.ecId));

        if (!row) return;

        populateEmergencyContactForm(row);

        target.querySelectorAll<HTMLElement>('[data-ec-id]').forEach((item) => {
          item.style.border = '';
        });

        card.style.border = '1px solid var(--blue, #2e75b6)';
      });
    });

  } catch (err) {
    console.error('[EmergencyContacts] Unexpected load failure:', err);
    target.innerHTML = '<div class="empty">Could not load emergency contacts.</div>';
  }
}

export async function saveEmergencyContact(): Promise<void> {
  const employeeId = getResolvedEmployeeId();

  if (!getCurrentEmployee() || !employeeId) {
    showToast('No employee selected.', 'error');
    return;
  }

  const payload = {
    employee_id: employeeId,
    contact_name: safeGet<HTMLInputElement>('ecName')?.value.trim() || '',
    relationship: safeGet<HTMLInputElement>('ecRelationship')?.value.trim() || '',
    phone: safeGet<HTMLInputElement>('ecPhone')?.value.trim() || '',
    alternate_phone: safeGet<HTMLInputElement>('ecAltPhone')?.value.trim() || '',
    notes: safeGet<HTMLTextAreaElement>('ecNotes')?.value.trim() || '',
  };

  if (!payload.contact_name) {
    showToast('Enter the emergency contact name.', 'error');
    return;
  }

  const contactId = window.currentEmergencyContactId;

  const result = contactId
    ? await supabaseClient
        .from('emergency_contacts')
        .update({
          contact_name: payload.contact_name,
          relationship: payload.relationship,
          phone: payload.phone,
          alternate_phone: payload.alternate_phone,
          notes: payload.notes,
        })
        .eq('id', contactId)
        .eq('employee_id', employeeId)
    : await supabaseClient.from('emergency_contacts').insert([payload]);

  if (result.error) {
    console.error('[EmergencyContacts] Save failed:', result.error);
    showToast(
      `Could not save emergency contact: ${result.error.message || 'Unknown error'}`,
      'error'
    );
    return;
  }

  showToast(contactId ? 'Emergency contact updated.' : 'Emergency contact saved.');

  resetEmergencyContactForm();
  await loadEmergencyContacts(employeeId);
}

export async function deleteEmergencyContact(): Promise<void> {
  const contactId = window.currentEmergencyContactId;

  if (!contactId) {
    showToast('No emergency contact to delete.', 'error');
    return;
  }

  if (!confirm('Are you sure you want to delete this emergency contact?')) {
    return;
  }

  const employeeId = getResolvedEmployeeId();

  const { error } = await supabaseClient.from('emergency_contacts').delete().eq('id', contactId);

  if (error) {
    console.error('[EmergencyContacts] Delete failed:', error);
    showToast('Could not delete emergency contact.', 'error');
    return;
  }

  showToast('Emergency contact deleted.');

  resetEmergencyContactForm();

  if (employeeId) {
    await loadEmergencyContacts(employeeId);
  }
}

window.loadEmergencyContacts = loadEmergencyContacts;
window.saveEmergencyContact = saveEmergencyContact;
window.deleteEmergencyContact = deleteEmergencyContact;
window.resetEmergencyContactForm = resetEmergencyContactForm;
