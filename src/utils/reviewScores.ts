const REVIEW_SCORE_FIELDS = [
  'quality_score',
  'attendance_score',
  'reliability_score',
  'communication_score',
  'judgement_score',
  'initiative_score',
  'teamwork_score',
  'knowledge_score',
  'training_score',
] as const;

export function getReviewScoreValues(record: Record<string, unknown>): number[] {
  return REVIEW_SCORE_FIELDS.map((field) => record[field])
    .filter((value): value is number | string => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter((score) => Number.isFinite(score) && score > 0);
}

export function getReviewAverageScore(record: Record<string, unknown>): number | null {
  const values = getReviewScoreValues(record);
  if (!values.length) return null;
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}
