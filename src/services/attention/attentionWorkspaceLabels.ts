import type { AttentionCategory, AttentionSeverity, AttentionStatus } from './types';

const CATEGORY_LABELS: Record<AttentionCategory, string> = {
  performance_review: 'Performance review',
  discipline: 'Discipline',
  meeting: 'Meeting',
  candidate: 'Candidate',
  employee_record: 'Employee record',
  incident: 'Incident',
  investigation: 'Investigation',
  stay_interview: 'Stay interview',
  onboarding: 'Onboarding',
  leave: 'Leave',
  policy: 'Policy',
  operations: 'Operations',
  care: 'Care',
  payroll: 'Payroll',
  benefits: 'Benefits',
  other: 'Other',
};

const SEVERITY_LABELS: Record<AttentionSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  upcoming: 'Upcoming',
  informational: 'Info',
};

const STATUS_LABELS: Record<AttentionStatus, string> = {
  new: 'New',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  overdue: 'Overdue',
};

export function attentionCategoryLabel(category: AttentionCategory | 'all'): string {
  if (category === 'all') return 'All categories';
  return CATEGORY_LABELS[category] || category;
}

export function attentionSeverityLabel(severity: AttentionSeverity | 'all'): string {
  if (severity === 'all') return 'All severities';
  return SEVERITY_LABELS[severity] || severity;
}

export function attentionStatusLabel(status: AttentionStatus | 'all'): string {
  if (status === 'all') return 'All statuses';
  return STATUS_LABELS[status] || status;
}

export const ATTENTION_WORKSPACE_CATEGORIES: AttentionCategory[] = [
  'performance_review',
  'discipline',
  'meeting',
  'candidate',
  'employee_record',
];

export const ATTENTION_WORKSPACE_SEVERITIES: AttentionSeverity[] = [
  'critical',
  'high',
  'normal',
  'upcoming',
  'informational',
];

export const ATTENTION_WORKSPACE_STATUSES: AttentionStatus[] = [
  'overdue',
  'open',
  'in_progress',
  'new',
];
