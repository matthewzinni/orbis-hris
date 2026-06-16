import { buildMailtoUrl } from '../utils/mailto';
import { type JanusContact, janusContactDisplayName } from '../types/janusTypes';
import {
  openJanusMailto,
  resolveJanusSenderName,
  truncateForJanusMailto,
} from './janusEmailCommon';

export type JanusContactEmailDraft = {
  accountName: string;
  contact: Pick<
    JanusContact,
    'first_name' | 'last_name' | 'email' | 'title' | 'notes'
  >;
};

export function buildJanusContactOutreachMailto(draft: JanusContactEmailDraft): string {
  const email = String(draft.contact.email || '').trim();
  const contactName = janusContactDisplayName(draft.contact);
  const accountName = String(draft.accountName || '').trim() || 'your organization';
  const title = String(draft.contact.title || '').trim();
  const notes = truncateForJanusMailto(String(draft.contact.notes || '').trim());
  const senderName = resolveJanusSenderName();
  const greetingName = contactName.split(' ')[0] || 'there';

  const subject = `Following up — ${accountName} | BTW Global`;
  const lines = [
    `Hi ${greetingName},`,
    '',
    `I hope you're doing well. I'm reaching out from BTW Global regarding ${accountName}.`,
  ];

  if (title) {
    lines.push('', `I understand you're ${title} — thank you for your time.`);
  }

  if (notes) {
    lines.push('', notes);
  }

  lines.push(
    '',
    "I'd welcome a chance to connect when you have time. Please reply with any questions or a time that works for you.",
    '',
    'Thank you,',
    senderName
  );

  return buildMailtoUrl(email, {
    subject,
    body: lines.join('\n'),
  });
}

export function openJanusContactOutreachEmail(draft: JanusContactEmailDraft): void {
  openJanusMailto(buildJanusContactOutreachMailto(draft));
}
