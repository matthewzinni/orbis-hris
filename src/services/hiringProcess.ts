/**
 * BTW hiring process rules.
 *
 * 1. A need comes in (employee referral or team lead request).
 * 2. Cole approves the hire before any interviews.
 * 3. HR screening interview.
 * 4. One supervisor interview (two interviews max).
 * 5. Decision within 5 business days of the supervisor interview.
 * 6. The department's C-Suite leader stays informed throughout.
 */

export const DECISION_BUSINESS_DAYS = 5;

export const INTERVIEW_TYPES = ['Screening (HR)', 'Supervisor Interview'] as const;

/** Stages that mean a decision has been made or the candidate left the pipeline. */
const DECIDED_STAGES = new Set(['offer', 'hired', 'rejected', 'withdrawn', 'declined', 'archived']);

/** Stages that require Cole's approval first. */
const APPROVAL_REQUIRED_STAGES = new Set(['screening', 'interviewing', 'offer', 'hired']);

export type HiringChecklistFields = {
  stage?: string | null;
  hire_approved_date?: string | null;
  csuite_notified_date?: string | null;
  screening_completed_date?: string | null;
  supervisor_interview_completed_date?: string | null;
};

function parseIsoDate(value: unknown): Date | null {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds Monday–Friday days to an ISO date (YYYY-MM-DD). Holidays are not skipped. */
export function addBusinessDays(isoDate: string, days: number): string | null {
  const date = parseIsoDate(isoDate);
  if (!date) return null;

  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return toIsoDate(date);
}

export function decisionDueDate(fields: HiringChecklistFields): string | null {
  const interviewed = String(fields.supervisor_interview_completed_date || '').trim();
  if (!interviewed) return null;
  return addBusinessDays(interviewed, DECISION_BUSINESS_DAYS);
}

export function isDecisionMade(stage: unknown): boolean {
  return DECIDED_STAGES.has(String(stage || '').trim().toLowerCase());
}

export function stageRequiresHireApproval(stage: unknown): boolean {
  return APPROVAL_REQUIRED_STAGES.has(String(stage || '').trim().toLowerCase());
}

/** Whole calendar days from `todayIso` to `dueIso` (negative = overdue). */
export function calendarDaysBetween(todayIso: string, dueIso: string): number | null {
  const today = parseIsoDate(todayIso);
  const due = parseIsoDate(dueIso);
  if (!today || !due) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export type DecisionStatus =
  | { state: 'waiting' }
  | { state: 'decided' }
  | { state: 'due'; dueDate: string; daysLeft: number }
  | { state: 'overdue'; dueDate: string; daysLate: number };

export function decisionStatus(fields: HiringChecklistFields, todayIso: string): DecisionStatus {
  if (isDecisionMade(fields.stage)) return { state: 'decided' };
  const dueDate = decisionDueDate(fields);
  if (!dueDate) return { state: 'waiting' };
  const days = calendarDaysBetween(todayIso, dueDate) ?? 0;
  if (days < 0) return { state: 'overdue', dueDate, daysLate: -days };
  return { state: 'due', dueDate, daysLeft: days };
}

export function formatShortDate(isoDate: string): string {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Local calendar date as YYYY-MM-DD. */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
