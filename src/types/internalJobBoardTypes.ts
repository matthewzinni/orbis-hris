export type InternalJobPostingStatus = 'draft' | 'open' | 'closed' | 'filled';

export type InternalJobEmploymentType = 'full_time' | 'part_time' | 'contract' | 'temporary';

export type InternalJobInterestStatus =
  | 'new'
  | 'reviewed'
  | 'interviewing'
  | 'not_selected'
  | 'selected';

export type InternalJobPosting = {
  id: string;
  title: string;
  department: string;
  hiring_manager_name: string;
  location: string;
  employment_type: InternalJobEmploymentType;
  short_description: string;
  responsibilities: string;
  qualifications: string;
  pay_range: string | null;
  posting_date: string;
  closing_date: string | null;
  status: InternalJobPostingStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type InternalJobInterest = {
  id: string;
  posting_id: string;
  employee_id: string;
  employee_name: string;
  employee_department: string;
  employee_supervisor: string;
  interest_note: string | null;
  status: InternalJobInterestStatus;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  internal_job_postings?: Pick<InternalJobPosting, 'title' | 'department' | 'hiring_manager_name' | 'status'>;
};

export type InternalJobPostingEvent = {
  id: string;
  posting_id: string;
  interest_id: string | null;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  actor_email: string;
  actor_name: string | null;
  created_at: string;
};

export const INTERNAL_JOB_STATUSES: InternalJobPostingStatus[] = [
  'draft',
  'open',
  'closed',
  'filled',
];

export const INTERNAL_JOB_EMPLOYMENT_TYPES: InternalJobEmploymentType[] = [
  'full_time',
  'part_time',
  'contract',
  'temporary',
];

export const INTERNAL_JOB_INTEREST_STATUSES: InternalJobInterestStatus[] = [
  'new',
  'reviewed',
  'interviewing',
  'not_selected',
  'selected',
];

export function formatInternalJobStatus(status: string): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'full_time') return 'Full-time';
  if (normalized === 'part_time') return 'Part-time';
  if (normalized === 'not_selected') return 'Not selected';
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
