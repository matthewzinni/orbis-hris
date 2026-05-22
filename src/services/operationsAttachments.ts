import { supabaseClient } from '../services/supabaseClient';
import { resolveCurrentUserEmail } from './operationsAccess';
import type { OperationsIssueAttachment } from '../types/operationsTypes';

const OPERATIONS_BUCKET = 'operations-issues';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function loadOperationsIssueAttachments(
  issueId: string
): Promise<OperationsIssueAttachment[]> {
  const { data, error } = await supabaseClient
    .from('operations_issue_attachments')
    .select('*')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Operations] Could not load attachments:', error);
    return [];
  }

  return (data || []) as OperationsIssueAttachment[];
}

export async function uploadOperationsIssueAttachment(
  issueId: string,
  file: File
): Promise<void> {
  const email = await resolveCurrentUserEmail();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${issueId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(OPERATIONS_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { error: insertError } = await supabaseClient
    .from('operations_issue_attachments')
    .insert({
      issue_id: issueId,
      file_name: file.name,
      file_path: filePath,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by_email: email || null,
    });

  if (insertError) {
    throw insertError;
  }
}

export async function deleteOperationsIssueAttachment(
  attachment: OperationsIssueAttachment
): Promise<void> {
  if (!attachment.id) return;

  if (attachment.file_path) {
    const { error: storageError } = await supabaseClient.storage
      .from(OPERATIONS_BUCKET)
      .remove([attachment.file_path]);

    if (storageError) {
      console.warn('[Operations] Storage delete warning:', storageError);
    }
  }

  const { error } = await supabaseClient
    .from('operations_issue_attachments')
    .delete()
    .eq('id', attachment.id);

  if (error) {
    throw error;
  }
}

export async function getOperationsAttachmentSignedUrl(
  filePath: string
): Promise<string | null> {
  const { data, error } = await supabaseClient.storage
    .from(OPERATIONS_BUCKET)
    .createSignedUrl(filePath, 3600);

  if (error) {
    console.warn('[Operations] Could not create signed URL:', error);
    return null;
  }

  return data?.signedUrl || null;
}

export function renderOperationsIssueAttachments(
  container: HTMLElement | null,
  attachments: OperationsIssueAttachment[],
  onDelete?: (attachment: OperationsIssueAttachment) => void
): void {
  if (!container) return;

  if (!attachments.length) {
    container.innerHTML = '<div class="empty">No files attached.</div>';
    return;
  }

  container.innerHTML = attachments
    .map(
      (attachment) => `
        <div class="history-item" data-attachment-id="${escapeHtml(attachment.id || '')}">
          <div class="history-top">
            <div>
              <strong>${escapeHtml(attachment.file_name || 'File')}</strong>
              <span>${escapeHtml(attachment.uploaded_by_email || '')}</span>
            </div>
            <div class="table-actions">
              <button
                class="button soft sm"
                type="button"
                data-open-attachment-path="${escapeHtml(attachment.file_path || '')}"
              >
                View
              </button>
              ${
                onDelete
                  ? `<button class="button danger sm" type="button" data-delete-attachment-id="${escapeHtml(attachment.id || '')}">Delete</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      `
    )
    .join('');

  container.querySelectorAll<HTMLButtonElement>('[data-open-attachment-path]').forEach((button) => {
    button.addEventListener('click', async () => {
      const path = button.dataset.openAttachmentPath;
      if (!path) return;
      const url = await getOperationsAttachmentSignedUrl(path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

  if (onDelete) {
    container.querySelectorAll<HTMLButtonElement>('[data-delete-attachment-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const attachment = attachments.find((row) => String(row.id) === button.dataset.deleteAttachmentId);
        if (attachment) onDelete(attachment);
      });
    });
  }
}
