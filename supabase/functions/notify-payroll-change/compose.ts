/**
 * Pure email composition for payroll/accounting notifications.
 * No Deno or network imports, so Vitest can cover it (src/security/payrollChangeEmail.test.ts).
 */

export type PayrollHandoffRow = {
  id: string;
  employee_id: string;
  change_type: string;
  effective_date: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string | null;
};

export type PayrollEmployeeRow = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
  position?: string | null;
  supervisor?: string | null;
  status?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
  pay_type?: string | null;
  standard_hours?: number | string | null;
  benefits_status?: string | null;
};

/**
 * One key per kind of payroll event. Which keys actually email is set by the
 * PAYROLL_NOTIFY_EVENTS secret (comma-separated); see DEFAULT_PAYROLL_NOTIFY_EVENTS.
 */
export type PayrollEventKey =
  | 'new_hire'
  | 'termination'
  | 'rehire'
  | 'unpaid_leave'
  | 'paid_leave'
  | 'status_change'
  | 'pay_type'
  | 'title'
  | 'department'
  | 'benefits'
  | 'manual';

export const ALL_PAYROLL_EVENTS: PayrollEventKey[] = [
  'new_hire',
  'termination',
  'rehire',
  'unpaid_leave',
  'paid_leave',
  'status_change',
  'pay_type',
  'title',
  'department',
  'benefits',
  'manual',
];

export const DEFAULT_PAYROLL_NOTIFY_EVENTS: PayrollEventKey[] = ['new_hire', 'termination'];

const UNPAID_LEAVE_TYPES = new Set(['unpaid', 'fmla']);

const LEAVE_LABELS: Record<string, string> = {
  pto: 'PTO',
  sick: 'Sick',
  bereavement: 'Bereavement',
  fmla: 'FMLA (unpaid)',
  unpaid: 'Unpaid',
  other: 'Other',
};

