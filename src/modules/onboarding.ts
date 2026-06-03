// ============================================
// Onboarding tasks (drawer tab)
// ============================================

import { supabaseClient } from '../services/supabaseClient';
import {
  STANDARD_ONBOARDING_TASKS,
  sortOnboardingTasksByStandard,
  syncStandardOnboardingTasks,
} from '../services/onboardingStandard';

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function getCurrentEmployeeId(): string {
  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
  return String(
    employee?.employee_id || employee?.id || employee?.dbId || ''
  ).trim();
}

export async function createDefaultOnboardingTasks(employeeId: string): Promise<void> {
  await syncStandardOnboardingTasks(employeeId);
}

export async function loadOnboardingTasks(employeeId: string): Promise<void> {
  if (!employeeId) return;

  await syncStandardOnboardingTasks(employeeId);

  const { data, error } = await supabaseClient
    .from('onboarding_tasks')
    .select('*')
    .eq('employee_id', employeeId);

  if (error) {
    console.error('Could not load onboarding tasks:', error);
    return;
  }

  const tasks = sortOnboardingTasksByStandard(data || []);
  const container = document.getElementById('onboardingChecklist');
  const summary = document.getElementById('onboardingSummary');
  const bar = document.getElementById('onboardingProgressBar');

  if (!container) return;

  if (!tasks.length) {
    container.innerHTML = '<div class="empty">No onboarding tasks.</div>';
    if (summary) summary.textContent = '0 of 0 complete';
    if (bar) bar.style.width = '0%';
    return;
  }

  const completed = tasks.filter(
    (task: { status?: string }) => String(task.status || '').toLowerCase() === 'completed'
  ).length;
  const percent = Math.round((completed / tasks.length) * 100);

  container.innerHTML = tasks
    .map(
      (task: { id: string; task_name?: string; status?: string }) => `
        <div class="onboarding-task" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #e5e7eb;">
            <input type="checkbox"
                ${String(task.status || '').toLowerCase() === 'completed' ? 'checked' : ''}
                onchange="toggleOnboardingTask('${task.id}', this.checked)">
            <span>${esc(task.task_name || 'Onboarding task')}</span>
        </div>
    `
    )
    .join('');

  if (summary) {
    summary.textContent = `${completed} of ${STANDARD_ONBOARDING_TASKS.length} complete`;
  }
  if (bar) bar.style.width = `${percent}%`;
}

export async function toggleOnboardingTask(taskId: string, isComplete: boolean): Promise<void> {
  if (!taskId) return;

  const { error } = await supabaseClient
    .from('onboarding_tasks')
    .update({ status: isComplete ? 'Completed' : 'Pending' })
    .eq('id', taskId);

  if (error) {
    console.error('Could not update onboarding task:', error);
    showToast('Could not update onboarding task.', 'error');
    return;
  }

  await loadOnboardingTasks(getCurrentEmployeeId());
}

declare global {
  interface Window {
    loadOnboardingTasks?: (employeeId: string) => Promise<void>;
    toggleOnboardingTask?: (taskId: string, isComplete: boolean) => Promise<void>;
    createDefaultOnboardingTasks?: (employeeId: string) => Promise<void>;
  }
}

window.loadOnboardingTasks = loadOnboardingTasks;
window.toggleOnboardingTask = toggleOnboardingTask;
window.createDefaultOnboardingTasks = createDefaultOnboardingTasks;
