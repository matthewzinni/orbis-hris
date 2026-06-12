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
