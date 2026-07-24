import { describe, expect, it } from 'vitest';
import {
  attentionCategoryLabel,
  attentionSeverityLabel,
  attentionStatusLabel,
} from './attentionWorkspaceLabels';

describe('attentionWorkspaceLabels', () => {
  it('labels known categories', () => {
    expect(attentionCategoryLabel('performance_review')).toBe('Performance review');
    expect(attentionCategoryLabel('all')).toBe('All categories');
  });

  it('labels severity and status values', () => {
    expect(attentionSeverityLabel('high')).toBe('High');
    expect(attentionStatusLabel('in_progress')).toBe('In progress');
  });
});
