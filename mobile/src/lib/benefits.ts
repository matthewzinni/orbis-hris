export const BENEFITS_ELIGIBILITY_WAIT_DAYS = 90;

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(`${String(value).trim()}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatBenefitsEligibilitySummary(hireDate: string | null | undefined): string {
  const hire = parseDate(hireDate);
  if (!hire) {
    return hireDate
      ? 'Hire date is invalid — cannot calculate benefits eligibility.'
      : 'No hire date on file.';
  }

  const eligible = new Date(hire);
  eligible.setDate(eligible.getDate() + BENEFITS_ELIGIBILITY_WAIT_DAYS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Math.ceil((eligible.getTime() - today.getTime()) / 86_400_000);
  const dateLabel = eligible.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (days <= 0) {
    return `Eligible for benefits since ${dateLabel} (${BENEFITS_ELIGIBILITY_WAIT_DAYS} days after hire).`;
  }

  return `Eligible for benefits on ${dateLabel} (in ${days} day${days === 1 ? '' : 's'}).`;
}
