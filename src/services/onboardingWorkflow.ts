import {
  STANDARD_ONBOARDING_TASKS,
  type StandardOnboardingTask,
} from './onboardingStandard';

export type OnboardingAssignee = 'employee' | 'hr' | 'supervisor';

export type OnboardingTaskRecord = {
  id: string;
  employee_id?: string;
  task_name?: string;
  status?: string;
  due_date?: string | null;
  completed_at?: string | null;
  show_in_portal?: boolean | null;
  assigned_to?: string | null;
  reminder_sent_at?: string | null;
  created_at?: string | null;
};

type TaskConfig = {
  assignee: OnboardingAssignee;
  showInPortal: boolean;
  dueOffsetDays: number;
  businessDays?: boolean;
  portalDetail: string;
  hrDetail: string;
};

export const ONBOARDING_TASK_CONFIG: Record<StandardOnboardingTask, TaskConfig> = {
  'W-4': {
    assignee: 'employee',
    showInPortal: true,
    dueOffsetDays: 0,
    portalDetail: 'Complete your W-4 and return to HR',
    hrDetail: 'Collect signed W-4 from new hire',
  },
  'NC-4': {
    assignee: 'employee',
    showInPortal: true,
    dueOffsetDays: 0,
    portalDetail: 'Complete your NC-4 state withholding form and return to HR',
    hrDetail: 'Collect signed NC-4 (North Carolina withholding) from new hire',
  },
  'I-9': {
    assignee: 'hr',
    showInPortal: true,
    dueOffsetDays: 3,
    businessDays: true,
    portalDetail: 'Complete Section 1; HR must verify documents within 3 business days of hire',
    hrDetail: 'I-9 Section 2 verification — due within 3 business days of hire date',
  },
  'Standalone Form Packet': {
    assignee: 'employee',
    showInPortal: true,
    dueOffsetDays: 7,
    portalDetail: 'Complete the standalone form packet and return to HR',
    hrDetail: 'Collect completed standalone form packet',
  },
};

const ASSIGNEE_LABELS: Record<OnboardingAssignee, string> = {
  employee: 'New hire',
  hr: 'HR',
  supervisor: 'Supervisor',
};

export function isStandardOnboardingTaskName(name: unknown): name is StandardOnboardingTask {
  return STANDARD_ONBOARDING_TASKS.includes(String(name || '').trim() as StandardOnboardingTask);
}

export function onboardingAssigneeLabel(value: unknown): string {
  const key = String(value || '').trim().toLowerCase() as OnboardingAssignee;
  return ASSIGNEE_LABELS[key] || 'HR';
}

export function parseIsoDate(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addBusinessDays(start: Date, businessDays: number): Date {
  const result = new Date(start);
  let added = 0;

  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }

  return result;
}

export function computeOnboardingDueDate(
  taskName: string,
  hireDateRaw: unknown
): string | null {
  const name = String(taskName || '').trim();
  if (!isStandardOnboardingTaskName(name)) return null;

  const hireDate = parseIsoDate(hireDateRaw);
  if (!hireDate) return null;

  const config = ONBOARDING_TASK_CONFIG[name];
  if (config.businessDays) {
    return formatIsoDate(addBusinessDays(hireDate, config.dueOffsetDays));
  }

  const due = new Date(hireDate);
  due.setDate(due.getDate() + config.dueOffsetDays);
  return formatIsoDate(due);
}

export function defaultOnboardingAssignee(taskName: string): OnboardingAssignee {
  const name = String(taskName || '').trim();
  if (!isStandardOnboardingTaskName(name)) return 'hr';
  return ONBOARDING_TASK_CONFIG[name].assignee;
}

export function defaultOnboardingShowInPortal(taskName: string): boolean {
  const name = String(taskName || '').trim();
  if (!isStandardOnboardingTaskName(name)) return true;
  return ONBOARDING_TASK_CONFIG[name].showInPortal;
}

export function onboardingPortalDetail(task: OnboardingTaskRecord): string {
  const name = String(task.task_name || '').trim();
  if (!isStandardOnboardingTaskName(name)) {
    return 'Complete and return to HR, then mark done below';
  }
  return ONBOARDING_TASK_CONFIG[name].portalDetail;
}

export function onboardingHrDetail(task: OnboardingTaskRecord): string {
  const name = String(task.task_name || '').trim();
  if (!isStandardOnboardingTaskName(name)) {
    return 'Pending onboarding task';
  }
  return ONBOARDING_TASK_CONFIG[name].hrDetail;
}

export function isOnboardingTaskCompleted(status: unknown): boolean {
  return String(status || '').trim().toLowerCase() === 'completed';
}

export function isOnboardingPortalVisible(task: OnboardingTaskRecord): boolean {
  return task.show_in_portal !== false;
}

export function daysUntilOnboardingDue(dueDateRaw: unknown): number | null {
  const due = parseIsoDate(dueDateRaw);
  if (!due) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type OnboardingDueStatus = 'overdue' | 'due_soon' | 'ok' | 'none';

export function onboardingDueStatus(dueDateRaw: unknown): OnboardingDueStatus {
  const days = daysUntilOnboardingDue(dueDateRaw);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'due_soon';
  return 'ok';
}

export function onboardingDueBadgeLabel(dueDateRaw: unknown): string {
  const status = onboardingDueStatus(dueDateRaw);
  const days = daysUntilOnboardingDue(dueDateRaw);
  const dueLabel = String(dueDateRaw || '').slice(0, 10);

  if (status === 'overdue' && days !== null) {
    return `Overdue ${Math.abs(days)}d · due ${dueLabel}`;
  }
  if (status === 'due_soon' && days !== null) {
    return days === 0 ? `Due today · ${dueLabel}` : `Due in ${days}d · ${dueLabel}`;
  }
  if (dueLabel) return `Due ${dueLabel}`;
  return 'No due date';
}

export function buildOnboardingTaskDefaults(
  taskName: string,
  hireDateRaw: unknown
): Pick<OnboardingTaskRecord, 'due_date' | 'assigned_to' | 'show_in_portal'> {
  return {
    due_date: computeOnboardingDueDate(taskName, hireDateRaw),
    assigned_to: defaultOnboardingAssignee(taskName),
    show_in_portal: defaultOnboardingShowInPortal(taskName),
  };
}
