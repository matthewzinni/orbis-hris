import type { JanusAccount, JanusContact } from '../types/janusTypes';
import { janusContactDisplayName } from '../types/janusTypes';

export type JanusMeetingEmailDraft = {
  account: JanusAccount;
  contact?: JanusContact | null;
  meetingDate?: string;
  meetingTime?: string;
  title?: string;
  attendees?: string;
  notes?: string;
};

export function buildJanusMeetingRequestMailto(draft: JanusMeetingEmailDraft): string {
  const contact = draft.contact;
  const email = String(contact?.email || '').trim();
  const contactName = contact ? janusContactDisplayName(contact) : '';
  const accountName = String(draft.account.name || '').trim();
  const title = String(draft.title || '').trim() || `Meeting with ${accountName}`;
  const meetingDate = String(draft.meetingDate || '').trim();
  const meetingTime = String(draft.meetingTime || '').trim();
  const whenParts = [meetingDate, meetingTime].filter(Boolean);
  const whenText = whenParts.length ? whenParts.join(' at ') : '[date and time]';
  const attendees = String(draft.attendees || '').trim();
  const notes = String(draft.notes || '').trim();

  const subject = `Meeting request — ${title} | BTW Global`;
  const greetingName = contactName.split(' ')[0] || 'there';

  const lines = [
    `Hi ${greetingName},`,
    '',
    `I'd like to schedule time with ${accountName} to discuss ${title.toLowerCase()}.`,
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

  lines.push('', 'Thank you,', '[Your name]');

  const mailto = email ? `mailto:${email}` : 'mailto:';
  return `${mailto}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export function openJanusMeetingRequestEmail(draft: JanusMeetingEmailDraft): void {
  const mailtoUrl = buildJanusMeetingRequestMailto(draft);
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
}
