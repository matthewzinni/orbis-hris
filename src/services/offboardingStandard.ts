/**
 * Standard offboarding checklist (company-wide).
 */

import { supabaseClient } from './supabaseClient';

export const STANDARD_OFFBOARDING_TASKS = [
  'Exit interview',
  'Payroll notified (final pay)',
  'Equipment returned',
  'System access revoked',
  'COBRA / benefits separation',
  'Final attendance to payroll',
] as const;

export type StandardOffboardingTask = (typeof STANDARD_OFFBOARDING_TASKS)[number];

const STANDARD_SET = new Set<string>(STANDARD_OFFBOARDING_TASKS);

type OffboardingTaskRow = {
  id: string;
  employee_id?: string;
  task_name?: string;
  status?: string;
};

export function isStandardOffboardingTaskName(name: unknown): boolean {
  return STANDARD_SET.has(String(name || '').trim());
}

export function sortOffboardingTasksByStandard<T extends { task_name?: string }>(
  tasks: T[]
): T[] {
  const order = new Map(STANDARD_OFFBOARDING_TASKS.map((name, index) => [name, index]));

  return [...tasks].sort((left, right) => {
    const leftKey = order.get(String(left.task_name || '').trim()) ?? 99;
    const rightKey = order.get(String(right.task_name || '').trim()) ?? 99;
    if (leftKey !== rightKey) return leftKey - rightKey;

    return String(left.task_name || '').localeCompare(String(right.task_name || ''), undefined, {
      sensitivity: 'base',
    });
  });
}

function isCompletedStatus(status: unknown): boolean {
  return String(status || '').trim().toLowerCase() === 'completed';
}

function pickRowToKeep(rows: OffboardingTaskRow[]): OffboardingTaskRow {
  const completed = rows.find((row) => isCompletedStatus(row.status));
  return completed || rows[0];
}

/** Align one employee's offboarding_tasks with the standard checklist. */
export async function syncStandardOffboardingTasks(employeeId: string): Promise<void> {
  const id = String(employeeId || '').trim();
  if (!id) return;

  const { data, error } = await supabaseClient
    .from('offboarding_tasks')
    .select('id, employee_id, task_name, status')
    .eq('employee_id', id);

  if (error) {
    console.warn('[Offboarding] Could not load tasks for sync:', error);
    return;
  }

  const current = (data || []) as OffboardingTaskRow[];
  const removeIds = new Set<string>();

  const byName = new Map<string, OffboardingTaskRow[]>();
  current.forEach((row) => {
    const name = String(row.task_name || '').trim();
    if (!name || !row.id) return;

    if (!isStandardOffboardingTaskName(name)) {
      removeIds.add(row.id);
      return;
    }

    const bucket = byName.get(name) || [];
    bucket.push(row);
    byName.set(name, bucket);
  });

  byName.forEach((duplicates, name) => {
    if (duplicates.length <= 1) return;
    const keep = pickRowToKeep(duplicates);
    duplicates.forEach((row) => {
      if (row.id && row.id !== keep.id) {
        removeIds.add(row.id);
      }
    });
    byName.set(name, [keep]);
  });

  if (removeIds.size) {
    await supabaseClient.from('offboarding_tasks').delete().in('id', [...removeIds]);
  }

  const existingNames = new Set(byName.keys());
  const missing = STANDARD_OFFBOARDING_TASKS.filter((taskName) => !existingNames.has(taskName));

  if (missing.length) {
    await supabaseClient.from('offboarding_tasks').insert(
      missing.map((taskName) => ({
        employee_id: id,
        task_name: taskName,
        status: 'Pending',
      }))
    );
  }
}
