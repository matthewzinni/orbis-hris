import { formatInvestigationLabel } from '../types/investigationsTypes';

export type InvestigationGuidanceInterview = {
  type: string;
  date?: string;
  notes: string;
  interviewer?: string;
};

export type InvestigationGuidanceContext = {
  caseNumber?: string;
  title?: string;
  category?: string;
  status?: string;
  severity?: string;
  allegationSummary?: string;
  witnesses?: string;
  findingsSummary?: string;
  outcome?: string;
  recommendedAction?: string;
  targetedEmployees?: string[];
  focusEmployees?: string[];
  reportedBy?: string;
  interviews?: InvestigationGuidanceInterview[];
  evidenceCount?: number;
};

const DISCIPLINE_CATEGORIES = new Set([
  'harassment',
  'discrimination',
  'disciplinary',
  'policy_violation',
  'safety',
]);

const TERMINATION_OUTCOMES = new Set(['termination_recommended', 'corrective_action']);

function statusLabel(status: string): string {
  return formatInvestigationLabel(status || 'intake');
}

function mayInvolveSeriousAction(context: InvestigationGuidanceContext): boolean {
  const category = String(context.category || '').toLowerCase();
  const outcome = String(context.outcome || '').toLowerCase();
  const severity = String(context.severity || '').toLowerCase();

  return (
    DISCIPLINE_CATEGORIES.has(category) ||
    TERMINATION_OUTCOMES.has(outcome) ||
    severity === 'high' ||
    severity === 'critical' ||
    /terminat|disciplin|suspend|written warning|final warning/i.test(
      String(context.recommendedAction || '')
    )
  );
}

function nextStepsForStatus(status: string): string[] {
  const normalized = String(status || 'intake').toLowerCase();

  const map: Record<string, string[]> = {
    intake: [
      'Confirm jurisdiction (BTW Global / NC operations) and assign investigator.',
      'Document the complaint source and initial allegation; note dates and locations.',
      'Identify targeted and focus employees; issue confidentiality / no-retaliation reminders.',
    ],
    open: [
      'Build an interview plan (complainant, respondent, witnesses, supervisor).',
      'Preserve evidence (documents, CCTV, time records) before items are lost.',
      'Review applicable policies and prior related documentation for consistency.',
    ],
    interviewing: [
      'Complete remaining interviews; use open-ended questions and document verbatim themes.',
      'Log each interview in Orbis with date, type, and neutral notes.',
      'Watch for retaliation concerns after interviews begin.',
    ],
    evidence_review: [
      'Correlate interview notes with physical/documentary evidence.',
      'Assess credibility and whether policies were violated as written.',
      'Draft preliminary findings before recommending discipline.',
    ],
    findings_drafted: [
      'Have HR leadership review findings for consistency with prior cases.',
      'Decide outcome path (unsubstantiated, coaching, corrective action, termination review).',
      'If discipline is considered, prepare written documentation and approval chain.',
    ],
    action_pending: [
      'Finalize recommended action and obtain leadership / legal review if high risk.',
      'Schedule employee discussion; bring witness if policy requires.',
      'Plan follow-up dates and monitoring after action is taken.',
    ],
    closed: [
      'Confirm follow-up date is scheduled and owned.',
      'File final report, evidence index, and closure summary in the case record.',
      'Monitor for retaliation or repeat issues for 30–90 days as appropriate.',
    ],
  };

  return map[normalized] || map.intake;
}

function federalCheckpoints(): string[] {
  return [
    'Confirm legitimate, non-discriminatory business reason documented before adverse action.',
    'Check protected-class / retaliation risk (complaint history, workers comp, FMLA, union activity if applicable).',
    'Ensure investigation was timely, impartial, and documented before discipline.',
    'Match discipline to policy and prior similar cases (consistency).',
    'If termination: review final pay, benefit termination, COBRA notice, and equipment return process.',
    'Consider whether EEOC charge timing applies if employee raised discrimination (typically 180/300 days to file charge).',
  ];
}

function northCarolinaCheckpoints(): string[] {
  return [
    'North Carolina is generally at-will; document clear performance or conduct basis for any termination.',
    'NC Retaliatory Employment Discrimination Act (REDA): avoid adverse action tied to protected reports (safety, wage, discrimination, etc.).',
    'NC Wage and Hour Act: plan final wages per policy/pay period; avoid improper deductions without written authorization where required.',
    'Workers’ compensation: ensure action is not motivated by a recent comp claim without independent justification.',
    'Unemployment: prepare accurate separation reason and supporting documentation if challenged.',
    'If serious misconduct alleged, document investigation steps before separation when possible.',
  ];
}

