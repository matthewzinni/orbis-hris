// ============================================
// Onboarding tasks (drawer tab)
// ============================================

import { canEditEmployeeAdmin } from '../services/access';
import {
  STANDARD_ONBOARDING_TASKS,
  sortOnboardingTasksByStandard,
  syncStandardOnboardingTasks,
} from '../services/onboardingStandard';
import {
  onboardingAssigneeLabel,
  onboardingDueBadgeLabel,
  onboardingDueStatus,
  onboardingHrDetail,
  type OnboardingAssignee,
  type OnboardingTaskRecord,
} from '../services/onboardingWorkflow';
import { supabaseClient } from '../services/supabaseClient';

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
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
  return String(employee?.employee_id || employee?.id || employee?.dbId || '').trim();
}

function canManageOnboardingWorkflow(): boolean {
  return canEditEmployeeAdmin(window.currentEmployee as Record<string, unknown> | null);
}

function dueBadgeClass(status: ReturnType<typeof onboardingDueStatus>): string {
  if (status === 'overdue') return 'badge badge-absent';
  if (status === 'due_soon') return 'badge badge-leave';
  return 'badge badge-soft';
}

function renderOnboardingDueBadge(task: OnboardingTaskRecord, completed: boolean): string {
  if (completed) {
    const completedLabel = task.completed_at
      ? `Completed ${String(task.completed_at).slice(0, 10)}`
      : 'Completed';
    return `<span class="badge badge-active">${esc(completedLabel)}</span>`;
  }

  const dueStatus = onboardingDueStatus(task.due_date);
  return `<span class="${dueBadgeClass(dueStatus)}">${esc(onboardingDueBadgeLabel(task.due_date))}</span>`;
}

function renderOnboardingTaskRow(task: OnboardingTaskRecord, canManage: boolean): string {
  const completed = String(task.status || '').toLowerCase() === 'completed';
  const dueStatus = onboardingDueStatus(task.due_date);
  const isI9 = String(task.task_name || '').trim() === 'I-9';

  const metaFields = canManage
    ? `
      <div class="onboarding-task-meta-grid">
        <label class="onboarding-task-meta">
          <span class="onboarding-task-meta-label">Due date</span>
          <input
            type="date"
            class="input sm"
            data-onboarding-due-date="${esc(task.id)}"
            value="${esc(String(task.due_date || '').slice(0, 10))}"
          />
        </label>
        <label class="onboarding-task-meta">
          <span class="onboarding-task-meta-label">Assignee</span>
          <select class="select sm" data-onboarding-assignee="${esc(task.id)}">
            <option value="employee" ${task.assigned_to === 'employee' ? 'selected' : ''}>New hire</option>
            <option value="hr" ${task.assigned_to === 'hr' || !task.assigned_to ? 'selected' : ''}>HR</option>
            <option value="supervisor" ${task.assigned_to === 'supervisor' ? 'selected' : ''}>Supervisor</option>
          </select>
        </label>
        <label class="onboarding-task-meta onboarding-task-meta--checkbox">
          <input
            type="checkbox"
            data-onboarding-portal="${esc(task.id)}"
            ${task.show_in_portal !== false ? 'checked' : ''}
          />
          <span>Show in employee portal</span>
        </label>
      </div>
    `
    : `
      <div class="onboarding-task-meta-readonly muted">
        <span>Due ${esc(String(task.due_date || '—').slice(0, 10) || '—')}</span>
        <span>·</span>
        <span>${esc(onboardingAssigneeLabel(task.assigned_to))}</span>
        <span>·</span>
        <span>${task.show_in_portal === false ? 'HR only' : 'Visible in portal'}</span>
      </div>
    `;

  return `
    <article class="onboarding-task-row${completed ? ' is-complete' : ''}${isI9 && !completed && dueStatus === 'overdue' ? ' is-i9-overdue' : ''}">
      <div class="onboarding-task-row-top">
        <label class="onboarding-task-check">
          <input
            type="checkbox"
            data-onboarding-complete="${esc(task.id)}"
            ${completed ? 'checked' : ''}
          />
          <span class="onboarding-task-name">${esc(task.task_name || 'Onboarding task')}</span>
        </label>
        ${renderOnboardingDueBadge(task, completed)}
      </div>
      <p class="muted onboarding-task-detail">${esc(onboardingHrDetail(task))}</p>
      ${metaFields}
    </article>
  `;
}

function bindOnboardingTaskControls(employeeId: string): void {
  const container = document.getElementById('onboardingChecklist');
  if (!container) return;

  container.querySelectorAll<HTMLInputElement>('[data-onboarding-complete]').forEach((input) => {
    input.addEventListener('change', () => {
      void toggleOnboardingTask(String(input.dataset.onboardingComplete || ''), input.checked);
    });
  });

  if (!canManageOnboardingWorkflow()) return;

  container.querySelectorAll<HTMLInputElement>('[data-onboarding-due-date]').forEach((input) => {
    input.addEventListener('change', () => {
      void updateOnboardingTaskField(String(input.dataset.onboardingDueDate || ''), {
        due_date: input.value || null,
      });
    });
  });

  container.querySelectorAll<HTMLSelectElement>('[data-onboarding-assignee]').forEach((select) => {
    select.addEventListener('change', () => {
      void updateOnboardingTaskField(String(select.dataset.onboardingAssignee || ''), {
        assigned_to: select.value as OnboardingAssignee,
      });
    });
  });

  container.querySelectorAll<HTMLInputElement>('[data-onboarding-portal]').forEach((input) => {
    input.addEventListener('change', () => {
      void updateOnboardingTaskField(String(input.dataset.onboardingPortal || ''), {
        show_in_portal: input.checked,
      });
    });
  });
}

