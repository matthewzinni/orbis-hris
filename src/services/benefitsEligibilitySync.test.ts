import { describe, expect, it } from 'vitest';
import { isBenefitsStatusAwaitingAutoEligible } from './benefitsEligibilityRules';

describe('benefitsEligibilitySync', () => {
  it('treats empty interim statuses as auto-eligible candidates', () => {
    expect(isBenefitsStatusAwaitingAutoEligible('')).toBe(true);
    expect(isBenefitsStatusAwaitingAutoEligible('Pending')).toBe(true);
  });

  it('does not overwrite enrolled or waived statuses', () => {
    expect(isBenefitsStatusAwaitingAutoEligible('Enrolled')).toBe(false);
    expect(isBenefitsStatusAwaitingAutoEligible('Waived')).toBe(false);
    expect(isBenefitsStatusAwaitingAutoEligible('Eligible')).toBe(false);
  });
});
