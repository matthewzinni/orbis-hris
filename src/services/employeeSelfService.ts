import { supabaseClient } from './supabaseClient';

export type MyProfileRecord = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
  position?: string | null;
  supervisor?: string | null;
  phone?: string | null;
  work_email?: string | null;
  personal_email?: string | null;
  email?: string | null;
  is_remote?: boolean | null;
  status?: string | null;
};

export type MyEmergencyContactRecord = {
  id: string;
  employee_id?: string | null;
  contact_name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  notes?: string | null;
};

const PROFILE_SELECT =
  'id, first_name, last_name, department, position, supervisor, phone, work_email, personal_email, email, is_remote, status';

export async function loadMyProfile(employeeId: string): Promise<MyProfileRecord | null> {
  const id = String(employeeId || '').trim();
  if (!id) return null;

  const { data, error } = await supabaseClient
    .from('employees')
    .select(PROFILE_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Could not load profile.');
  }

  return (data as MyProfileRecord | null) ?? null;
}

export async function saveMyProfileContactFields(input: {
  personalEmail: string;
  phone: string;
}): Promise<MyProfileRecord> {
  const { data, error } = await supabaseClient.rpc('orbis_update_my_profile', {
    p_personal_email: input.personalEmail.trim(),
    p_phone: input.phone.trim(),
  });

  if (error) {
    throw new Error(error.message || 'Could not save profile.');
  }

  return data as MyProfileRecord;
}

export async function loadMyEmergencyContacts(employeeId: string): Promise<MyEmergencyContactRecord[]> {
  const id = String(employeeId || '').trim();
  if (!id) return [];

  const { data, error } = await supabaseClient
    .from('emergency_contacts')
    .select('id, employee_id, contact_name, relationship, phone, alternate_phone, notes, created_at')
    .eq('employee_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Could not load emergency contacts.');
  }

  return (data || []) as MyEmergencyContactRecord[];
}

export async function saveMyEmergencyContact(input: {
  employeeId: string;
  contactId?: string | null;
  contactName: string;
  relationship: string;
  phone: string;
  alternatePhone: string;
  notes: string;
}): Promise<void> {
  const employeeId = String(input.employeeId || '').trim();
  if (!employeeId) {
    throw new Error('No employee record linked.');
  }

  const payload = {
    employee_id: employeeId,
    contact_name: input.contactName.trim(),
    relationship: input.relationship.trim(),
    phone: input.phone.trim(),
    alternate_phone: input.alternatePhone.trim(),
    notes: input.notes.trim(),
  };

  const contactId = String(input.contactId || '').trim();
  const result = contactId
    ? await supabaseClient.from('emergency_contacts').update(payload).eq('id', contactId)
    : await supabaseClient.from('emergency_contacts').insert([payload]);

  if (result.error) {
    throw new Error(result.error.message || 'Could not save emergency contact.');
  }
}

export async function deleteMyEmergencyContact(contactId: string): Promise<void> {
  const id = String(contactId || '').trim();
  if (!id) {
    throw new Error('No emergency contact selected.');
  }

  const { error } = await supabaseClient.from('emergency_contacts').delete().eq('id', id);

  if (error) {
    throw new Error(error.message || 'Could not delete emergency contact.');
  }
}
