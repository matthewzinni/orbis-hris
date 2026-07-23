/**
 * Unified attention-item model for Orbis workforce action queues.
 * Source records remain authoritative; these items are derived at evaluation time.
 */

export type AttentionCategory =
  | 'performance_review'
  | 'discipline'
  | 'meeting'
  | 'candidate'
  | 'employee_record'
  | 'incident'
  | 'investigation'
  | 'stay_interview'
  | 'onboarding'
  | 'leave'
  | 'policy'
  | 'operations'
  | 'care'
  | 'payroll'
  | 'benefits'
  | 'other';

export type AttentionSeverity =
  | 'informational'
  | 'upcoming'
  | 'normal'
  | 'high'
  | 'critical';

export type AttentionStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'dismissed'
  | 'overdue';

export type AttentionSourceType =
  | 'employee'
  | 'candidate'
  | 'discipline_report'
  | 'employee_meeting'
  | 'employee_review'
  | 'investigation'
  | 'leave_request'
  | 'onboarding_task'
  | 'other';

export type AttentionRoute =
  | { type: 'employee'; employeeId: string; drawerTab?: string }
  | { type: 'candidate'; candidateId: string; drawerTab?: string }
  | { type: 'investigation'; investigationId: string }
  | { type: 'operations'; issueId: string }
  | { type: 'view'; viewId: string }
  | { type: 'payroll_handoff'; handoffId: string; employeeId: string }
  | { type: 'internal_job'; postingId: string; interestId: string };

export type AttentionItem = {
  id: string;
  dedupeKey: string;
  category: AttentionCategory;
  severity: AttentionSeverity;
  status: AttentionStatus;
  title: string;
  explanation: string;
  employeeId?: string;
  employeeName?: string;
  candidateId?: string;
  responsibleRole?: 'admin' | 'supervisor' | 'hr_leadership' | 'employee';
  createdDate?: string | null;
  dueDate?: string | null;
  sourceType: AttentionSourceType;
  sourceId: string;
  recommendedAction: string;
  route: AttentionRoute;
  evaluatedAt: string;
};

export type AttentionWorkspace = {
  items: AttentionItem[];
  evaluatedAt: string;
  error?: string;
};

export type AttentionSummary = {
  totalOpen: number;
  overdue: number;
  dueToday: number;
  dueSoon: number;
  highPriority: number;
  assignedToCurrentUser: number;
};

export type AttentionFilter = {
  category?: AttentionCategory | 'all';
  severity?: AttentionSeverity | 'all';
  status?: AttentionStatus | 'all';
  search?: string;
  sort?: 'urgency' | 'dueDate' | 'employee' | 'category';
};
