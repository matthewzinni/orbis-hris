/**
 * Standard new-hire onboarding checklist (company-wide).
 */

import { supabaseClient } from './supabaseClient';

export const STANDARD_ONBOARDING_TASKS = ['W-4', 'I-9', 'Standalone Form Packet'] as const;

export type StandardOnboardingTask = (typeof STANDARD_ONBOARDING_TASKS)[number];

const STANDARD_SET = new Set<string>(STANDARD_ONBOARDING_TASKS);

/** Legacy task names → current standard name (or remove via LEGACY_REMOVE). */
export const LEGACY_ONBOARDING_RENAMES: Record<string, StandardOnboardingTask> = {
  'Complete W-4': 'W-4',
  'Complete I-9': 'I-9',
};

export const LEGACY_ONBOARDING_REMOVE = [
  'Sign Employee Handbook',
  'Safety Training',
  'Set Up System Access',
] as const;

type OnboardingTaskRow = {
  id: string;
  employee_id?: string;
  task_name?: string;
  status?: string;
};

export function isStandardOnboardingTaskName(name: unknown): boolean {
  return STANDARD_SET.has(String(name || '').trim());
}

export function sortOnboardingTasksByStandard<T extends { task_name?: string }>(
  tasks: T[]
): T[] {
  const order = new Map(STANDARD_ONBOARDING_TASKS.map((name, index) => [name, index]));

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

function pickRowToKeep(rows: OnboardingTaskRow[]): OnboardingTaskRow {
  const completed = rows.find((row) => isCompletedStatus(row.status));
  return completed || rows[0];
}

/**
 * Align one employee's onboarding_tasks with the standard checklist.
 * Renames legacy rows, removes retired tasks, dedupes, inserts missing items.
 */
export async function syncStandardOnboardingTasks(employeeId: string): Promise<void> {
  const id = String(employeeId || '').trim();
  if (!id) return;

  const { data, error } = await supabaseClient
    .from('onboarding_tasks')
    .select('id, employee_id, task_name, status')
    .eq('employee_id', id);

  if (error) {
    console.warn('[Onboarding] Could not load tasks for sync:', error);
    return;
  }

  const rows = (data || []) as OnboardingTaskRow[];

  for (const row of rows) {
    const name = String(row.task_name || '').trim();
    if (!name || !row.id) continue;

    const renamed = LEGACY_ONBOARDING_RENAMES[name];
    if (renamed) {
      await supabaseClient.from('onboarding_tasks').update({ task_name: renamed }).eq('id', row.id);
    }
  }

  const { data: refreshed, error: refreshError } = await supabaseClient
    .from('onboarding_tasks')
    .select('id, employee_id, task_name, status')
    .eq('employee_id', id);

  if (refreshError) {
    console.warn('[Onboarding] Could not reload tasks for sync:', refreshError);
    return;
  }

  const current = (refreshed || []) as OnboardingTaskRow[];
  const removeIds = new Set<string>();

  current.forEach((row) => {
    const name = String(row.task_name || '').trim();
    if (!row.id) return;

    if ((LEGACY_ONBOARDING_REMOVE as readonly string[]).includes(name)) {
      removeIds.add(row.id);
    }
  });

  const surviving = current.filter((row) => row.id && !removeIds.has(row.id));

  const byName = new Map<string, OnboardingTaskRow[]>();
  surviving.forEach((row) => {
    const name = String(row.task_name || '').trim();
    if (!name || !isStandardOnboardingTaskName(name)) {
      if (row.id) removeIds.add(row.id);
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
    await supabaseClient.from('onboarding_tasks').delete().in('id', [...removeIds]);
  }

  const existingNames = new Set(byName.keys());
  const missing = STANDARD_ONBOARDING_TASKS.filter((taskName) => !existingNames.has(taskName));

  if (missing.length) {
    await supabaseClient.from('onboarding_tasks').insert(
      missing.map((taskName) => ({
        employee_id: id,
        task_name: taskName,
        status: 'Pending',
      }))
    );
  }
}
