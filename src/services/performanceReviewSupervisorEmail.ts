import { resolveSignedInUserLabel } from './access';
import {
  type PerformanceReviewDueCandidate,
  type SupervisorPerformanceReviewDueGroup,
} from './performanceReviewDue';
import { buildMailtoUrl } from '../utils/mailto';
import { truncateForJanusMailto } from './janusEmailCommon';

const MAILTO_BODY_MAX = 5000;

function formatReviewLine(candidate: PerformanceReviewDueCandidate): string {
  const timing =
    candidate.severity === 'overdue'
      ? `${Math.abs(candidate.daysUntilDue)} day${Math.abs(candidate.daysUntilDue) === 1 ? '' : 's'} overdue`
      : `due in ${candidate.daysUntilDue} day${candidate.daysUntilDue === 1 ? '' : 's'}`;
  return `• ${candidate.employeeName} — ${candidate.reviewTypeLabel} — ${candidate.department} — due ${candidate.dueDate} (${timing})`;
}

export function buildSupervisorPerformanceReviewMailto(
  group: SupervisorPerformanceReviewDueGroup
): string {
  const recipient = String(group.supervisorEmail || '').trim();
  if (!recipient) {
    throw new Error(`No email on file for ${group.supervisorName}.`);
  }

  const senderName = resolveSignedInUserLabel();
  const greetingName = group.supervisorName.split(' ')[0] || 'there';
  const overdueCount = group.items.filter((item) => item.severity === 'overdue').length;
  const dueSoonCount = group.items.length - overdueCount;

  const summaryParts: string[] = [];
  if (overdueCount) summaryParts.push(`${overdueCount} overdue`);
  if (dueSoonCount) summaryParts.push(`${dueSoonCount} due within 7 days`);

  const subject = `Performance reviews due — your team (${group.items.length}) | BTW Global`;
  const lines = [
    `Hi ${greetingName},`,
    '',
    `The following performance reviews are due on your team (${summaryParts.join(', ') || `${group.items.length} total`}):`,
    '',
    ...group.items.map(formatReviewLine),
    '',
    'Please complete these in Orbis under Tasks or the employee drawer → Reviews tab.',
    '',
    'Thank you,',
    senderName,
  ];

  const body = truncateForJanusMailto(lines.join('\n'), MAILTO_BODY_MAX);

  return buildMailtoUrl(recipient, { subject, body });
}

export function openSupervisorPerformanceReviewEmail(
  group: SupervisorPerformanceReviewDueGroup
): void {
  const mailtoUrl = buildSupervisorPerformanceReviewMailto(group);

  try {
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    window.location.assign(mailtoUrl);
  }
}
