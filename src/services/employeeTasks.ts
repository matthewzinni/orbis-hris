import { buildPublicSigningUrl } from './signatureRequests';
import { loadHandbookDocuments, type HandbookDocument } from './employeeHandbook';
import {
  sortOnboardingTasksByStandard,
  syncStandardOnboardingTasks,
  STANDARD_ONBOARDING_TASKS,
} from './onboardingStandard';
import { supabaseClient } from './supabaseClient';

export type EmployeeTaskKind =
  | 'signature'
  | 'onboarding'
  | 'handbook_ack'
  | 'policy_ack';

export type EmployeeTaskItem = {
  id: string;
  kind: EmployeeTaskKind;
  title: string;
  detail: string;
  status: 'pending' | 'completed';
  actionLabel?: string;
  actionUrl?: string;
  onboardingTaskId?: string;
  signatureToken?: string;
  documentLibraryId?: string;
  completedAt?: string | null;
};

export type EmployeeTasksSnapshot = {
  pending: EmployeeTaskItem[];
  completed: EmployeeTaskItem[];
  handbookDocuments: HandbookDocument[];
  onboardingTasks: Array<{ id: string; task_name?: string; status?: string }>;
  acknowledgments: Array<{
    id: string;
    acknowledgment_type?: string;
    document_title?: string;
    acknowledged_at?: string;
  }>;
};

const SIGNATURE_LABELS: Record<string, string> = {
  discipline: 'Discipline acknowledgment',
  incident: 'Incident acknowledgment',
  review: 'Performance review acknowledgment',
};

function isCompletedStatus(status: unknown): boolean {
  return String(status || '').trim().toLowerCase() === 'completed';
}

function formatDateLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function loadEmployeeTasksSnapshot(employeeId: string): Promise<EmployeeTasksSnapshot> {
  const id = String(employeeId || '').trim();
  if (!id) {
    return {
      pending: [],
      completed: [],
      handbookDocuments: [],
      onboardingTasks: [],
      acknowledgments: [],
    };
  }

  await syncStandardOnboardingTasks(id);

  const [handbookDocuments, onboardingRes, signatureRes, acknowledgmentRes] = await Promise.all([
    loadHandbookDocuments(),
    supabaseClient.from('onboarding_tasks').select('id, task_name, status').eq('employee_id', id),
    supabaseClient
      .from('signature_requests')
      .select('id, token, form_type, signer_role, status, created_at, signed_at, expires_at')
      .eq('employee_id', id)
      .eq('signer_role', 'employee')
      .order('created_at', { ascending: false }),
    supabaseClient
      .from('employee_acknowledgments')
      .select('id, acknowledgment_type, document_title, document_library_id, acknowledged_at')
      .eq('employee_id', id)
      .order('acknowledged_at', { ascending: false }),
  ]);

  if (onboardingRes.error) {
    throw new Error(onboardingRes.error.message || 'Could not load onboarding tasks.');
  }
  if (signatureRes.error) {
    throw new Error(signatureRes.error.message || 'Could not load signature requests.');
  }
  if (acknowledgmentRes.error) {
    throw new Error(acknowledgmentRes.error.message || 'Could not load acknowledgments.');
  }

  const onboardingTasks = sortOnboardingTasksByStandard(onboardingRes.data || []);
  const acknowledgments = acknowledgmentRes.data || [];
  const pending: EmployeeTaskItem[] = [];
  const completed: EmployeeTaskItem[] = [];

  onboardingTasks.forEach((task) => {
    const taskName = String(task.task_name || 'Onboarding task').trim();
    const item: EmployeeTaskItem = {
      id: `onboarding:${task.id}`,
      kind: 'onboarding',
      title: taskName,
      detail: isCompletedStatus(task.status)
        ? 'Marked complete on your checklist'
        : 'Complete and return to HR, then mark done below',
      status: isCompletedStatus(task.status) ? 'completed' : 'pending',
      onboardingTaskId: task.id,
    };

    if (item.status === 'pending') pending.push(item);
    else completed.push(item);
  });

  (signatureRes.data || []).forEach((row) => {
    const formType = String(row.form_type || '').trim();
    const status = String(row.status || '').trim().toLowerCase();
    const title = SIGNATURE_LABELS[formType] || 'Document acknowledgment';
    const item: EmployeeTaskItem = {
      id: `signature:${row.id}`,
      kind: 'signature',
      title,
      detail:
        status === 'pending'
          ? `Sign by ${formatDateLabel(row.expires_at) || 'deadline on file'}`
          : status === 'signed'
            ? `Signed ${formatDateLabel(row.signed_at) || ''}`.trim()
            : String(row.status || 'Updated'),
      status: status === 'signed' ? 'completed' : 'pending',
      actionLabel: status === 'pending' ? 'Sign now' : undefined,
      actionUrl: status === 'pending' && row.token ? buildPublicSigningUrl(String(row.token)) : undefined,
      signatureToken: row.token ? String(row.token) : undefined,
      completedAt: row.signed_at ? String(row.signed_at) : null,
    };

    if (item.status === 'pending') pending.push(item);
    else if (status === 'signed') completed.push(item);
  });

  handbookDocuments.forEach((doc) => {
    const ack = acknowledgments.find(
      (row) =>
        row.document_library_id === doc.id ||
        String(row.document_title || '').trim() === String(doc.title || '').trim()
    );

    const item: EmployeeTaskItem = {
      id: `handbook:${doc.id}`,
      kind: 'handbook_ack',
      title: `Acknowledge ${doc.title}`,
      detail: ack
        ? `Acknowledged ${formatDateLabel(ack.acknowledged_at)}`
        : 'Read the handbook, then confirm you received and reviewed it',
      status: ack ? 'completed' : 'pending',
      documentLibraryId: doc.id,
      actionLabel: ack ? undefined : 'Acknowledge handbook',
      completedAt: ack?.acknowledged_at ? String(ack.acknowledged_at) : null,
    };

    if (item.status === 'pending') pending.push(item);
    else completed.push(item);
  });

  const policyDocs = acknowledgments.filter((row) => row.acknowledgment_type === 'policy');
  policyDocs.forEach((row) => {
    completed.push({
      id: `policy:${row.id}`,
      kind: 'policy_ack',
      title: String(row.document_title || 'Policy acknowledgment'),
      detail: `Acknowledged ${formatDateLabel(row.acknowledged_at)}`,
      status: 'completed',
      completedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    });
  });

  return {
    pending,
    completed,
    handbookDocuments,
    onboardingTasks,
    acknowledgments,
  };
}

export async function recordHandbookAcknowledgment(input: {
  employeeId: string;
  document: HandbookDocument;
}): Promise<void> {
  const employeeId = String(input.employeeId || '').trim();
  if (!employeeId) {
    throw new Error('No employee record linked.');
  }

  const { error } = await supabaseClient.from('employee_acknowledgments').insert([
    {
      employee_id: employeeId,
      acknowledgment_type: 'handbook',
      document_library_id: input.document.id,
      document_title: input.document.title,
      notes: 'Acknowledged in Orbis employee portal',
    },
  ]);

  if (error) {
    if (error.code === '23505') {
      return;
    }
    throw new Error(error.message || 'Could not save handbook acknowledgment.');
  }
}

export async function toggleEmployeeOnboardingTask(
  employeeId: string,
  taskId: string,
  isComplete: boolean
): Promise<void> {
  const { error } = await supabaseClient
    .from('onboarding_tasks')
    .update({ status: isComplete ? 'Completed' : 'Pending' })
    .eq('id', taskId)
    .eq('employee_id', employeeId);

  if (error) {
    throw new Error(error.message || 'Could not update onboarding task.');
  }
}

export { STANDARD_ONBOARDING_TASKS };
