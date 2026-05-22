export type OperationsIssueStatus =
  | 'open'
  | 'investigating'
  | 'in_progress'
  | 'waiting'
  | 'resolved'
  | 'closed';

export type OperationsIssuePriority = 'low' | 'normal' | 'high' | 'urgent';

export type OperationsIssueImpact = 'low' | 'medium' | 'high' | 'critical';

export type OperationsIssueCategory =
  | 'software'
  | 'equipment'
  | 'workflow'
  | 'fulfillment'
  | 'production'
  | 'integration'
  | 'communication'
  | 'process_improvement'
  | 'safety'
  | 'other';

export interface OperationsIssue {
  id?: string;
  title?: string;
  category?: OperationsIssueCategory | string;
  system_affected?: string;
  description?: string;
  impact_level?: OperationsIssueImpact | string;
  priority?: OperationsIssuePriority | string;
  status?: OperationsIssueStatus | string;
  is_recurring?: boolean;
  department?: string;
  reported_by_email?: string;
  reported_by_name?: string;
  assigned_to_email?: string;
  assigned_to_name?: string;
  related_employee_id?: string | null;
  created_at?: string;
  updated_at?: string;
  due_date?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  root_cause?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface OperationsIssueAttachment {
  id?: string;
  issue_id?: string;
  file_name?: string;
  file_path?: string;
  mime_type?: string | null;
  file_size?: number | null;
  uploaded_by_email?: string | null;
  created_at?: string;
}

export interface OperationsIssueEvent {
  id?: string;
  issue_id?: string;
  event_type?: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
  actor_email?: string;
  actor_name?: string | null;
  created_at?: string;
}

export const OPERATIONS_STATUSES: OperationsIssueStatus[] = [
  'open',
  'investigating',
  'in_progress',
  'waiting',
  'resolved',
  'closed',
];

export const OPERATIONS_PRIORITIES: OperationsIssuePriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

export const OPERATIONS_IMPACT_LEVELS: OperationsIssueImpact[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export const OPERATIONS_CATEGORIES: OperationsIssueCategory[] = [
  'software',
  'equipment',
  'workflow',
  'fulfillment',
  'production',
  'integration',
  'communication',
  'process_improvement',
  'safety',
  'other',
];

export function formatOperationsLabel(value: string): string {
  return String(value || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeOperationsStatus(value: unknown): OperationsIssueStatus {
  const raw = String(value || 'open')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (OPERATIONS_STATUSES.includes(raw as OperationsIssueStatus)) {
    return raw as OperationsIssueStatus;
  }

  return 'open';
}
