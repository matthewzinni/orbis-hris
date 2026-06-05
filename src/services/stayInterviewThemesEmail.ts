import { employeeDisplayName } from './employeeUtils';

type EmployeeRow = Record<string, unknown>;

export type StayThemesEmailMeta = {
  monthsBack: number;
  interviewCount: number;
  dateFrom: string;
  dateTo: string;
  source?: 'ai' | 'template';
};

const LEADERSHIP_TARGETS = [
  { employeeId: 'BTW1601', displayName: 'Trent Wynne', fallbackEmail: 'trent.wynne@btwglobal.com' },
  { employeeId: 'BTW1602', displayName: 'Brent Wynne', fallbackEmail: 'brent.wynne@btwglobal.com' },
] as const;

const MAILTO_BODY_MAX = 6000;

function getRoster(): EmployeeRow[] {
  const scoped = (window as { EMPLOYEES?: EmployeeRow[] }).EMPLOYEES;
  if (Array.isArray(scoped) && scoped.length) return scoped;
  return Array.isArray(window.currentEmployeeRoster) ? window.currentEmployeeRoster : [];
}

function readEmployeeEmail(employee: EmployeeRow): string {
  return String(
    employee.work_email || employee.workEmail || employee.personal_email || employee.email || ''
  )
    .trim()
    .toLowerCase();
}

function nameMatchesTarget(employee: EmployeeRow, targetName: string): boolean {
  const display = employeeDisplayName(employee).trim().toLowerCase();
  return display === targetName.toLowerCase();
}

/** Resolve Trent & Brent work emails from roster, with BTW defaults if missing. */
export function resolveStayThemesLeadershipEmails(): {
  emails: string[];
  labels: string[];
  usedFallback: string[];
} {
  const roster = getRoster();
  const emails: string[] = [];
  const labels: string[] = [];
  const usedFallback: string[] = [];

  LEADERSHIP_TARGETS.forEach((target) => {
    const match =
      roster.find((row) => String(row.id || row.employee_id || '').trim() === target.employeeId) ||
      roster.find((row) => nameMatchesTarget(row, target.displayName));

    const fromRoster = match ? readEmployeeEmail(match) : '';
    const email =
      fromRoster && fromRoster.includes('@') ? fromRoster : target.fallbackEmail.toLowerCase();

    if (!fromRoster || !fromRoster.includes('@')) {
      usedFallback.push(target.displayName);
    }

    emails.push(email);
    labels.push(target.displayName);
  });

  return {
    emails: [...new Set(emails)],
    labels,
    usedFallback,
  };
}

function buildEmailBody(report: string, meta: StayThemesEmailMeta): string {
  const today = new Date().toISOString().slice(0, 10);
  const sourceLabel = meta.source === 'ai' ? 'AI synthesis' : 'template rollup';
  const header = [
    'Hi Trent and Brent,',
    '',
    `Attached below is the stay interview themes report from Orbis (${sourceLabel}).`,
    `Period: ${meta.dateFrom} through ${meta.dateTo} (${meta.monthsBack} month lookback, ${meta.interviewCount} interview(s) with responses).`,
    'Employee names are included with each theme so you can follow up directly where needed.',
    '',
    '---',
    '',
  ];

  const footer = [
    '',
    '---',
    `Generated in Orbis Reports on ${today}.`,
  ];

  const full = [...header, report.trim(), ...footer].join('\n');
  if (full.length <= MAILTO_BODY_MAX) {
    return full;
  }

  const truncatedReport = `${report.trim().slice(0, MAILTO_BODY_MAX - header.join('\n').length - footer.join('\n').length - 80)}\n\n[Report truncated for email — open Orbis Reports for the full text or use Copy report.]`;

  return [...header, truncatedReport, ...footer].join('\n');
}

export function buildStayThemesLeadershipMailto(
  report: string,
  meta: StayThemesEmailMeta
): { mailtoUrl: string; recipients: string[]; usedFallback: string[] } {
  const { emails, usedFallback } = resolveStayThemesLeadershipEmails();
  const subject = `Stay Interview Themes (${meta.dateFrom} – ${meta.dateTo}) | BTW Global`;
  const body = buildEmailBody(report, meta);
  const to = emails.join(',');
  const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { mailtoUrl, recipients: emails, usedFallback };
}

export function openStayThemesLeadershipEmail(
  report: string,
  meta: StayThemesEmailMeta
): { recipients: string[]; usedFallback: string[] } {
  const { mailtoUrl, recipients, usedFallback } = buildStayThemesLeadershipMailto(report, meta);

  if (!recipients.length) {
    throw new Error('No leadership email addresses configured.');
  }

  try {
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    window.location.assign(mailtoUrl);
  }

  return { recipients, usedFallback };
}
