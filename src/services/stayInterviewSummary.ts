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

  const whatMatters: string[] = [];
  if (q3 && !LOW_RISK_PHRASES.test(q3)) {
    whatMatters.push(
      'Frustrations or stress points were raised — treat as an early engagement signal, not a one-off complaint.'
    );
  }
  if (q6 && !LOW_RISK_PHRASES.test(q6)) {
    whatMatters.push(
      'The employee named factors that could influence retention; a timely manager conversation is warranted.'
    );
  }
  if (q5 && /\b(no|not really|unsupported|lack|never)\b/i.test(q5)) {
    whatMatters.push(
      'Support from supervisor or team may be insufficient — investigate whether feedback and visibility gaps are driving dissatisfaction.'
    );
  }
  if (!whatMatters.length && (q1 || q2)) {
    whatMatters.push(
      'Overall tone appears constructive — reinforce what is working while confirming no hidden obstacles were missed.'
    );
  }
  if (!whatMatters.length) {
    whatMatters.push(
      'Limited detail in responses — schedule a follow-up to draw out engagement and retention themes beyond surface answers.'
    );
  }

  lines.push('WHAT MATTERS', whatMatters.map((t) => `• ${t}`).join('\n'));

  const engagement: string[] = [];
  if (q1) engagement.push(`Motivation: ${q1}`);
  if (q2) engagement.push(`Role strengths: ${q2}`);
  if (q5) engagement.push(`Support climate: ${q5}`);
  lines.push(
    'ENGAGEMENT SIGNALS',
    engagement.length
      ? engagement.map((t) => `• ${t}`).join('\n')
      : '• No engagement themes captured — probe what the employee values about the role.'
  );

  const risks: string[] = [];
  if (q3 && !LOW_RISK_PHRASES.test(q3)) risks.push(`Obstacles: ${q3}`);
  if (q6 && !LOW_RISK_PHRASES.test(q6)) risks.push(`Retention factors: ${q6}`);
  lines.push(
    'RISKS & EARLY WARNINGS',
    risks.length
      ? risks.map((t) => `• ${t}`).join('\n')
      : '• No immediate retention red flags stated — monitor for changes after any role or schedule shifts.'
  );

  const opportunities: string[] = [];
  if (q2) opportunities.push(`Build on: ${q2}`);
  if (q4) opportunities.push(`Quick win requested: ${q4}`);
  if (q7) opportunities.push(`Employee suggestion: ${q7}`);
  lines.push(
    'OPPORTUNITIES',
    opportunities.length
      ? opportunities.map((t) => `• ${t}`).join('\n')
      : '• Confirm recognition and development opportunities with the employee’s supervisor.'
  );

  const focus: string[] = [];
  if (q7) focus.push(q7);
  if (q3 && !LOW_RISK_PHRASES.test(q3)) {
    focus.push('Manager to follow up on stated frustrations within 14 days and document mitigations.');
  }
  if (q6 && !LOW_RISK_PHRASES.test(q6)) {
    focus.push('HR/manager check-in on retention factors within 30 days.');
  }
  if (!focus.length) {
    focus.push('Share positive themes with the team where appropriate; schedule next stay interview on cadence.');
  }
  lines.push('RECOMMENDED FOCUS', focus.map((f) => `• ${f}`).join('\n'));

  lines.push(
    '',
    '(Template advisory draft — review and edit before saving. Deploy summarize-stay-interview for richer AI synthesis.)'
  );

  return lines.join('\n\n').trim();
}

