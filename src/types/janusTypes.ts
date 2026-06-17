export type JanusAccountType = 'client' | 'vendor' | 'partner' | 'publisher' | 'other';

export type JanusAccountStatus = 'active' | 'inactive' | 'prospect';

export type JanusDocumentType = 'agreement' | 'sow' | 'nda' | 'other';

export type JanusActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'visit'
  | 'note'
  | 'follow_up';

export type JanusAccount = {
  id: string;
  name: string;
  account_type: JanusAccountType;
  status: JanusAccountStatus;
  owner_email: string | null;
  website: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  notes: string | null;
  copper_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JanusContact = {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  notes: string | null;
  is_primary: boolean;
  copper_id: string | null;
  created_at: string;
  updated_at: string;
};

export type JanusMeeting = {
  id: string;
  account_id: string;
  meeting_date: string;
  title: string;
  attendees: string[];
  transcript: string | null;
  summary: string | null;
  action_items: string | null;
  follow_up_date: string | null;
  logged_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type JanusDocument = {
  id: string;
  account_id: string;
  title: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  document_type: JanusDocumentType;
  effective_date: string | null;
  uploaded_by_email: string | null;
  created_at: string;
};

export type JanusActivity = {
  id: string;
  account_id: string;
  contact_id: string | null;
  activity_type: JanusActivityType;
  activity_date: string;
  subject: string;
  body: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type JanusHomeStats = {
  accountCount: number;
  contactCount: number;
  meetingCount: number;
  documentCount: number;
};

export const JANUS_ACCOUNT_TYPES: JanusAccountType[] = [
  'client',
  'vendor',
  'partner',
  'publisher',
  'other',
];

export const JANUS_ACCOUNT_STATUSES: JanusAccountStatus[] = [
  'active',
  'inactive',
  'prospect',
];

/** Manual activity log types (meetings use the Meetings tab). */
export const JANUS_ACTIVITY_TYPES: JanusActivityType[] = [
  'call',
  'email',
  'visit',
  'note',
  'follow_up',
];

const ACCOUNT_TYPE_LABELS: Record<JanusAccountType, string> = {
  client: 'Client',
  vendor: 'Vendor',
  partner: 'Partner',
  publisher: 'Publisher',
  other: 'Other',
};

const ACCOUNT_STATUS_LABELS: Record<JanusAccountStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  prospect: 'Prospect',
};

export function janusAccountTypeLabel(value: string): string {
  return ACCOUNT_TYPE_LABELS[value as JanusAccountType] || value;
}

export function janusAccountStatusLabel(value: string): string {
  return ACCOUNT_STATUS_LABELS[value as JanusAccountStatus] || value;
}

export function janusContactDisplayName(contact: Pick<JanusContact, 'first_name' | 'last_name'>): string {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || 'Contact';
}

export function janusFormatAddress(parts: {
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
}): string {
  const line1 = String(parts.address_street || '').trim();
  const city = String(parts.address_city || '').trim();
  const state = String(parts.address_state || '').trim();
  const zip = String(parts.address_zip || '').trim();
  const line2 = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [line1, line2].filter(Boolean).join(' · ');
}

const ACTIVITY_TYPE_LABELS: Record<JanusActivityType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  visit: 'Visit',
  note: 'Note',
  follow_up: 'Follow-up',
};

const DOCUMENT_TYPE_LABELS: Record<JanusDocumentType, string> = {
  agreement: 'Agreement',
  sow: 'SOW',
  nda: 'NDA',
  other: 'Other',
};

export function janusActivityTypeLabel(value: string): string {
  return ACTIVITY_TYPE_LABELS[value as JanusActivityType] || value;
}

export function janusDocumentTypeLabel(value: string): string {
  return DOCUMENT_TYPE_LABELS[value as JanusDocumentType] || value;
}

export function formatJanusDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
