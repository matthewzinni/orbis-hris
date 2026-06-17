export const AUTO_BENEFITS_ELIGIBLE_STATUS = 'Eligible';

function normalizeBenefitsStatus(status: unknown): string {
  return String(status || '').trim().toLowerCase();
}

/** Empty or interim labels HR uses before the 90-day mark — safe to overwrite. */
export function isBenefitsStatusAwaitingAutoEligible(status: unknown): boolean {
  const normalized = normalizeBenefitsStatus(status);
  if (!normalized) return true;

  if (normalized === normalizeBenefitsStatus(AUTO_BENEFITS_ELIGIBLE_STATUS)) {
    return false;
  }

  const protectedTokens = ['enroll', 'waiv', 'declin', 'cobra', 'opt out', 'opt-out'];
  if (protectedTokens.some((token) => normalized.includes(token))) {
    return false;
  }

  return true;
}

export function isBenefitsAlreadyAutoEligible(status: unknown): boolean {
  return (
    normalizeBenefitsStatus(status) === normalizeBenefitsStatus(AUTO_BENEFITS_ELIGIBLE_STATUS)
  );
}
