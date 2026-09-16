import { describe, expect, it } from 'vitest';
import { filterCandidatesByStage } from './candidateFilters';

describe('filterCandidatesByStage', () => {
  const candidates = [
    { id: '1', stage: 'New' },
    { id: '2', stage: 'Interview' },
    { id: '3', stage: 'Rejected' },
    { id: '4', stage: 'rejected' },
  ];

  it('excludes rejected candidates from the default All Candidates view', () => {
    expect(filterCandidatesByStage(candidates, '').map((candidate) => candidate.id)).toEqual([
      '1',
      '2',
    ]);
  });

  it('shows only rejected candidates when Rejected is selected', () => {
    expect(filterCandidatesByStage(candidates, 'Rejected').map((candidate) => candidate.id)).toEqual([
      '3',
      '4',
    ]);
  });
});
