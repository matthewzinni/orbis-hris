import { buildMailtoUrl } from '../utils/mailto';
import {
  type JanusAccount,
  type JanusContact,
  formatJanusDateLabel,
  janusContactDisplayName,
} from '../types/janusTypes';
import {
  openJanusMailto,
  resolveJanusSenderName,
  truncateForJanusMailto,
} from './janusEmailCommon';

export type JanusMeetingEmailDraft = {
  account: Pick<JanusAccount, 'name'>;
  contact?: JanusContact | null;
  meetingDate?: string;
  meetingTime?: string;
  title?: string;
  attendees?: string;
  notes?: string;
};

function formatMeetingWhen(meetingDate: string, meetingTime: string): string {
  const dateLabel = meetingDate ? formatJanusDateLabel(meetingDate) : '';
  const timeLabel = String(meetingTime || '').trim();
  if (dateLabel && timeLabel) return `${dateLabel} at ${timeLabel}`;
  if (dateLabel) return dateLabel;
  if (timeLabel) return timeLabel;
  return '[date and time]';
}

export function buildJanusMeetingRequestMailto(draft: JanusMeetingEmailDraft): string {
  const contact = draft.contact;
  const email = String(contact?.email || '').trim();
  const contactName = contact ? janusContactDisplayName(contact) : '';
  const accountName = String(draft.account.name || '').trim() || 'your team';
  const title = String(draft.title || '').trim() || `Meeting with ${accountName}`;
  const whenText = formatMeetingWhen(
    String(draft.meetingDate || '').trim(),
    String(draft.meetingTime || '').trim()
  );
  const attendees = String(draft.attendees || '').trim();
  const notes = truncateForJanusMailto(String(draft.notes || '').trim());
  const senderName = resolveJanusSenderName();

  const subject = `Meeting request — ${title} | BTW Global`;
  const greetingName = contactName.split(' ')[0] || 'there';

  const lines = [
    `Hi ${greetingName},`,
    '',
    `I'd like to schedule time with ${accountName} to discuss ${title}.`,
    `Proposed schedule: ${whenText}.`,
  ];

  if (attendees) {
    lines.push('', `Attendees: ${attendees}.`);
  }

  lines.push(
    '',
    'Please reply to confirm your availability, or suggest a better time that works for you.'
  );

  if (notes) {
    lines.push('', 'Agenda / notes:', notes);
  }

  lines.push('', 'Thank you,', senderName);

  return buildMailtoUrl(email || '', {
    subject,
    body: lines.join('\n'),
  });
}

export function openJanusMeetingRequestEmail(draft: JanusMeetingEmailDraft): void {
  openJanusMailto(buildJanusMeetingRequestMailto(draft));
}
