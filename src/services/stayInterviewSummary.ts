export type StayInterviewSummaryContext = {
  employeeName?: string;
  interviewType?: string;
  interviewDate?: string;
  responses: { question: string; answer: string }[];
};

/** Field ids for stay interview questionnaire (matches index.html). */
export const STAY_INTERVIEW_FIELD_IDS = [
  'stayQ1',
  'stayQ2',
  'stayQ3',
  'stayQ4',
  'stayQ5',
  'stayQ6',
  'stayQ7',
] as const;

export const STAY_INTERVIEW_QUESTION_LABELS = [
  'What do you look forward to when you come to work each day?',
  'What is going well in your role right now?',
  'What frustrations, obstacles, or stress points are you experiencing?',
  'What would make your job more satisfying or easier?',
  'Do you feel supported by your supervisor and team? Why or why not?',
  'What might cause you to consider leaving BTW Global?',
  'What can we do to help you stay and succeed here?',
] as const;

const EMPTY_ANSWERS =
  /^(n\/?a|na|none|nothing|no comment|not applicable|—|-|\.)$/i;

const LOW_RISK_PHRASES =
  /\b(none|nothing|no concerns?|not at this time|not right now|n\/?a|all good|no issues?)\b/i;

function cleanAnswer(value: string): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (EMPTY_ANSWERS.test(text)) return '';
  return text;
}

function readResponses(
  readField: (id: (typeof STAY_INTERVIEW_FIELD_IDS)[number]) => string
): string[] {
  return STAY_INTERVIEW_FIELD_IDS.map((id) => cleanAnswer(readField(id)));
}

/** Package Q&A for the AI edge function. Returns null if no answers. */
export function collectStayInterviewSummaryContext(
  readField: (id: (typeof STAY_INTERVIEW_FIELD_IDS)[number]) => string,
  meta: {
    employeeName?: string;
    interviewType?: string;
    interviewDate?: string;
  } = {}
): StayInterviewSummaryContext | null {
  const responses: { question: string; answer: string }[] = [];

  STAY_INTERVIEW_FIELD_IDS.forEach((id, index) => {
    const answer = cleanAnswer(readField(id));
    if (!answer) return;
    responses.push({
      question: STAY_INTERVIEW_QUESTION_LABELS[index] || `Question ${index + 1}`,
      answer,
    });
  });

  if (!responses.length) {
    return null;
  }

  return {
    employeeName: meta.employeeName?.trim() || undefined,
    interviewType: meta.interviewType?.trim() || undefined,
    interviewDate: meta.interviewDate?.trim() || undefined,
    responses,
  };
}

/**
 * Build an HR/manager summary from stay interview Q1–Q7 responses.
 * Structured for editing before save — not a substitute for manager judgment.
 */
export function buildStayInterviewManagerSummary(
  readField: (id: (typeof STAY_INTERVIEW_FIELD_IDS)[number]) => string
): string {
  const answers = readResponses(readField);
  const hasAny = answers.some(Boolean);

  if (!hasAny) {
    return '';
  }

  const [q1, q2, q3, q4, q5, q6, q7] = answers;
  const lines: string[] = [];

  const positives: string[] = [];
  if (q1) positives.push(`Motivation: ${q1}`);
  if (q2) positives.push(`Strengths: ${q2}`);
  if (positives.length) {
    lines.push('Strengths & engagement', positives.map((p) => `• ${p}`).join('\n'));
  }

  if (q3) {
    lines.push('Concerns / stress points', `• ${q3}`);
  } else {
    lines.push('Concerns / stress points', '• None noted in interview.');
  }

  const supportParts: string[] = [];
  if (q5) supportParts.push(`Support: ${q5}`);
  if (q4) supportParts.push(`Requested improvements: ${q4}`);
  if (supportParts.length) {
    lines.push('Support & role satisfaction', supportParts.map((p) => `• ${p}`).join('\n'));
  }

  if (q6) {
    const riskLevel = LOW_RISK_PHRASES.test(q6) ? 'Low apparent risk' : 'Discuss retention factors';
    lines.push('Retention', `• ${riskLevel} — ${q6}`);
  }

  const followUps: string[] = [];
  if (q7) followUps.push(q7);
  if (q3 && !LOW_RISK_PHRASES.test(q3)) {
    followUps.push('Follow up on frustrations and whether mitigations are in place.');
  }
  if (q6 && !LOW_RISK_PHRASES.test(q6)) {
    followUps.push('Schedule a check-in on retention factors within 30 days.');
  }
  if (followUps.length) {
    lines.push(
      'Recommended HR / manager follow-up',
      followUps.map((f) => `• ${f}`).join('\n')
    );
  } else if (q7) {
    lines.push('Recommended HR / manager follow-up', `• ${q7}`);
  }

  lines.push(
    '',
    '(Draft generated from employee responses — review and edit before saving.)'
  );

  return lines.join('\n\n').trim();
}