const PAID_LEAVE_PHRASES: Record<string, string> = {
  pto: 'PTO',
  sick: 'sick leave',
  bereavement: 'bereavement leave',
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function upper(value: unknown): string {
  return text(value).toUpperCase();
}

function dateOnly(value: unknown): string {
  return text(value).slice(0, 10);
}

/** "2026-11-24" → "Tue, Nov 24, 2026"; anything unparseable is returned as-is. */
export function formatPayrollDate(value: unknown): string {
  const iso = dateOnly(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function payrollEventKey(handoff: PayrollHandoffRow): PayrollEventKey {
  const type = text(handoff.change_type).toLowerCase();
  const payload = handoff.payload || {};

  switch (type) {
    case 'new_hire':
      return 'new_hire';
    case 'termination':
      return 'termination';
    case 'rate':
      return 'pay_type';
    case 'title':
      return 'title';
    case 'department':
      return 'department';
    case 'benefits':
      return 'benefits';
    case 'status': {
      if (text(payload.leave_request_id)) {
        return UNPAID_LEAVE_TYPES.has(text(payload.leave_type).toLowerCase())
          ? 'unpaid_leave'
          : 'paid_leave';
      }
      if (upper(payload.from) === 'TERMINATED' && upper(payload.to) !== 'TERMINATED') {
        return 'rehire';
      }
      return 'status_change';
    }
    default:
      return 'manual';
  }
}

export function parsePayrollNotifyEvents(raw: string | null | undefined): Set<PayrollEventKey> {
  const value = text(raw);
  if (!value) return new Set(DEFAULT_PAYROLL_NOTIFY_EVENTS);
  const allowed = new Set<string>(ALL_PAYROLL_EVENTS);
  const keys = value
    .split(/[,\s;]+/)
    .map((key) => key.trim().toLowerCase())
    .filter((key) => allowed.has(key)) as PayrollEventKey[];
  return new Set(keys);
}

export function parseRecipientEmails(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  text(raw)
    .split(/[,\s;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    .forEach((email) => seen.add(email));
  return Array.from(seen);
}

export function employeeFullName(
  employee: PayrollEmployeeRow | null | undefined,
  handoff: PayrollHandoffRow
): string {
  const name = `${text(employee?.first_name)} ${text(employee?.last_name)}`.trim();
  if (name) return name;
  // Handoff summaries end with "— {name}" (see src/services/payrollHandoff.ts).
  const fromSummary = text(handoff.summary).split(' — ').pop() || '';
  return text(fromSummary.split(' · ')[0]) || text(handoff.employee_id) || 'An employee';
}

function changeLine(handoff: PayrollHandoffRow): string {
  const payload = handoff.payload || {};
  const from = text(payload.from) || '—';
  const to = text(payload.to);
  return to ? `${from} → ${to}` : '';
}

function leaveDates(payload: Record<string, unknown>): string {
  const start = dateOnly(payload.start_date);
  const end = dateOnly(payload.end_date);
  if (!start) return '';
  if (!end || end === start) return formatPayrollDate(start);
  return `${formatPayrollDate(start)} – ${formatPayrollDate(end)}`;
}

/** A manually logged summary, without a trailing " — {name}" or final period. */
function manualSummary(handoff: PayrollHandoffRow, name: string): string {
  let summary = text(handoff.summary);
  const suffix = ` — ${name}`;
  if (summary.endsWith(suffix)) summary = summary.slice(0, -suffix.length);
  return summary.replace(/[.\s]+$/, '') || 'see details below';
}

function openingLine(
  event: PayrollEventKey,
  contact: string,
  name: string,
  handoff: PayrollHandoffRow
): string {
  const payload = handoff.payload || {};
  switch (event) {
    case 'new_hire':
      return `${contact}, ${name} was hired. Please add them to payroll.`;
    case 'termination':
      return `${contact}, ${name} has been terminated. Please process their final paycheck.`;
    case 'rehire':
      return `${contact}, ${name} was rehired. Please add them back to payroll.`;
    case 'unpaid_leave':
      return `${contact}, ${name} was approved for unpaid leave (${leaveDates(payload)}). Please adjust their pay for those dates.`;
    case 'paid_leave':
      return `${contact}, ${name} was approved for ${PAID_LEAVE_PHRASES[text(payload.leave_type).toLowerCase()] || 'paid time off'} (${leaveDates(payload)}). Please make sure it is paid on their next check.`;
    case 'status_change':
      return `${contact}, ${name}'s employment status changed (${changeLine(handoff)}). Please update payroll.`;
    case 'pay_type':
      return `${contact}, ${name}'s pay type changed (${changeLine(handoff)}). Please update payroll.`;
    case 'title':
      return `${contact}, ${name}'s job title changed (${changeLine(handoff)}). Please update payroll.`;
    case 'department':
      return `${contact}, ${name} moved departments (${changeLine(handoff)}). Please update payroll.`;
    case 'benefits':
      return `${contact}, ${name}'s benefits status changed (${changeLine(handoff)}). Please update their payroll deductions.`;
    default:
      return `${contact}, there is a payroll change for ${name}: ${manualSummary(handoff, name)}. Please update payroll.`;
  }
}

const SUBJECT_LABELS: Record<PayrollEventKey, string> = {
  new_hire: 'New hire',
  termination: 'Termination',
  rehire: 'Rehire',
  unpaid_leave: 'Unpaid leave',
  paid_leave: 'Paid time off',
  status_change: 'Status change',
  pay_type: 'Pay type change',
  title: 'Title change',
  department: 'Department change',
  benefits: 'Benefits change',
  manual: 'Payroll change',
};

export type ComposedPayrollEmail = {
  event: PayrollEventKey;
  subject: string;
  text: string;
};

export function composePayrollEmail(input: {
  handoff: PayrollHandoffRow;
  employee: PayrollEmployeeRow | null;
  /** First name used to open the email ("Cole"). */
  contactFirstName: string;
  /** Display name of the person who made the change, when known. */
  changedByName?: string | null;
  appUrl?: string;
}): ComposedPayrollEmail {
  const { handoff, employee } = input;
  const event = payrollEventKey(handoff);
  const name = employeeFullName(employee, handoff);
  const contact = text(input.contactFirstName) || 'Hi';
  const effective = dateOnly(handoff.effective_date);

  const details: Array<[string, string]> = [];
  const add = (label: string, value: unknown) => {
    const v = text(value);
    if (v) details.push([label, v]);
  };

  add('Employee', `${name}${text(handoff.employee_id) ? ` (ID ${text(handoff.employee_id)})` : ''}`);
  add('Title', employee?.position);
  add('Department', employee?.department);

  if (event === 'new_hire') {
    add('Start date', formatPayrollDate(dateOnly(employee?.hire_date) || effective));
    add('Pay type', employee?.pay_type);
    const hours = text(employee?.standard_hours);
    if (hours) add('Scheduled hours', `${hours} per week`);
    add('Supervisor', employee?.supervisor);
  } else if (event === 'termination') {
    add('Termination date', formatPayrollDate(effective || dateOnly(employee?.termination_date)));
    add('Hire date', formatPayrollDate(employee?.hire_date));
    add('Pay type', employee?.pay_type);
  } else if (event === 'rehire') {
    add('Effective date', formatPayrollDate(effective));
    add('Hire date', formatPayrollDate(employee?.hire_date));
    add('Pay type', employee?.pay_type);
  } else if (event === 'unpaid_leave' || event === 'paid_leave') {
    const payload = handoff.payload || {};
    add('Leave type', LEAVE_LABELS[text(payload.leave_type).toLowerCase()] || payload.leave_type);
    add('Dates', leaveDates(payload));
    add('Pay type', employee?.pay_type);
  } else {
    add('Change', changeLine(handoff) || manualSummary(handoff, name));
    add('Effective date', formatPayrollDate(effective));
    if (event !== 'pay_type') add('Pay type', employee?.pay_type);
  }

  const by = text(handoff.created_by);
  const byName = text(input.changedByName);
  add('Changed by', byName && by ? `${byName} (${by})` : byName || by);

  const width = Math.max(...details.map(([label]) => label.length)) + 2;
  const detailText = details.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`);

  const startDate = dateOnly(employee?.hire_date) || effective;
  const endDate = effective || dateOnly(employee?.termination_date);
  const subjectDate =
    event === 'new_hire' && startDate
      ? ` (starts ${startDate})`
      : event === 'termination' && endDate
        ? ` (effective ${endDate})`
        : '';

  const lines = [
    openingLine(event, contact, name, handoff),
    '',
    ...detailText,
    '',
    'This is an automatic message from Orbis. Reply to this email with any questions.',
  ];
  if (input.appUrl) lines.push(input.appUrl);

  return {
    event,
    subject: `Payroll: ${SUBJECT_LABELS[event]} — ${name}${subjectDate}`,
    text: lines.join('\n'),
  };
}
