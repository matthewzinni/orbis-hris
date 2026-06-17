import { describe, expect, it } from 'vitest';
import { getReviewAverageScore, getReviewScoreValues } from './reviewScores';

describe('reviewScores', () => {
  it('uses the nine active review score fields', () => {
    const values = getReviewScoreValues({
      quality_score: 4,
      communication_score: 5,
      performance_score: 1,
      attitude_score: 1,
    });

    expect(values).toEqual([4, 5]);
  });

  it('ignores empty and zero scores', () => {
    expect(getReviewAverageScore({ quality_score: 0, teamwork_score: 4 })).toBe(4);
    expect(getReviewAverageScore({})).toBeNull();
  });

  it('averages valid scores', () => {
    expect(
      getReviewAverageScore({
        quality_score: 4,
        attendance_score: 2,
        reliability_score: 4,
      })
    ).toBe(10 / 3);
  });
});
