import {
  canAccessAppSection,
  ensureLinkedEmployeeRecord,
  getLinkedEmployeeId,
  isAdminUser,
  isSupervisorUser,
} from '../services/access';
import {
  getHandbookDocumentUrl,
  type HandbookDocument,
} from '../services/employeeHandbook';
import { recordPolicyCampaignAcknowledgment } from '../services/policyCampaigns';
import { supabaseClient } from '../services/supabaseClient';
import {
  loadEmployeeTasksSnapshot,
  recordHandbookAcknowledgment,
  STANDARD_ONBOARDING_TASKS,
  toggleEmployeeOnboardingTask,
  type EmployeeTaskItem,
} from '../services/employeeTasks';
import {
  isOnboardingTaskCompleted,
  onboardingDueBadgeLabel,
  onboardingDueStatus,
} from '../services/onboardingWorkflow';

declare global {
  interface Window {
    refreshMobileTasksUi?: () => Promise<void>;
    loadMyTasksPortal?: () => Promise<void>;
    toggleMyOnboardingTask?: (taskId: string, isComplete: boolean) => Promise<void>;
    acknowledgeHandbookFromPortal?: (documentId: string) => Promise<void>;
    acknowledgePolicyFromPortal?: (assignmentId: string, documentId?: string) => Promise<void>;
  }
}

let cachedPolicyDocs: HandbookDocument[] = [];

let cachedHandbookDocs: HandbookDocument[] = [];

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

function taskKindLabel(kind: EmployeeTaskItem['kind']): string {
  switch (kind) {
    case 'signature':
      return 'Signature required';
    case 'onboarding':
      return 'Onboarding';
    case 'handbook_ack':
      return 'Handbook';
    case 'policy_ack':
      return 'Policy';
    default:
      return 'Task';
  }
}

