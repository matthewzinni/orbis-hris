/**
 * Standard new-hire onboarding checklist (company-wide).
 */

import {
  buildOnboardingTaskDefaults,
  type OnboardingTaskRecord,
} from './onboardingWorkflow';
import { supabaseClient } from './supabaseClient';

export const STANDARD_ONBOARDING_TASKS = [
  'W-4',
  'NC-4',
  'I-9',
  'Standalone Form Packet',
] as const;

export type StandardOnboardingTask = (typeof STANDARD_ONBOARDING_TASKS)[number];

const STANDARD_SET = new Set<string>(STANDARD_ONBOARDING_TASKS);

/** Legacy task names → current standard name (or remove via LEGACY_REMOVE). */
export const LEGACY_ONBOARDING_RENAMES: Record<string, StandardOnboardingTask> = {
  'Complete W-4': 'W-4',
  'Complete NC-4': 'NC-4',
  'NC 4': 'NC-4',
  'Complete I-9': 'I-9',
};

export const LEGACY_ONBOARDING_REMOVE = [
  'Sign Employee Handbook',
  'Safety Training',
  'Set Up System Access',
] as const;

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

function pickRowToKeep(rows: OnboardingTaskRecord[]): OnboardingTaskRecord {
  const completed = rows.find((row) => isCompletedStatus(row.status));
  return completed || rows[0];
}

async function loadEmployeeHireDate(employeeId: string): Promise<string | null> {
  const { data, error } = await supabaseClient
    .from('employees')
    .select('hire_date')
    .eq('id', employeeId)
    .maybeSingle();

  if (error) {
    console.warn('[Onboarding] Could not load hire date:', error);
    return null;
  }

  return data?.hire_date ? String(data.hire_date).slice(0, 10) : null;
}

async function backfillOnboardingDefaults(
  rows: OnboardingTaskRecord[],
  hireDate: string | null
): Promise<void> {
  if (!hireDate) return;

  const updates = rows
    .map((row) => {
      if (!row.id) return null;

      const taskName = String(row.task_name || '').trim();
      if (!isStandardOnboardingTaskName(taskName)) return null;

      const defaults = buildOnboardingTaskDefaults(taskName, hireDate);
      const patch: Record<string, unknown> = {};

      if (!row.due_date && defaults.due_date) patch.due_date = defaults.due_date;
      if (!row.assigned_to && defaults.assigned_to) patch.assigned_to = defaults.assigned_to;
      if (row.show_in_portal === null || row.show_in_portal === undefined) {
        patch.show_in_portal = defaults.show_in_portal;
      }

      if (!Object.keys(patch).length) return null;
      return supabaseClient.from('onboarding_tasks').update(patch).eq('id', row.id);
    })
    .filter(Boolean);

  if (!updates.length) return;

  const results = await Promise.all(updates);
  const failed = results.find((result) => result?.error);
  if (failed?.error) {
    console.warn('[Onboarding] Could not backfill task defaults:', failed.error);
  }
}

/**
 * Align one employee's onboarding_tasks with the standard checklist.
 * Renames legacy rows, removes retired tasks, dedupes, inserts missing items.
 */
export async function syncStandardOnboardingTasks(employeeId: string): Promise<void> {
  const id = String(employeeId || '').trim();
  if (!id) return;

  const hireDate = await loadEmployeeHireDate(id);

  const { data, error } = await supabaseClient
    .from('onboarding_tasks')
    .select('id, employee_id, task_name, status, due_date, assigned_to, show_in_portal')
    .eq('employee_id', id);

  if (error) {
    console.warn('[Onboarding] Could not load tasks for sync:', error);
    return;
  }

  const rows = (data || []) as OnboardingTaskRecord[];

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
    .select('id, employee_id, task_name, status, due_date, assigned_to, show_in_portal')
    .eq('employee_id', id);

  if (refreshError) {
    console.warn('[Onboarding] Could not reload tasks for sync:', refreshError);
    return;
  }

  const current = (refreshed || []) as OnboardingTaskRecord[];
  const removeIds = new Set<string>();

  current.forEach((row) => {
    const name = String(row.task_name || '').trim();
    if (!row.id) return;

    if ((LEGACY_ONBOARDING_REMOVE as readonly string[]).includes(name)) {
      removeIds.add(row.id);
    }
  });

  const surviving = current.filter((row) => row.id && !removeIds.has(row.id));

  const byName = new Map<string, OnboardingTaskRecord[]>();
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
        ...buildOnboardingTaskDefaults(taskName, hireDate),
      }))
    );
  }

  const { data: finalRows, error: finalError } = await supabaseClient
    .from('onboarding_tasks')
    .select('id, employee_id, task_name, status, due_date, assigned_to, show_in_portal')
    .eq('employee_id', id);

  if (finalError) {
    console.warn('[Onboarding] Could not reload tasks for backfill:', finalError);
    return;
  }

  await backfillOnboardingDefaults((finalRows || []) as OnboardingTaskRecord[], hireDate);
}
