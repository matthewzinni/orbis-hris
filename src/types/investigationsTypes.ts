export type InvestigationStatus =
  | 'intake'
  | 'open'
  | 'interviewing'
  | 'evidence_review'
  | 'findings_drafted'
  | 'action_pending'
  | 'closed';

export type InvestigationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type InvestigationCategory =
  | 'harassment'
  | 'discrimination'
  | 'workplace_conflict'
  | 'policy_violation'
  | 'safety'
  | 'complaint'
  | 'rumor'
  | 'disciplinary'
  | 'other';

export type InvestigationOutcome =
  | 'unsubstantiated'
  | 'substantiated'
  | 'inconclusive'
  | 'policy_reminder'
  | 'coaching'
  | 'corrective_action'
  | 'termination_recommended'
  | 'process_improvement'
  | 'referred_to_leadership';

export type InterviewType = 'complainant' | 'respondent' | 'witness' | 'supervisor' | 'other';

export type SubjectRole = InterviewType | 'focus' | 'targeted' | 'other';

export interface Investigation {
  id?: string;
  case_number?: string;
  title?: string;
  allegation_summary?: string | null;
  category?: InvestigationCategory | string;
  source_of_complaint?: string | null;
  reported_by_name?: string | null;
  reported_by_email?: string | null;
  reported_by_employee_id?: string | null;
  status?: InvestigationStatus | string;
  severity?: InvestigationSeverity | string;
  assigned_investigator_email?: string | null;
  assigned_investigator_name?: string | null;
  opened_at?: string | null;
  target_completion_date?: string | null;
  closed_at?: string | null;
  findings_summary?: string | null;
  outcome?: InvestigationOutcome | string | null;
  recommended_action?: string | null;
  follow_up_date?: string | null;
  confidential_notes?: string | null;
  witnesses?: string | null;
  primary_employee_id?: string | null;
  targeted_employee_id?: string | null;
  linked_incident_report_id?: string | null;
  linked_discipline_report_id?: number | string | null;
  ai_guidance?: string | null;
  created_at?: string;
  updated_at?: string;
  investigation_subjects?: InvestigationSubject[];
}

export interface InvestigationSubject {
  id?: string;
  investigation_id?: string;
  employee_id?: string;
  subject_role?: SubjectRole | string;
  display_name?: string | null;
}

export interface InvestigationInterview {
  id?: string;
  investigation_id?: string;
  interview_type?: InterviewType | string;
  interview_date?: string | null;
  interviewer_email?: string | null;
  interviewer_name?: string | null;
  notes?: string;
  created_at?: string;
}

export interface InvestigationTimelineEvent {
  id?: string;
  investigation_id?: string;
  event_type?: string;
  note?: string | null;
  actor_email?: string;
  actor_name?: string | null;
  created_at?: string;
}

export interface InvestigationEvidence {
  id?: string;
  investigation_id?: string;
  evidence_type?: string;
  title?: string;
  file_path?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  linked_record_id?: string | null;
  linked_record_type?: string | null;
  external_url?: string | null;
  uploaded_by_email?: string | null;
  created_at?: string;
}

export const INVESTIGATION_STATUSES: InvestigationStatus[] = [
  'intake',
  'open',
  'interviewing',
  'evidence_review',
  'findings_drafted',
  'action_pending',
  'closed',
];

export const INVESTIGATION_CATEGORIES: InvestigationCategory[] = [
  'harassment',
  'discrimination',
  'workplace_conflict',
  'policy_violation',
  'safety',
  'complaint',
  'rumor',
  'disciplinary',
  'other',
];

export const INVESTIGATION_SEVERITIES: InvestigationSeverity[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export const INVESTIGATION_OUTCOMES: InvestigationOutcome[] = [
  'unsubstantiated',
  'substantiated',
  'inconclusive',
  'policy_reminder',
  'coaching',
  'corrective_action',
  'termination_recommended',
  'process_improvement',
  'referred_to_leadership',
];

export const INTERVIEW_TYPES: InterviewType[] = [
  'complainant',
  'respondent',
  'witness',
  'supervisor',
  'other',
];

export function formatInvestigationLabel(value: string): string {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeInvestigationStatus(value: unknown): InvestigationStatus {
  const raw = String(value || 'intake').trim().toLowerCase();
  return INVESTIGATION_STATUSES.includes(raw as InvestigationStatus)
    ? (raw as InvestigationStatus)
    : 'intake';
}