/** Package case facts for the AI edge function. */
export function collectInvestigationGuidanceContext(
  input: InvestigationGuidanceContext
): InvestigationGuidanceContext | null {
  const allegation = String(input.allegationSummary || '').trim();
  const title = String(input.title || '').trim();

  if (!allegation && !title) {
    return null;
  }

  const interviews = (input.interviews || [])
    .map((row) => ({
      type: String(row.type || '').trim(),
      date: String(row.date || '').trim() || undefined,
      notes: String(row.notes || '').trim(),
      interviewer: String(row.interviewer || '').trim() || undefined,
    }))
    .filter((row) => row.type || row.notes);

  return {
    caseNumber: input.caseNumber?.trim() || undefined,
    title: title || undefined,
    category: input.category?.trim() || undefined,
    status: input.status?.trim() || undefined,
    severity: input.severity?.trim() || undefined,
    allegationSummary: allegation || undefined,
    witnesses: input.witnesses?.trim() || undefined,
    findingsSummary: input.findingsSummary?.trim() || undefined,
    outcome: input.outcome?.trim() || undefined,
    recommendedAction: input.recommendedAction?.trim() || undefined,
    targetedEmployees: input.targetedEmployees?.length ? input.targetedEmployees : undefined,
    focusEmployees: input.focusEmployees?.length ? input.focusEmployees : undefined,
    reportedBy: input.reportedBy?.trim() || undefined,
    interviews: interviews.length ? interviews : undefined,
    evidenceCount:
      typeof input.evidenceCount === 'number' && input.evidenceCount >= 0
        ? input.evidenceCount
        : undefined,
  };
}

/**
 * Structured fallback when AI is unavailable — not legal advice.
 */
export function buildInvestigationGuidanceFallback(
  context: InvestigationGuidanceContext
): string {
  const status = String(context.status || 'intake').toLowerCase();
  const serious = mayInvolveSeriousAction(context);
  const steps = nextStepsForStatus(status);
  const interviews = context.interviews || [];
  const hasInterviewNotes = interviews.some((row) => row.notes.trim());

  const lines: string[] = [
    'FINDINGS & RECOMMENDATION',
  ];

  if (!interviews.length) {
    lines.push(
      '• Preliminary finding: Inconclusive — no interviews logged in Orbis yet.',
      '• Complete complainant, respondent, witness, and supervisor interviews before recommending discipline.',
      '• Recommended outcome: inconclusive pending more evidence'
    );
  } else if (!hasInterviewNotes) {
    lines.push(
      `• ${interviews.length} interview(s) logged but notes are empty — add notes and regenerate.`,
      '• Preliminary finding: Inconclusive until interview content is documented.'
    );
  } else {
    lines.push(
      '• AI unavailable — review INTERVIEW ANALYSIS below and enter your judgment manually.',
      '• Compare accounts for corroboration and contradictions before setting outcome on the Case tab.',
      '• Preliminary finding: [Substantiated | Partially substantiated | Unsubstantiated | Inconclusive]',
      '• Recommended outcome: [coaching | corrective_action | policy_reminder | unsubstantiated | etc.]'
    );
  }

  lines.push('', 'INTERVIEW ANALYSIS');

  if (!interviews.length) {
    lines.push('• No interviews provided — finding must remain inconclusive until interviews are complete.');
  } else {
    interviews.forEach((row) => {
      const when = row.date ? ` (${row.date})` : '';
      const who = row.interviewer ? ` — ${row.interviewer}` : '';
      const excerpt = row.notes.trim()
        ? row.notes.trim().slice(0, 400) + (row.notes.length > 400 ? '…' : '')
        : '(no notes recorded)';
      lines.push(`• ${row.type || 'Interview'}${when}${who}: ${excerpt}`);
    });
    lines.push('• Compare the accounts above — note alignment with the allegation and conflicts between interviews.');
  }

  lines.push(
    '',
    'NEXT BEST MOVE',
    `• Current status: ${statusLabel(status)}.`,
    `• Priority: ${steps[0]}`,
    ...steps.slice(1).map((step) => `• ${step}`)
  );

  if (typeof context.evidenceCount === 'number') {
    lines.push(`• Evidence items on file: ${context.evidenceCount} — verify index matches allegations.`);
  }

  if (serious) {
    lines.push(
      '',
      'COMPLIANCE CHECKPOINTS — FEDERAL',
      ...federalCheckpoints().map((item) => `• ${item}`),
      '',
      'COMPLIANCE CHECKPOINTS — NORTH CAROLINA',
      ...northCarolinaCheckpoints().map((item) => `• ${item}`)
    );
  } else {
    lines.push(
      '',
      'COMPLIANCE CHECKPOINTS — FEDERAL',
      '• Revisit if findings support discipline — document legitimate business reason before adverse action.',
      '',
      'COMPLIANCE CHECKPOINTS — NORTH CAROLINA',
      '• Standard at-will and documentation practices apply if minor coaching only.'
    );
  }

  lines.push(
    '',
    'DOCUMENTATION & RISK FLAGS',
    '• Keep confidential notes separate from employee-facing documents.',
    '• Ensure targeted employees were interviewed and had opportunity to respond to core allegations.',
    serious
      ? '• Escalate to employment counsel before termination or suspension without pay.'
      : '• Re-run guidance after findings or outcome are updated.',
    '',
    'NOT LEGAL ADVICE',
    '• This draft is generated from case fields in Orbis for investigator planning only. Have qualified employment counsel review discipline or termination decisions.',
    '',
    '(Template draft — review and edit before saving.)'
  );

  return lines.join('\n').trim();
}
