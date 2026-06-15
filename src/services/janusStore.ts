import { getCurrentUserAccess } from './access';
import { supabaseClient } from './supabaseClient';
import type {
  JanusAccount,
  JanusAccountStatus,
  JanusAccountType,
  JanusActivity,
  JanusActivityType,
  JanusContact,
  JanusDocument,
  JanusDocumentType,
  JanusHomeStats,
  JanusMeeting,
} from '../types/janusTypes';

export type JanusAccountDraft = {
  name: string;
  account_type?: JanusAccountType;
  status?: JanusAccountStatus;
  owner_email?: string | null;
  website?: string | null;
  phone?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  notes?: string | null;
};

export type JanusContactDraft = {
  account_id: string;
  first_name?: string;
  last_name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  notes?: string | null;
  is_primary?: boolean;
  copper_id?: string | null;
};

export type JanusMeetingDraft = {
  account_id: string;
  meeting_date: string;
  title: string;
  attendees?: string[];
  transcript?: string | null;
  summary?: string | null;
  action_items?: string | null;
  follow_up_date?: string | null;
};

export type JanusActivityDraft = {
  account_id: string;
  contact_id?: string | null;
  activity_type?: JanusActivityType;
  activity_date?: string;
  subject: string;
  body?: string | null;
};

export type JanusDocumentDraft = {
  account_id: string;
  title: string;
  file_path: string;
  file_name: string;
  mime_type?: string | null;
  document_type?: JanusDocumentType;
  effective_date?: string | null;
};

export type JanusMeetingWithAccount = JanusMeeting & {
  account_name: string;
};

export type JanusSearchResult =
  | { kind: 'account'; account: JanusAccount }
  | { kind: 'contact'; contact: JanusContact; account_name: string }
  | { kind: 'meeting'; meeting: JanusMeeting; account_name: string };

export type JanusDashboardData = {
  recentMeetings: JanusMeetingWithAccount[];
  upcomingFollowUps: JanusMeetingWithAccount[];
};

function mapMeeting(row: Record<string, unknown>): JanusMeeting {
  return row as unknown as JanusMeeting;
}

function mapActivity(row: Record<string, unknown>): JanusActivity {
  return row as unknown as JanusActivity;
}

function mapDocument(row: Record<string, unknown>): JanusDocument {
  return row as unknown as JanusDocument;
}

function mapAccount(row: Record<string, unknown>): JanusAccount {
  return row as unknown as JanusAccount;
}

function mapContact(row: Record<string, unknown>): JanusContact {
  return row as unknown as JanusContact;
}

function currentUserEmail(): string | null {
  const email = String(getCurrentUserAccess()?.email || '').trim().toLowerCase();
  return email || null;
}

export async function fetchJanusHomeStats(): Promise<JanusHomeStats> {
  const [accounts, contacts, meetings, documents] = await Promise.all([
    supabaseClient.from('janus_accounts').select('id', { count: 'exact', head: true }),
    supabaseClient.from('janus_contacts').select('id', { count: 'exact', head: true }),
    supabaseClient.from('janus_meetings').select('id', { count: 'exact', head: true }),
    supabaseClient.from('janus_documents').select('id', { count: 'exact', head: true }),
  ]);

  const firstError = accounts.error || contacts.error || meetings.error || documents.error;
  if (firstError) throw firstError;

  return {
    accountCount: accounts.count ?? 0,
    contactCount: contacts.count ?? 0,
    meetingCount: meetings.count ?? 0,
    documentCount: documents.count ?? 0,
  };
}

export async function fetchJanusAccounts(): Promise<JanusAccount[]> {
  const { data, error } = await supabaseClient
    .from('janus_accounts')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => mapAccount(row as Record<string, unknown>));
}

