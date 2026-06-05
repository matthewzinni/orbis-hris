export type StayThemesEmailMeta = {
  monthsBack: number;
  interviewCount: number;
  dateFrom: string;
  dateTo: string;
  source?: 'ai' | 'template';
};

/** Leadership recipients for stay interview themes reports. */
export const STAY_THEMES_LEADERSHIP_RECIPIENTS = [
  'trent.wynne@btwglobal.com',
  'brent.wynne@btwglobal.com',
] as const;

/** Shown in compose (Cc) — mailto cannot set From reliably across clients. */
export const STAY_THEMES_SENDER_EMAIL = 'matthew.zinni@btwglobal.com';

const MAILTO_BODY_MAX = 6000;

export function resolveStayThemesLeadershipEmails(): {
  recipients: string[];
  senderEmail: string;
} {
  return {
    recipients: [...STAY_THEMES_LEADERSHIP_RECIPIENTS],
    senderEmail: STAY_THEMES_SENDER_EMAIL,
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
    `— Matthew Zinni (${STAY_THEMES_SENDER_EMAIL})`,
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
): { mailtoUrl: string; recipients: string[]; senderEmail: string } {
  const { recipients, senderEmail } = resolveStayThemesLeadershipEmails();
  const subject = `Stay Interview Themes (${meta.dateFrom} – ${meta.dateTo}) | BTW Global`;
  const body = buildEmailBody(report, meta);
  const to = recipients.join(',');
  const params = new URLSearchParams({
    cc: senderEmail,
    subject,
    body,
  });
  const mailtoUrl = `mailto:${to}?${params.toString()}`;

  return { mailtoUrl, recipients, senderEmail };
}

export function openStayThemesLeadershipEmail(
  report: string,
  meta: StayThemesEmailMeta
): { recipients: string[]; senderEmail: string } {
  const { mailtoUrl, recipients, senderEmail } = buildStayThemesLeadershipMailto(report, meta);

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

  return { recipients, senderEmail };
}
