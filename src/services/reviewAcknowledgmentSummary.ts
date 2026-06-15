type ReviewLike = Record<string, unknown>;

function reviewScoreLabel(score: unknown): string {
  const numeric = Number(score);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';

  if (numeric >= 5) return 'Exceeds Expectations';
  if (numeric >= 3) return 'Meets Expectations';
  if (numeric >= 2) return 'Needs Improvement';
  return 'Below Expectations';
}

/** Text snapshot of a performance review for signing / PDF acknowledgment. */
export function buildReviewAcknowledgmentSummary(record: ReviewLike): string {
  const lines: string[] = [];

  const scoreFields: Array<[string, unknown]> = [
    ['Quality', record.quality_score],
    ['Attendance', record.attendance_score],
    ['Reliability', record.reliability_score],
    ['Communication', record.communication_score],
    ['Judgment', record.judgement_score],
    ['Initiative', record.initiative_score],
    ['Teamwork', record.teamwork_score],
    ['Knowledge', record.knowledge_score],
    ['Training', record.training_score],
  ];

  const ratings = scoreFields
    .map(([label, score]) => {
      const text = reviewScoreLabel(score);
      return text ? `${label}: ${text}` : null;
    })
    .filter(Boolean) as string[];

  if (ratings.length) {
    lines.push('Performance ratings');
    ratings.forEach((rating) => lines.push(`• ${rating}`));
    lines.push('');
  }

  const sections: Array<[string, unknown]> = [
    ['Strengths', record.strengths],
    ['Areas for improvement', record.improvements],
    ['Employee comments / feedback', record.employee_comments],
    ['Manager action plan / next steps', record.manager_comments],
  ];

  sections.forEach(([label, value]) => {
    const text = String(value || '').trim();
    if (!text) return;
    lines.push(String(label));
    lines.push(text);
    lines.push('');
  });

  const snapshot = lines.join('\n').trim();
  if (snapshot) return snapshot.slice(0, 4000);

  const legacy = String(record.summary || record.notes || '').trim();
  return legacy.slice(0, 4000) || 'No review details were recorded for this period.';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Structured HTML for signing pages from acknowledgment summary text. */
export function formatAcknowledgmentSummaryHtml(summary: string, classPrefix = 'sign-summary'): string {
  return summary
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return `<div class="${classPrefix}-spacer"></div>`;
      if (trimmed.startsWith('• ')) {
        return `<div class="${classPrefix}-item">${escapeHtml(trimmed)}</div>`;
      }
      if (!trimmed.includes(':') && trimmed.length <= 48) {
        return `<div class="${classPrefix}-heading">${escapeHtml(trimmed)}</div>`;
      }
      return `<div class="${classPrefix}-line">${escapeHtml(line)}</div>`;
    })
    .join('');
}
