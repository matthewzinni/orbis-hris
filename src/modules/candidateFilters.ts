export interface CandidateStageRecord {
  stage?: string;
}

export function filterCandidatesByStage<T extends CandidateStageRecord>(
  rows: T[],
  selectedStage: string
): T[] {
  const stage = String(selectedStage || '').trim().toLowerCase();

  if (stage) {
    return rows.filter((row) => String(row.stage || '').trim().toLowerCase() === stage);
  }

  return rows.filter((row) => String(row.stage || '').trim().toLowerCase() !== 'rejected');
}
