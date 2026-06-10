import { buildMailtoUrl } from '../utils/mailto';
import {
  STAY_THEMES_LEADERSHIP_RECIPIENTS,
  STAY_THEMES_SENDER_EMAIL,
} from './stayInterviewThemesEmail';

export type CandidateNoteForEmail = {
  note_date?: string | null;
  note_type?: string | null;
  note_text?: string | null;
};

export type CandidateSummaryEmailInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  position?: string;
  department?: string;
  stage?: string;
  source?: string;
  appliedDate?: string;
  profileSummary?: string;
  interviewNotes?: string;
  notes?: CandidateNoteForEmail[];
  senderName?: string;
  senderEmail?: string;
};

const MAILTO_BODY_MAX = 6000;

function line(label: string, value: string | undefined | null): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  return `${label}: ${text}`;
}

function buildEmailBody(input: CandidateSummaryEmailInput): string {
  const today = new Date().toISOString().slice(0, 10);
  const candidateName = `${input.firstName} ${input.lastName}`.trim() || 'Candidate';
  const senderName = String(input.senderName || 'Matthew Zinni').trim();
  const senderEmail = String(input.senderEmail || STAY_THEMES_SENDER_EMAIL).trim();

  const header = [
    'Hi Trent and Brent,',
    '',
    `Sharing a candidate summary and recommendation from Orbis for ${candidateName}.`,
    '',
    '---',
    'CANDIDATE PROFILE',
    '---',
    '',
  ];

  const profileLines = [
    line('Name', candidateName),
    line('Position', input.position),
    line('Department', input.department),
    line('Stage', input.stage),
    line('Source', input.source),
    line('Applied', input.appliedDate),
    line('Email', input.email),
    line('Phone', input.phone),
  ].filter(Boolean) as string[];

  const sections: string[] = [...header, ...profileLines];

  const summary = String(input.profileSummary || '').trim();
  if (summary) {
    sections.push('', '---', 'PROFILE SUMMARY / RECOMMENDATION', '---', '', summary);
  }

  const interviewNotes = String(input.interviewNotes || '').trim();
  if (interviewNotes) {
    sections.push('', '---', 'INTERVIEW NOTES', '---', '', interviewNotes);
  }

  const datedNotes = (input.notes || []).filter((row) => String(row.note_text || '').trim());
  if (datedNotes.length) {
    sections.push('', '---', 'NOTE HISTORY', '---', '');
    datedNotes.forEach((row) => {
      const type = String(row.note_type || 'Note').trim();
      const date = String(row.note_date || '').trim();
      const text = String(row.note_text || '').trim();
      sections.push(`[${type}${date ? ` · ${date}` : ''}]`, text, '');
    });
  }

  sections.push(
    '---',
    '',
    'Open Orbis → Candidates to view the full pipeline record and resume.',
    'https://www.orbis-btw.com/#candidates',
    '',
    `Sent from Orbis on ${today}.`,
    `— ${senderName} (${senderEmail})`
  );

  const full = sections.join('\n');
  if (full.length <= MAILTO_BODY_MAX) {
    return full;
  }

  const truncated = `${full.slice(0, MAILTO_BODY_MAX - 120)}\n\n[Truncated for email — open Orbis for the full candidate record.]`;
  return truncated;
}

export function buildCandidateSummaryLeadershipMailto(input: CandidateSummaryEmailInput): {
  mailtoUrl: string;
  recipients: string[];
  senderEmail: string;
} {
  const recipients = [...STAY_THEMES_LEADERSHIP_RECIPIENTS];
  const senderEmail = String(input.senderEmail || STAY_THEMES_SENDER_EMAIL).trim();
  const candidateName = `${input.firstName} ${input.lastName}`.trim() || 'Candidate';
  const position = String(input.position || '').trim();
  const subject = `Candidate Recommendation — ${candidateName}${position ? ` | ${position}` : ''} | BTW Global`;
  const body = buildEmailBody({ ...input, senderEmail });
  const mailtoUrl = buildMailtoUrl(recipients, {
    cc: senderEmail,
    subject,
    body,
  });

  return {
    mailtoUrl,
    recipients,
    senderEmail,
  };
}

export function openCandidateSummaryLeadershipEmail(input: CandidateSummaryEmailInput): {
  recipients: string[];
  senderEmail: string;
} {
  const summary = String(input.profileSummary || '').trim();
  if (!summary) {
    throw new Error('Add a profile summary before emailing leadership.');
  }

  const { mailtoUrl, recipients, senderEmail } = buildCandidateSummaryLeadershipMailto(input);

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
