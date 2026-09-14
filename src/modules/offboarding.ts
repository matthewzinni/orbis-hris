// ============================================
// Offboarding tasks (drawer tab)
// ============================================

import { supabaseClient } from '../services/supabaseClient';
import {
  applyEmployeeDrawerAbortSignal,
  createEmployeeDrawerRenderer,
  isEmployeeDrawerLoadAbort,
  type EmployeeDrawerLoadContext,
} from './employeeDrawerRenderGuard';
import {
  STANDARD_OFFBOARDING_TASKS,
  sortOffboardingTasksByStandard,
  syncStandardOffboardingTasks,
} from '../services/offboardingStandard';

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function getCurrentEmployeeRosterId(): string {
  const employee = window.currentEmployee as Record<string, unknown> | null | undefined;
  return String(employee?.id || employee?.employee_id || '').trim();
}

export async function createDefaultOffboardingTasks(employeeId: string): Promise<void> {
  await syncStandardOffboardingTasks(employeeId);
}

export async function loadOffboardingTasks(
  employeeId: string,
  context?: EmployeeDrawerLoadContext
): Promise<void> {
  if (!employeeId) return;
  const render = createEmployeeDrawerRenderer(context, employeeId);
  if (!render.isCurrent()) return;

  const container = document.getElementById('offboardingChecklist');
  const summary = document.getElementById('offboardingSummary');
  const bar = document.getElementById('offboardingProgressBar');

  if (container && !render.write(container, '<div class="empty">Loading offboarding checklist…</div>')) {
    return;
  }

  try {
    await syncStandardOffboardingTasks(employeeId);
  } catch (err) {
    if (isEmployeeDrawerLoadAbort(err) || !render.isCurrent()) return;
    console.error('Could not sync offboarding checklist:', err);
    showToast('Could not sync offboarding checklist.', 'error');
  }

  if (!render.isCurrent()) return;

  const { data, error } = await applyEmployeeDrawerAbortSignal(
    supabaseClient.from('offboarding_tasks').select('*').eq('employee_id', employeeId),
    context?.signal
  );

  if (!render.isCurrent() || isEmployeeDrawerLoadAbort(error)) return;

  if (error) {
    console.error('Could not load offboarding tasks:', error);
    showToast('Could not load offboarding tasks.', 'error');
    if (container) {
      render.write(
        container,
        '<div class="empty">Could not load offboarding checklist. Try again or contact HR.</div>'
      );
    }
    render.mutate(summary, (el) => {
      el.textContent = 'Load failed';
    });
    render.mutate(bar, (el) => {
      el.style.width = '0%';
    });
    return;
  }

  const tasks = sortOffboardingTasksByStandard(data || []);

  if (!container || !render.isCurrent()) return;

  if (!tasks.length) {
    render.write(
      container,
      '<div class="empty">No offboarding checklist yet. Mark the employee terminated to generate tasks.</div>'
    );
    render.mutate(summary, (el) => {
      el.textContent = '0 of 0 complete';
    });
    render.mutate(bar, (el) => {
      el.style.width = '0%';
    });
    return;
  }

  const completed = tasks.filter(
    (task: { status?: string }) => String(task.status || '').toLowerCase() === 'completed'
  ).length;
  const percent = Math.round((completed / tasks.length) * 100);

  if (!render.write(
    container,
    tasks
      .map(
        (task: { id: string; task_name?: string; status?: string }) => `
        <div class="onboarding-task" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #e5e7eb;">
            <input type="checkbox"
                ${String(task.status || '').toLowerCase() === 'completed' ? 'checked' : ''}
                onchange="toggleOffboardingTask('${task.id}', this.checked)">
            <span>${esc(task.task_name || 'Offboarding task')}</span>
        </div>
    `
      )
      .join('')
  )) {
    return;
  }

  if (summary && render.isCurrent()) {
    summary.textContent = `${completed} of ${STANDARD_OFFBOARDING_TASKS.length} complete`;
  }
  render.mutate(bar, (el) => {
    el.style.width = `${percent}%`;
  });
}

export async function toggleOffboardingTask(taskId: string, isComplete: boolean): Promise<void> {
  if (!taskId) return;

  const { error } = await supabaseClient
    .from('offboarding_tasks')
    .update({ status: isComplete ? 'Completed' : 'Pending' })
    .eq('id', taskId);

  if (error) {
    console.error('Could not update offboarding task:', error);
    showToast('Could not update offboarding task.', 'error');
    return;
  }

  await loadOffboardingTasks(getCurrentEmployeeRosterId());

  if (typeof window.loadHrInbox === 'function') {
    void window.loadHrInbox(true);
  }
}

window.loadOffboardingTasks = loadOffboardingTasks;
window.toggleOffboardingTask = toggleOffboardingTask;
window.createDefaultOffboardingTasks = createDefaultOffboardingTasks;
