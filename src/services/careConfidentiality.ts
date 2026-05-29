import type { CareConfidentiality, CareEngagementDataset } from '../types/careEngagementTypes';
import { employeeMatchesSupervisorAccess, isAdminUser, isSupervisorUser } from './access';
import { findCareEmployeeById } from './careEmployeePicker';

/** Tooltip + inline help for confidentiality dropdowns. */
export const CARE_CONFIDENTIALITY_HELP: Record<CareConfidentiality, string> = {
  standard:
    'Visible to everyone with Care & Engagement access (HR admins and supervisors).',
  restricted: "Visible only to HR admins and this employee's supervisor.",
  hr_only: 'Visible only to HR admins.',
};

export function normalizeCareConfidentiality(
  value: string | null | undefined
): CareConfidentiality {
  const normalized = String(value || 'hr_only').trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'restricted') return normalized;
  return 'hr_only';
}

/** Whether the current user may see a care item or employee note at this confidentiality level. */
export function canViewCareConfidentialRecord(
  confidentiality: CareConfidentiality | string | null | undefined,
  employeeId: string
): boolean {
  if (isAdminUser()) return true;

  const level = normalizeCareConfidentiality(confidentiality);
  if (level === 'hr_only') return false;
  if (!isSupervisorUser()) return false;
  if (level === 'standard') return true;

  const employee = findCareEmployeeById(employeeId);
  if (employee) return employeeMatchesSupervisorAccess(employee);
  return false;
}

/** Strip care items and notes the current user must not see (defense in depth with RLS). */
export function filterCareEngagementDatasetForViewer(
  dataset: CareEngagementDataset
): CareEngagementDataset {
  if (isAdminUser()) return dataset;

  const careItems = dataset.careItems.filter((item) =>
    canViewCareConfidentialRecord(item.confidentiality, item.employeeId)
  );
  const employeeNotes = dataset.employeeNotes.filter((note) =>
    canViewCareConfidentialRecord(note.confidentiality, note.employeeId)
  );

  if (
    careItems.length === dataset.careItems.length &&
    employeeNotes.length === dataset.employeeNotes.length
  ) {
    return dataset;
  }

  return { ...dataset, careItems, employeeNotes };
}

export function applyCareConfidentialitySelectHelp(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;

  Array.from(select.options).forEach((option) => {
    const level = normalizeCareConfidentiality(option.value);
    option.title = CARE_CONFIDENTIALITY_HELP[level];
  });

  const field = select.closest('.field');
  if (!field) return;

  let help = field.querySelector('.care-confidentiality-help') as HTMLElement | null;
  if (!help) {
    help = document.createElement('p');
    help.className = 'care-confidentiality-help muted';
    field.appendChild(help);
  }

  const updateHelp = () => {
    const level = normalizeCareConfidentiality(select.value);
    help!.textContent = CARE_CONFIDENTIALITY_HELP[level];
  };

  if (!select.dataset.confHelpBound) {
    select.dataset.confHelpBound = '1';
    select.addEventListener('change', updateHelp);
  }
  updateHelp();
}