function renderTaskRow(item: EmployeeTaskItem, pending: boolean): string {
  const actions = pending
    ? `
        ${
          item.kind === 'signature' && item.signatureToken
            ? `<button type="button" class="button primary sm" data-sign-er="${esc(item.signatureToken)}">${esc(item.actionLabel || 'Review & sign')}</button>`
            : item.actionUrl
              ? `<a class="button primary sm" href="${esc(item.actionUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.actionLabel || 'Open')}</a>`
              : item.kind === 'handbook_ack' && item.documentLibraryId
                ? `<button type="button" class="button primary sm" data-ack-handbook="${esc(item.documentLibraryId)}">${esc(item.actionLabel || 'Acknowledge')}</button>`
                : item.kind === 'policy_ack' && item.policyCampaignAssignmentId
                  ? `<button type="button" class="button primary sm" data-ack-policy="${esc(item.policyCampaignAssignmentId)}" data-policy-doc="${esc(item.documentLibraryId || '')}">${esc(item.actionLabel || 'Acknowledge')}</button>`
                  : ''
        }
        ${
          item.kind === 'handbook_ack' && item.documentLibraryId
            ? `<button type="button" class="button soft sm" data-handbook-view="${esc(item.documentLibraryId)}">Read handbook</button>`
            : item.kind === 'policy_ack' && item.documentLibraryId
              ? `<button type="button" class="button soft sm" data-policy-view="${esc(item.documentLibraryId)}">Read policy</button>`
              : ''
        }
      `
    : `<span class="badge badge-active">Done</span>`;

  return `
    <article class="employee-portal-task-row${pending ? ' employee-portal-task-row--pending' : ''}">
      <div class="employee-portal-task-row-main">
        <div class="employee-portal-task-row-top">
          <span class="badge badge-soft">${esc(taskKindLabel(item.kind))}</span>
          <strong>${esc(item.title)}</strong>
        </div>
        <p class="muted employee-portal-task-detail">${esc(item.detail)}</p>
      </div>
      <div class="employee-portal-task-row-actions">${actions}</div>
    </article>
  `;
}

function renderHandbookCard(doc: HandbookDocument): string {
  return `
    <article class="document-card employee-portal-handbook-card">
      <div class="document-card-header">
        <h3>${esc(doc.title)}</h3>
        <span class="document-category">${esc(doc.category || 'Handbook')}</span>
      </div>
      ${doc.description ? `<p class="document-description">${esc(doc.description)}</p>` : ''}
      <div class="document-actions">
        <button type="button" class="button primary sm" data-handbook-view="${esc(doc.id)}">Open handbook</button>
        <button type="button" class="button soft sm" data-handbook-download="${esc(doc.id)}">Download</button>
      </div>
    </article>
  `;
}

async function openHandbookDocument(doc: HandbookDocument): Promise<void> {
  const url = await getHandbookDocumentUrl(doc, false);
  if (!url) {
    showToast('Could not open the handbook.', 'error');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function downloadHandbookDocument(doc: HandbookDocument): Promise<void> {
  const url = await getHandbookDocumentUrl(doc, true);
  if (!url) {
    showToast('Could not download the handbook.', 'error');
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = doc.file_name || doc.title;
  link.click();
}

async function loadPolicyDocument(documentId: string): Promise<HandbookDocument | null> {
  const cached = cachedPolicyDocs.find((item) => item.id === documentId);
  if (cached) return cached;

  const { data, error } = await supabaseClient
    .from('document_library')
    .select(
      'id, title, category, description, file_url, file_name, version, language, effective_date, is_active, created_at'
    )
    .eq('id', documentId)
    .maybeSingle();

  if (error || !data) return null;
  const doc = data as HandbookDocument;
  cachedPolicyDocs.push(doc);
  return doc;
}

async function openPolicyDocument(documentId: string): Promise<void> {
  const doc = await loadPolicyDocument(documentId);
  if (!doc) {
    showToast('Could not open the policy document.', 'error');
    return;
  }

  const url = await getHandbookDocumentUrl(doc, false);
  if (!url) {
    showToast('Could not open the policy document.', 'error');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function bindSignatureActions(): void {
  const root = safeGet('myTasksPage');
  if (!root) return;

  root.querySelectorAll<HTMLButtonElement>('[data-sign-er]').forEach((button) => {
    button.addEventListener('click', () => {
      const token = button.dataset.signEr || '';
      if (!token) return;
      if (typeof window.openErSigningModal === 'function') {
        void window.openErSigningModal(token);
        return;
      }
      showToast('Signing is not available. Refresh and try again.', 'error');
    });
  });
}

function bindPolicyActions(): void {
  const root = safeGet('myTasksPage');
  if (!root) return;

  root.querySelectorAll<HTMLButtonElement>('[data-policy-view]').forEach((button) => {
    button.addEventListener('click', () => {
      void openPolicyDocument(button.dataset.policyView || '');
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-ack-policy]').forEach((button) => {
    button.addEventListener('click', () => {
      void acknowledgePolicyFromPortal(
        button.dataset.ackPolicy || '',
        button.dataset.policyDoc || undefined
      );
    });
  });
}

function bindHandbookActions(docs: HandbookDocument[]): void {
  const root = safeGet('myTasksPage');
  if (!root) return;

  root.querySelectorAll<HTMLButtonElement>('[data-handbook-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const doc = docs.find((item) => item.id === button.dataset.handbookView);
      if (doc) void openHandbookDocument(doc);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-handbook-download]').forEach((button) => {
    button.addEventListener('click', () => {
      const doc = docs.find((item) => item.id === button.dataset.handbookDownload);
      if (doc) void downloadHandbookDocument(doc);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-ack-handbook]').forEach((button) => {
    button.addEventListener('click', () => {
      void acknowledgeHandbookFromPortal(button.dataset.ackHandbook || '');
    });
  });
}

function renderOnboardingChecklist(
  tasks: Array<{
    id: string;
    task_name?: string;
    status?: string;
    due_date?: string | null;
  }>
): void {
  const container = safeGet('myTasksOnboardingList');
  const summary = safeGet('myTasksOnboardingSummary');
  const bar = safeGet('myTasksOnboardingProgress');

  if (!container) return;

  if (!tasks.length) {
    container.innerHTML = '<div class="muted">No onboarding tasks on file.</div>';
    if (summary) summary.textContent = '';
    if (bar) bar.style.width = '0%';
    return;
  }

  const completed = tasks.filter(
    (task) => String(task.status || '').toLowerCase() === 'completed'
  ).length;
  const percent = Math.round((completed / tasks.length) * 100);

  container.innerHTML = tasks
    .map((task) => {
      const completed = isOnboardingTaskCompleted(task.status);
      const dueStatus = onboardingDueStatus(task.due_date);
      const dueClass =
        dueStatus === 'overdue'
          ? 'badge badge-absent'
          : dueStatus === 'due_soon'
            ? 'badge badge-leave'
            : 'badge badge-soft';
      const dueBadge = completed
        ? '<span class="badge badge-active">Completed</span>'
        : task.due_date
          ? `<span class="${dueClass}">${esc(onboardingDueBadgeLabel(task.due_date))}</span>`
          : '';

      return `
        <label class="employee-portal-onboarding-row${completed ? ' is-complete' : ''}">
          <input
            type="checkbox"
            data-onboarding-task-id="${esc(task.id)}"
            ${completed ? 'checked' : ''}
          />
          <span class="employee-portal-onboarding-row-main">
            <strong>${esc(task.task_name || 'Onboarding task')}</strong>
            ${dueBadge}
          </span>
        </label>
      `;
    })
    .join('');

  container.querySelectorAll<HTMLInputElement>('[data-onboarding-task-id]').forEach((input) => {
    input.addEventListener('change', () => {
      void toggleMyOnboardingTask(input.dataset.onboardingTaskId || '', input.checked);
    });
  });

  if (summary) {
    summary.textContent = `${completed} of ${STANDARD_ONBOARDING_TASKS.length} complete`;
  }
  if (bar) bar.style.width = `${percent}%`;
}

function renderCompletedAcknowledgments(items: EmployeeTaskItem[]): void {
  const container = safeGet('myTasksCompletedList');
  if (!container) return;

  const completed = items.filter((item) => item.status === 'completed');
  if (!completed.length) {
    container.innerHTML = '<div class="muted">Completed acknowledgments will appear here.</div>';
    return;
  }

  container.innerHTML = completed.map((item) => renderTaskRow(item, false)).join('');
}

export async function acknowledgePolicyFromPortal(
  assignmentId: string,
  documentId?: string
): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  if (!employeeId || !assignmentId) {
    showToast('Could not acknowledge policy.', 'error');
    return;
  }

  if (documentId) {
    await openPolicyDocument(documentId);
  }

  const ok =
    typeof window.showOrbisConfirm === 'function'
      ? await window.showOrbisConfirm(
          'Confirm you have read and understand this policy. Your acknowledgment is recorded for compliance.',
          { title: 'Acknowledge policy', confirmLabel: 'I acknowledge' }
        )
      : window.confirm('Confirm you have read and understand this policy.');

  if (!ok) return;

  try {
    await recordPolicyCampaignAcknowledgment({ employeeId, assignmentId });
    showToast('Policy acknowledgment saved.');
    await loadMyTasksPortal();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save acknowledgment.';
    showToast(message, 'error');
  }
}

export async function acknowledgeHandbookFromPortal(documentId: string): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  const doc = cachedHandbookDocs.find((item) => item.id === documentId);

  if (!employeeId || !doc) {
    showToast('Could not acknowledge handbook.', 'error');
    return;
  }

  try {
    await recordHandbookAcknowledgment({ employeeId, document: doc });
    showToast('Handbook acknowledgment saved.');
    await loadMyTasksPortal();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save acknowledgment.';
    showToast(message, 'error');
  }
}

export async function toggleMyOnboardingTask(taskId: string, isComplete: boolean): Promise<void> {
  const employeeId = getLinkedEmployeeId();
  if (!taskId || !employeeId) return;

  try {
    await toggleEmployeeOnboardingTask(employeeId, taskId, isComplete);
    await loadMyTasksPortal();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update task.';
    showToast(message, 'error');
  }
}

function renderTasksPortalUnlinkedState(): void {
  const pendingEl = safeGet('myTasksPendingList');
  const handbookEl = safeGet('myTasksHandbookList');
  const isManager = isAdminUser() || isSupervisorUser();
  const message = isManager
    ? '<div class="muted">No employee record is linked to your login. Personal acknowledgments will appear here once HR links your BTW id.</div>'
    : '<div class="muted">No employee record is linked to your account. Ask HR to link your BTW id in Admin → User Access.</div>';

  if (pendingEl) pendingEl.innerHTML = message;
  if (handbookEl) {
    handbookEl.innerHTML = isManager
      ? '<div class="muted">Handbook and personal tasks require a linked employee record.</div>'
      : message;
  }
  renderOnboardingChecklist([]);
  renderCompletedAcknowledgments([]);
}

export async function loadMyTasksPortal(): Promise<void> {
  if (!canAccessAppSection('myTasksView')) return;

  let employeeId = getLinkedEmployeeId();
  if (!employeeId) {
    employeeId = (await ensureLinkedEmployeeRecord()) || '';
  }

  const pendingEl = safeGet('myTasksPendingList');
  const handbookEl = safeGet('myTasksHandbookList');

  if (!employeeId) {
    renderTasksPortalUnlinkedState();
    if (typeof window.refreshMobileTasksUi === 'function') {
      void window.refreshMobileTasksUi();
    }
    return;
  }

  if (pendingEl) pendingEl.innerHTML = '<div class="muted">Loading tasks…</div>';
  if (handbookEl) handbookEl.innerHTML = '<div class="muted">Loading handbook…</div>';

  try {
    const snapshot = await loadEmployeeTasksSnapshot(employeeId);
    cachedHandbookDocs = snapshot.handbookDocuments;

    if (pendingEl) {
      if (!snapshot.pending.length) {
        pendingEl.innerHTML =
          '<div class="employee-portal-task-empty">You are caught up — no pending tasks or acknowledgments.</div>';
      } else {
        pendingEl.innerHTML = snapshot.pending.map((item) => renderTaskRow(item, true)).join('');
      }
    }

    if (handbookEl) {
      if (!snapshot.handbookDocuments.length) {
        handbookEl.innerHTML =
          '<div class="muted">No handbook is published yet. Contact HR if you need a copy.</div>';
      } else {
        handbookEl.innerHTML = `<div class="documents-grid employee-portal-handbook-grid">${snapshot.handbookDocuments.map(renderHandbookCard).join('')}</div>`;
      }
    }

    bindHandbookActions(snapshot.handbookDocuments);
    bindSignatureActions();
    bindPolicyActions();
    renderOnboardingChecklist(snapshot.onboardingTasks);
    renderCompletedAcknowledgments(snapshot.completed);
    if (typeof window.refreshMobileTasksUi === 'function') {
      void window.refreshMobileTasksUi();
    }
  } catch (err) {
    console.error('[MyTasksPortal]', err);
    if (pendingEl) pendingEl.innerHTML = '<div class="muted">Could not load your tasks.</div>';
    showToast('Could not load tasks.', 'error');
  }
}

window.loadMyTasksPortal = loadMyTasksPortal;
window.toggleMyOnboardingTask = toggleMyOnboardingTask;
window.acknowledgeHandbookFromPortal = acknowledgeHandbookFromPortal;
window.acknowledgePolicyFromPortal = acknowledgePolicyFromPortal;

// Legacy alias for prior handbook-only loader
window.loadMyHandbookPortal = loadMyTasksPortal;
