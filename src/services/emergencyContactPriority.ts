import { supabaseClient } from './supabaseClient';

export type EmergencyContactPriorityRow = {
  id: string | number;
  priority_order?: number | null;
  created_at?: string | null;
};

export function emergencyContactPriorityLabel(rank: number): string {
  if (rank === 1) return 'Primary';
  if (rank === 2) return 'Secondary';
  if (rank === 3) return 'Tertiary';
  if (rank === 4) return '4th';
  if (rank === 5) return '5th';
  return `Contact ${rank}`;
}

export function sortEmergencyContacts<T extends EmergencyContactPriorityRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftOrder = Number(left.priority_order);
    const rightOrder = Number(right.priority_order);
    const leftRank = Number.isFinite(leftOrder) && leftOrder > 0 ? leftOrder : 9999;
    const rightRank = Number.isFinite(rightOrder) && rightOrder > 0 ? rightOrder : 9999;

    if (leftRank !== rightRank) return leftRank - rightRank;

    return String(left.created_at || '').localeCompare(String(right.created_at || ''));
  });
}

export function emergencyContactRank(
  row: EmergencyContactPriorityRow,
  sortedRows: EmergencyContactPriorityRow[]
): number {
  const index = sortedRows.findIndex((item) => String(item.id) === String(row.id));
  return index >= 0 ? index + 1 : sortedRows.length + 1;
}

export async function getNextEmergencyContactPriority(employeeId: string): Promise<number> {
  const id = String(employeeId || '').trim();
  if (!id) return 1;

  const { data, error } = await supabaseClient
    .from('emergency_contacts')
    .select('priority_order')
    .eq('employee_id', id);

  if (error) {
    throw new Error(error.message || 'Could not determine emergency contact order.');
  }

  const maxRank = (data || []).reduce((highest, row) => {
    const rank = Number((row as { priority_order?: number }).priority_order);
    return Number.isFinite(rank) && rank > highest ? rank : highest;
  }, 0);

  return maxRank + 1;
}

export async function reorderEmergencyContactPriority(
  employeeId: string,
  contactId: string,
  targetRank: number
): Promise<void> {
  const scopedEmployeeId = String(employeeId || '').trim();
  const scopedContactId = String(contactId || '').trim();

  if (!scopedEmployeeId || !scopedContactId) {
    throw new Error('Employee and contact are required.');
  }

  const { data, error } = await supabaseClient
    .from('emergency_contacts')
    .select('id, priority_order, created_at')
    .eq('employee_id', scopedEmployeeId);

  if (error) {
    throw new Error(error.message || 'Could not load emergency contacts.');
  }

  const sorted = sortEmergencyContacts((data || []) as EmergencyContactPriorityRow[]);
  const ids = sorted.map((row) => String(row.id));
  const currentIndex = ids.indexOf(scopedContactId);

  if (currentIndex === -1) {
    throw new Error('Emergency contact not found.');
  }

  const clampedRank = Math.max(1, Math.min(targetRank, ids.length));
  ids.splice(currentIndex, 1);
  ids.splice(clampedRank - 1, 0, scopedContactId);

  const updates = await Promise.all(
    ids.map((id, index) =>
      supabaseClient
        .from('emergency_contacts')
        .update({ priority_order: index + 1 })
        .eq('id', id)
        .eq('employee_id', scopedEmployeeId)
    )
  );

  const failed = updates.find((result) => result.error);
  if (failed?.error) {
    throw new Error(failed.error.message || 'Could not update contact priority.');
  }
}

export async function compactEmergencyContactPriorities(employeeId: string): Promise<void> {
  const scopedEmployeeId = String(employeeId || '').trim();
  if (!scopedEmployeeId) return;

  const { data, error } = await supabaseClient
    .from('emergency_contacts')
    .select('id, priority_order, created_at')
    .eq('employee_id', scopedEmployeeId);

  if (error || !data?.length) return;

  const sorted = sortEmergencyContacts(data as EmergencyContactPriorityRow[]);
  const updates = await Promise.all(
    sorted.map((row, index) =>
      supabaseClient
        .from('emergency_contacts')
        .update({ priority_order: index + 1 })
        .eq('id', row.id)
        .eq('employee_id', scopedEmployeeId)
    )
  );

  const failed = updates.find((result) => result.error);
  if (failed?.error) {
    throw new Error(failed.error.message || 'Could not compact contact priorities.');
  }
}

export function renderEmergencyContactPriorityButtons(
  contactId: string,
  currentRank: number,
  total: number,
  dataAttr: string
): string {
  if (total <= 1) return '';

  return Array.from({ length: total }, (_, index) => index + 1)
    .map((rank) => {
      const label = emergencyContactPriorityLabel(rank);
      const isActive = rank === currentRank;
      return `<button
        type="button"
        class="button soft sm ec-priority-btn${isActive ? ' is-active' : ''}"
        data-${dataAttr}="${contactId}"
        data-ec-priority="${rank}"
        ${isActive ? 'disabled aria-current="true"' : ''}
      >${label}</button>`;
    })
    .join('');
}