export async function fetchJanusAccount(accountId: string): Promise<JanusAccount | null> {
  const { data, error } = await supabaseClient
    .from('janus_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapAccount(data as Record<string, unknown>) : null;
}

export async function createJanusAccount(draft: JanusAccountDraft): Promise<JanusAccount> {
  const payload = {
    name: String(draft.name || '').trim(),
    account_type: draft.account_type || 'other',
    status: draft.status || 'active',
    owner_email: draft.owner_email ?? currentUserEmail(),
    website: draft.website || null,
    phone: draft.phone || null,
    address_street: draft.address_street || null,
    address_city: draft.address_city || null,
    address_state: draft.address_state || null,
    address_zip: draft.address_zip || null,
    notes: draft.notes || null,
  };

  const { data, error } = await supabaseClient
    .from('janus_accounts')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return mapAccount(data as Record<string, unknown>);
}

export async function updateJanusAccount(
  accountId: string,
  draft: JanusAccountDraft
): Promise<JanusAccount> {
  const payload = {
    name: String(draft.name || '').trim(),
    account_type: draft.account_type || 'other',
    status: draft.status || 'active',
    owner_email: draft.owner_email || null,
    website: draft.website || null,
    phone: draft.phone || null,
    address_street: draft.address_street || null,
    address_city: draft.address_city || null,
    address_state: draft.address_state || null,
    address_zip: draft.address_zip || null,
    notes: draft.notes || null,
  };

  const { data, error } = await supabaseClient
    .from('janus_accounts')
    .update(payload)
    .eq('id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return mapAccount(data as Record<string, unknown>);
}

export async function deleteJanusAccount(accountId: string): Promise<void> {
  const { error } = await supabaseClient.from('janus_accounts').delete().eq('id', accountId);
  if (error) throw error;
}

export type JanusContactWithAccount = JanusContact & {
  account_name: string;
};

export async function fetchJanusContactsAll(): Promise<JanusContactWithAccount[]> {
  const [accounts, contactsRes] = await Promise.all([
    fetchJanusAccounts(),
    supabaseClient
      .from('janus_contacts')
      .select('*')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
  ]);

  if (contactsRes.error) throw contactsRes.error;

  const accountMap = new Map(accounts.map((account) => [account.id, account.name]));

  return (contactsRes.data || []).map((row) => {
    const contact = mapContact(row as Record<string, unknown>);
    return {
      ...contact,
      account_name: accountMap.get(contact.account_id) || '—',
    };
  });
}

export async function fetchJanusContacts(accountId: string): Promise<JanusContact[]> {
  const { data, error } = await supabaseClient
    .from('janus_contacts')
    .select('*')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('last_name', { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => mapContact(row as Record<string, unknown>));
}

export async function createJanusContact(draft: JanusContactDraft): Promise<JanusContact> {
  const payload = {
    account_id: draft.account_id,
    first_name: String(draft.first_name || '').trim(),
    last_name: String(draft.last_name || '').trim(),
    title: draft.title || null,
    email: draft.email || null,
    phone: draft.phone || null,
    address_street: draft.address_street || null,
    address_city: draft.address_city || null,
    address_state: draft.address_state || null,
    address_zip: draft.address_zip || null,
    notes: draft.notes || null,
    is_primary: Boolean(draft.is_primary),
    copper_id: draft.copper_id || null,
  };

  const { data, error } = await supabaseClient
    .from('janus_contacts')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return mapContact(data as Record<string, unknown>);
}

export async function updateJanusContact(
  contactId: string,
  draft: JanusContactDraft
): Promise<JanusContact> {
  const payload = {
    first_name: String(draft.first_name || '').trim(),
    last_name: String(draft.last_name || '').trim(),
    title: draft.title || null,
    email: draft.email || null,
    phone: draft.phone || null,
    address_street: draft.address_street || null,
    address_city: draft.address_city || null,
    address_state: draft.address_state || null,
    address_zip: draft.address_zip || null,
    notes: draft.notes || null,
    is_primary: Boolean(draft.is_primary),
  };

  const { data, error } = await supabaseClient
    .from('janus_contacts')
    .update(payload)
    .eq('id', contactId)
    .select('*')
    .single();

  if (error) throw error;
  return mapContact(data as Record<string, unknown>);
}

export async function deleteJanusContact(contactId: string): Promise<void> {
  const { error } = await supabaseClient.from('janus_contacts').delete().eq('id', contactId);
  if (error) throw error;
}

export async function fetchJanusMeetings(accountId: string): Promise<JanusMeeting[]> {
  const { data, error } = await supabaseClient
    .from('janus_meetings')
    .select('*')
    .eq('account_id', accountId)
    .order('meeting_date', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapMeeting(row as Record<string, unknown>));
}

export async function createJanusMeeting(draft: JanusMeetingDraft): Promise<JanusMeeting> {
  const payload = {
    account_id: draft.account_id,
    meeting_date: draft.meeting_date,
    title: String(draft.title || '').trim(),
    attendees: draft.attendees || [],
    transcript: draft.transcript || null,
    summary: draft.summary || null,
    action_items: draft.action_items || null,
    follow_up_date: draft.follow_up_date || null,
    logged_by_email: currentUserEmail(),
  };

  const { data, error } = await supabaseClient
    .from('janus_meetings')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return mapMeeting(data as Record<string, unknown>);
}

export async function updateJanusMeeting(
  meetingId: string,
  draft: Omit<JanusMeetingDraft, 'account_id'>
): Promise<JanusMeeting> {
  const payload = {
    meeting_date: draft.meeting_date,
    title: String(draft.title || '').trim(),
    attendees: draft.attendees || [],
    transcript: draft.transcript || null,
    summary: draft.summary || null,
    action_items: draft.action_items || null,
    follow_up_date: draft.follow_up_date || null,
  };

  const { data, error } = await supabaseClient
    .from('janus_meetings')
    .update(payload)
    .eq('id', meetingId)
    .select('*')
    .single();

  if (error) throw error;
  return mapMeeting(data as Record<string, unknown>);
}

export async function fetchJanusActivities(accountId: string): Promise<JanusActivity[]> {
  const { data, error } = await supabaseClient
    .from('janus_activities')
    .select('*')
    .eq('account_id', accountId)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapActivity(row as Record<string, unknown>));
}

export async function createJanusActivity(draft: JanusActivityDraft): Promise<JanusActivity> {
  const payload = {
    account_id: draft.account_id,
    contact_id: draft.contact_id || null,
    activity_type: draft.activity_type || 'note',
    activity_date: draft.activity_date || new Date().toISOString().slice(0, 10),
    subject: String(draft.subject || '').trim(),
    body: draft.body || null,
    created_by_email: currentUserEmail(),
  };

  const { data, error } = await supabaseClient
    .from('janus_activities')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return mapActivity(data as Record<string, unknown>);
}

export async function fetchJanusDocuments(accountId: string): Promise<JanusDocument[]> {
  const { data, error } = await supabaseClient
    .from('janus_documents')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapDocument(row as Record<string, unknown>));
}

export async function createJanusDocumentRecord(draft: JanusDocumentDraft): Promise<JanusDocument> {
  const payload = {
    account_id: draft.account_id,
    title: String(draft.title || '').trim(),
    file_path: draft.file_path,
    file_name: draft.file_name,
    mime_type: draft.mime_type || null,
    document_type: draft.document_type || 'other',
    effective_date: draft.effective_date || null,
    uploaded_by_email: currentUserEmail(),
  };

  const { data, error } = await supabaseClient
    .from('janus_documents')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return mapDocument(data as Record<string, unknown>);
}

export async function deleteJanusDocumentRecord(documentId: string): Promise<void> {
  const { error } = await supabaseClient.from('janus_documents').delete().eq('id', documentId);
  if (error) throw error;
}

function mapMeetingWithAccount(
  row: Record<string, unknown>,
  accountMap: Map<string, string>
): JanusMeetingWithAccount {
  const meeting = mapMeeting(row);
  return {
    ...meeting,
    account_name: accountMap.get(meeting.account_id) || 'Account',
  };
}

export async function fetchJanusDashboardData(): Promise<JanusDashboardData> {
  const accounts = await fetchJanusAccounts();
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const today = new Date().toISOString().slice(0, 10);

  const [recentRes, followRes] = await Promise.all([
    supabaseClient
      .from('janus_meetings')
      .select('*')
      .order('meeting_date', { ascending: false })
      .limit(8),
    supabaseClient
      .from('janus_meetings')
      .select('*')
      .not('follow_up_date', 'is', null)
      .gte('follow_up_date', today)
      .order('follow_up_date', { ascending: true })
      .limit(8),
  ]);

  if (recentRes.error) throw recentRes.error;
  if (followRes.error) throw followRes.error;

  return {
    recentMeetings: (recentRes.data || []).map((row) =>
      mapMeetingWithAccount(row as Record<string, unknown>, accountMap)
    ),
    upcomingFollowUps: (followRes.data || []).map((row) =>
      mapMeetingWithAccount(row as Record<string, unknown>, accountMap)
    ),
  };
}

export async function searchJanusGlobal(query: string): Promise<JanusSearchResult[]> {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];

  const [accounts, contactsRes, meetingsRes] = await Promise.all([
    fetchJanusAccounts(),
    supabaseClient.from('janus_contacts').select('*').limit(500),
    supabaseClient.from('janus_meetings').select('*').limit(200),
  ]);

  if (contactsRes.error) throw contactsRes.error;
  if (meetingsRes.error) throw meetingsRes.error;

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const results: JanusSearchResult[] = [];

  accounts.forEach((account) => {
    const haystack = [account.name, account.owner_email, account.phone, account.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (haystack.includes(q)) {
      results.push({ kind: 'account', account });
    }
  });

  (contactsRes.data || []).forEach((row) => {
    const contact = mapContact(row as Record<string, unknown>);
    const haystack = [
      contact.first_name,
      contact.last_name,
      contact.email,
      contact.phone,
      contact.title,
      contact.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return;
    results.push({
      kind: 'contact',
      contact,
      account_name: accountMap.get(contact.account_id) || 'Account',
    });
  });

  (meetingsRes.data || []).forEach((row) => {
    const meeting = mapMeeting(row as Record<string, unknown>);
    const haystack = [
      meeting.title,
      meeting.summary,
      meeting.transcript,
      meeting.action_items,
      meeting.meeting_date,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return;
    results.push({
      kind: 'meeting',
      meeting,
      account_name: accountMap.get(meeting.account_id) || 'Account',
    });
  });

  return results.slice(0, 25);
}

export async function upsertJanusAccountByCopperId(
  copperId: string,
  draft: JanusAccountDraft
): Promise<JanusAccount> {
  const trimmedCopper = String(copperId || '').trim();
  if (trimmedCopper) {
    const { data: existing } = await supabaseClient
      .from('janus_accounts')
      .select('*')
      .eq('copper_id', trimmedCopper)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabaseClient
        .from('janus_accounts')
        .update({
          name: String(draft.name || '').trim(),
          account_type: draft.account_type || 'other',
          status: draft.status || 'active',
          owner_email: draft.owner_email || null,
          phone: draft.phone || null,
          website: draft.website || null,
          notes: draft.notes || null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return mapAccount(data as Record<string, unknown>);
    }
  }

  const { data, error } = await supabaseClient
    .from('janus_accounts')
    .insert({
      name: String(draft.name || '').trim(),
      account_type: draft.account_type || 'other',
      status: draft.status || 'active',
      owner_email: draft.owner_email ?? currentUserEmail(),
      phone: draft.phone || null,
      website: draft.website || null,
      notes: draft.notes || null,
      copper_id: trimmedCopper || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapAccount(data as Record<string, unknown>);
}

export async function upsertJanusContactByCopperId(
  copperId: string,
  draft: JanusContactDraft
): Promise<JanusContact> {
  const trimmedCopper = String(copperId || '').trim();
  if (trimmedCopper) {
    const { data: existing } = await supabaseClient
      .from('janus_contacts')
      .select('*')
      .eq('copper_id', trimmedCopper)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabaseClient
        .from('janus_contacts')
        .update({
          first_name: String(draft.first_name || '').trim(),
          last_name: String(draft.last_name || '').trim(),
          title: draft.title || null,
          email: draft.email || null,
          phone: draft.phone || null,
          notes: draft.notes || null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return mapContact(data as Record<string, unknown>);
    }
  }

  return createJanusContact({ ...draft, copper_id: trimmedCopper || null });
}