export async function createDefaultOnboardingTasks(employeeId: string): Promise<void> {
  await syncStandardOnboardingTasks(employeeId);
}

export async function loadOnboardingTasks(employeeId: string): Promise<void> {
  if (!employeeId) return;

  const container = document.getElementById('onboardingChecklist');
  const summary = document.getElementById('onboardingSummary');
  const bar = document.getElementById('onboardingProgressBar');

  if (container) {
    container.innerHTML = '<div class="empty">Loading onboarding checklist…</div>';
  }

  try {
    await syncStandardOnboardingTasks(employeeId);
  } catch (err) {
    console.error('Could not sync onboarding checklist:', err);
    showToast('Could not sync onboarding checklist.', 'error');
  }

  const { data, error } = await supabaseClient
    .from('onboarding_tasks')
    .select('*')
    .eq('employee_id', employeeId);

  if (error) {
    console.error('Could not load onboarding tasks:', error);
    showToast('Could not load onboarding tasks.', 'error');
    if (container) {
      container.innerHTML =
        '<div class="empty">Could not load onboarding checklist. Try again or contact HR.</div>';
    }
    if (summary) summary.textContent = 'Load failed';
    if (bar) bar.style.width = '0%';
    return;
  }

  const tasks = sortOnboardingTasksByStandard((data || []) as OnboardingTaskRecord[]);
  const i9Banner = safeGet('onboardingI9Banner');

  if (!container) return;

  if (!tasks.length) {
    container.innerHTML = '<div class="empty">No onboarding tasks.</div>';
    if (summary) summary.textContent = '0 of 0 complete';
    if (bar) bar.style.width = '0%';
    i9Banner?.classList.add('hidden');
    return;
  }

  const completed = tasks.filter((task) => String(task.status || '').toLowerCase() === 'completed')
    .length;
  const percent = Math.round((completed / tasks.length) * 100);
  const overdueI9 = tasks.find(
    (task) =>
      String(task.task_name || '').trim() === 'I-9' &&
      String(task.status || '').toLowerCase() !== 'completed' &&
      onboardingDueStatus(task.due_date) === 'overdue'
  );

  if (i9Banner) {
    if (overdueI9) {
      i9Banner.classList.remove('hidden');
      i9Banner.textContent = `I-9 verification is overdue (due ${String(overdueI9.due_date || '').slice(0, 10)}). Complete Section 2 immediately to stay compliant.`;
    } else {
      i9Banner.classList.add('hidden');
      i9Banner.textContent = '';
    }
  }

  const canManage = canManageOnboardingWorkflow();

  container.innerHTML = tasks.map((task) => renderOnboardingTaskRow(task, canManage)).join('');
  bindOnboardingTaskControls(employeeId);

  if (summary) {
    const overdueCount = tasks.filter(
      (task) =>
        String(task.status || '').toLowerCase() !== 'completed' &&
        onboardingDueStatus(task.due_date) === 'overdue'
    ).length;
    summary.textContent = `${completed} of ${STANDARD_ONBOARDING_TASKS.length} complete${overdueCount ? ` · ${overdueCount} overdue` : ''}`;
  }
  if (bar) bar.style.width = `${percent}%`;
}

export async function updateOnboardingTaskField(
  taskId: string,
  patch: Partial<Pick<OnboardingTaskRecord, 'due_date' | 'assigned_to' | 'show_in_portal'>>
): Promise<void> {
  if (!taskId) return;

  if (!canManageOnboardingWorkflow()) {
    showToast('You do not have permission to edit onboarding tasks for this employee.', 'error');
    return;
  }

  const { error } = await supabaseClient.from('onboarding_tasks').update(patch).eq('id', taskId);

  if (error) {
    console.error('Could not update onboarding task:', error);
    showToast('Could not update onboarding task.', 'error');
    return;
  }

  await loadOnboardingTasks(getCurrentEmployeeId());
}

export async function toggleOnboardingTask(taskId: string, isComplete: boolean): Promise<void> {
  if (!taskId) return;

  const { error } = await supabaseClient
    .from('onboarding_tasks')
    .update({
      status: isComplete ? 'Completed' : 'Pending',
      completed_at: isComplete ? new Date().toISOString() : null,
    })
    .eq('id', taskId);

  if (error) {
    console.error('Could not update onboarding task:', error);
    showToast('Could not update onboarding task.', 'error');
    return;
  }

  await loadOnboardingTasks(getCurrentEmployeeId());
}

window.loadOnboardingTasks = loadOnboardingTasks;
window.toggleOnboardingTask = toggleOnboardingTask;
window.updateOnboardingTaskField = updateOnboardingTaskField;
window.createDefaultOnboardingTasks = createDefaultOnboardingTasks;
