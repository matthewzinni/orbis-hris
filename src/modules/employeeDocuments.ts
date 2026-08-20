import { canAccessPerformanceReviews } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';

const EMPLOYEE_DOCUMENTS_BUCKET = 'employee-documents';

/** Stored in employee_documents.document_type for files uploaded from the Performance Review tab. */
export const REVIEW_ATTACHMENT_DOC_TYPE = 'Performance Review Attachment';

interface EmployeeDocumentRecord {
  id?: string;
  employee_id?: string;
  document_type?: string;
  file_name?: string;
  file_path?: string;
  file_ext?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string;
  [key: string]: unknown;
}

interface EmployeeDocumentEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  [key: string]: unknown;
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }

  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: string = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getCurrentEmployee(): EmployeeDocumentEmployee | null {
  return window.currentEmployee || null;
}

function getEmployeeLookupIds(
  employee: EmployeeDocumentEmployee | null,
  fallbackId?: string
): string[] {
  return [employee?.dbId, employee?.employee_id, employee?.id, employee?.displayId, fallbackId]
    .filter(Boolean)
    .map(String)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function getResolvedEmployeeId(fallbackId?: string): string {
  const employee = getCurrentEmployee();

  return String(
    employee?.dbId || employee?.employee_id || employee?.id || employee?.displayId || fallbackId || ''
  ).trim();
}

function getReviewAttachmentTargetId(): string | null {
  const ctx = String(
    (window as Window & { reviewAttachmentContextId?: string | null }).reviewAttachmentContextId ||
      ''
  ).trim();
  if (ctx) return ctx;
  return String((window as Window & { currentReviewId?: string | null }).currentReviewId || '').trim() || null;
}

export async function deleteEmployeeDocument(docId: string): Promise<void> {
  if (!docId) return;

  if (
    !(await showOrbisConfirm('Delete this document?', {
      title: 'Delete document',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const { data: docRows, error: fetchError } = await supabaseClient
    .from('employee_documents')
    .select('id, file_path, employee_id')
    .eq('id', docId);

  const docRow = ((docRows || [])[0] || null) as EmployeeDocumentRecord | null;

  if (fetchError || !docRow) {
    console.error('[EmployeeDocuments] Could not find document:', fetchError);
    showToast('Could not find document record.', 'error');
    return;
  }

  if (docRow.file_path) {
    const { error: storageError } = await supabaseClient.storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .remove([String(docRow.file_path)]);

    if (storageError) {
      console.error('[EmployeeDocuments] Storage delete failed:', storageError);
      showToast('Could not delete file from storage.', 'error');
      return;
    }
  }

  const { error: deleteError } = await supabaseClient
    .from('employee_documents')
    .delete()
    .eq('id', docId);

  if (deleteError) {
    console.error('[EmployeeDocuments] DB delete failed:', deleteError);
    showToast('Could not delete document record.', 'error');
    return;
  }

  showToast('Document deleted.');

  const employeeId = getResolvedEmployeeId(String(docRow.employee_id || ''));

  if (employeeId) {
    await loadEmployeeDocuments(employeeId);
    if (safeGet('reviewAttachmentsList') && getReviewAttachmentTargetId()) {
      await loadPerformanceReviewAttachments(employeeId);
    }
  }
}

export async function openEmployeeDocument(filePath: string): Promise<void> {
  if (!filePath) return;

  // Open the tab during the user gesture so browsers do not block it while
  // Supabase generates a fresh, short-lived URL.
  const viewer = window.open('about:blank', '_blank');
  if (viewer) {
    viewer.opener = null;
    viewer.document.title = 'Opening document...';
    viewer.document.body.textContent = 'Opening document...';
  }

  let signedUrl = '';

  try {
    const { data, error } = await supabaseClient.storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
      throw error || new Error('Signed document URL was not returned.');
    }

    signedUrl = data.signedUrl;
  } catch (error) {
    viewer?.close();
    console.error('[EmployeeDocuments] Could not create document link:', error);
    showToast('Could not open document. Please try again.', 'error');
    return;
  }

  if (viewer) {
    viewer.location.replace(signedUrl);
    return;
  }

  window.location.assign(signedUrl);
}

export async function loadEmployeeDocuments(employeeId: string): Promise<void> {
  const target = safeGet('docHistory');

  if (!target) {
    console.warn('[EmployeeDocuments] docHistory container not found.');
    return;
  }

  const activeEmployee = getCurrentEmployee();
  const primaryEmployeeId = String(employeeId || getResolvedEmployeeId() || '').trim();
  const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);

  if (!primaryEmployeeId && !employeeIds.length) {
    target.innerHTML = '<div class="empty">Open an employee to view documents.</div>';
    return;
  }

  const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];

  target.innerHTML = '<div class="empty">Loading documents...</div>';

  try {
    const { data, error } = await supabaseClient
      .from('employee_documents')
      .select('*')
      .in('employee_id', idsToSearch)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('[EmployeeDocuments] Load failed:', error);
      target.innerHTML = '<div class="empty">Could not load documents.</div>';
      showToast('Could not load documents.', 'error');
      return;
    }

    const rows = (data || []) as EmployeeDocumentRecord[];

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No documents for this employee.</div>';
      return;
    }

    target.innerHTML = rows
      .map(
        (row) => `
      <div class="history-item">
        <div class="history-top">
          <div>
            <div class="history-title">${escapeHtml(row.file_name || row.document_type || 'Document')}</div>
            <div class="history-date">${escapeHtml(row.document_type || '')} • ${escapeHtml(row.uploaded_at || '')}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="button danger" type="button" data-delete-doc-id="${escapeHtml(row.id || '')}">Delete</button>
            ${
              row.file_path
                ? `<button class="button soft" type="button" data-view-doc-path="${escapeHtml(row.file_path)}">View</button>`
                : ''
            }
            <span class="badge badge-soft">Document</span>
          </div>
        </div>
      </div>
    `
      )
      .join('');

    target.querySelectorAll<HTMLButtonElement>('[data-delete-doc-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const docId = button.dataset.deleteDocId;

        if (docId) {
          void deleteEmployeeDocument(docId);
        }
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-view-doc-path]').forEach((button) => {
      button.addEventListener('click', () => {
        const filePath = button.dataset.viewDocPath;

        if (filePath) {
          void openEmployeeDocument(filePath);
        }
      });
    });
  } catch (err) {
    console.error('[EmployeeDocuments] Unexpected load failure:', err);
    target.innerHTML = '<div class="empty">Could not load documents.</div>';
  }
}

export async function uploadEmployeeDocument(): Promise<void> {
  const employee = getCurrentEmployee();
  const employeeId = getResolvedEmployeeId();

  if (!employee || !employeeId) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const documentType = safeGet<HTMLSelectElement>('docType')?.value || '';
  const fileInput = safeGet<HTMLInputElement>('docFile');
  const file = fileInput?.files?.[0];

  if (!documentType) {
    showToast('Select a document type.', 'error');
    return;
  }

  if (!file) {
    showToast('Choose a file to upload.', 'error');
    return;
  }

  const fileExt = file.name.includes('.') ? file.name.split('.').pop() : '';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${employeeId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(EMPLOYEE_DOCUMENTS_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    console.error('[EmployeeDocuments] Upload failed:', uploadError);
    showToast(`Upload failed: ${uploadError.message}`, 'error');
    return;
  }

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const { error: insertError } = await supabaseClient.from('employee_documents').insert([
    {
      employee_id: employeeId,
      document_type: documentType,
      file_name: file.name,
      file_path: filePath,
      file_ext: fileExt || null,
      uploaded_by: user?.id || null,
    },
  ]);

  if (insertError) {
    console.error('[EmployeeDocuments] DB insert failed:', insertError);
    const { error: cleanupError } = await supabaseClient.storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .remove([filePath]);
    if (cleanupError) {
      console.error('[EmployeeDocuments] Storage cleanup failed:', cleanupError);
    }
    showToast(`Upload failed: ${insertError.message}`, 'error');
    return;
  }

  showToast('Document uploaded.');

  const docType = safeGet<HTMLSelectElement>('docType');
  if (docType) docType.value = '';
  if (fileInput) fileInput.value = '';

  await loadEmployeeDocuments(employeeId);
}

export async function loadPerformanceReviewAttachments(employeeId: string): Promise<void> {
  const target = safeGet('reviewAttachmentsList');
  if (!target) return;

  const activeEmployee = getCurrentEmployee();
  const primaryEmployeeId = String(employeeId || getResolvedEmployeeId() || '').trim();
  const employeeIds = getEmployeeLookupIds(activeEmployee, primaryEmployeeId);
  const idsToSearch = employeeIds.length ? employeeIds : [primaryEmployeeId];

  if (!idsToSearch[0]) {
    target.innerHTML = '<div class="empty">Open an employee to view review attachments.</div>';
    return;
  }

  if (!canAccessPerformanceReviews(activeEmployee as Record<string, unknown> | null | undefined)) {
    target.innerHTML = '<div class="empty">Review attachments are not available for this employee.</div>';
    return;
  }

  const reviewId = getReviewAttachmentTargetId();
  if (!reviewId) {
    target.innerHTML =
      '<div class="empty muted">Save the review first, or click <strong>Edit</strong> on a review in history, then upload files here.</div>';
    return;
  }

  target.innerHTML = '<div class="empty">Loading attachments…</div>';

  const { data, error } = await supabaseClient
    .from('employee_documents')
    .select('*')
    .in('employee_id', idsToSearch)
    .eq('review_id', reviewId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('[ReviewAttachments] Load failed:', error);
    target.innerHTML =
      '<div class="empty">Could not load review attachments. Apply the latest database migration if this is a new feature.</div>';
    return;
  }

  const rows = (data || []) as EmployeeDocumentRecord[];

  if (!rows.length) {
    target.innerHTML = '<div class="empty muted">No files attached to this review yet.</div>';
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
      <div class="history-item">
        <div class="history-top">
          <div>
            <div class="history-title">${escapeHtml(row.file_name || 'Attachment')}</div>
            <div class="history-date">${escapeHtml(row.uploaded_at || '')}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="button danger sm review-doc-delete" type="button" data-delete-review-doc-id="${escapeHtml(row.id || '')}">Delete</button>
            ${
              row.file_path
                ? `<button class="button soft sm" type="button" data-view-review-doc-path="${escapeHtml(row.file_path)}">View</button>`
                : ''
            }
          </div>
        </div>
      </div>
    `
    )
    .join('');

  target.querySelectorAll<HTMLButtonElement>('[data-delete-review-doc-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const docId = button.dataset.deleteReviewDocId;
      if (docId) void deleteEmployeeDocument(docId);
    });
  });

  target.querySelectorAll<HTMLButtonElement>('[data-view-review-doc-path]').forEach((button) => {
    button.addEventListener('click', () => {
      const filePath = button.dataset.viewReviewDocPath;
      if (filePath) void openEmployeeDocument(filePath);
    });
  });
}

export async function uploadPerformanceReviewAttachment(): Promise<void> {
  const employee = getCurrentEmployee();
  const employeeId = getResolvedEmployeeId();
  const reviewId = getReviewAttachmentTargetId();

  if (!employee || !employeeId) {
    showToast('Open an employee first.', 'error');
    return;
  }

  if (!canAccessPerformanceReviews(employee as Record<string, unknown> | null | undefined)) {
    showToast('You do not have permission to add review attachments for this employee.', 'error');
    return;
  }

  if (!reviewId) {
    showToast('Save the review or open an existing review from history before attaching files.', 'error');
    return;
  }

  const fileInput = safeGet<HTMLInputElement>('reviewAttachmentFile');
  const file = fileInput?.files?.[0];

  if (!file) {
    showToast('Choose a file to upload.', 'error');
    return;
  }

  const fileExt = file.name.includes('.') ? file.name.split('.').pop() : '';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${employeeId}/${Date.now()}_review_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(EMPLOYEE_DOCUMENTS_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    console.error('[ReviewAttachments] Upload failed:', uploadError);
    showToast(`Upload failed: ${uploadError.message}`, 'error');
    return;
  }

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const insertRow: Record<string, unknown> = {
    employee_id: employeeId,
    document_type: REVIEW_ATTACHMENT_DOC_TYPE,
    file_name: file.name,
    file_path: filePath,
    file_ext: fileExt || null,
    uploaded_by: user?.id || null,
    review_id: reviewId,
  };

  let { error: insertError } = await supabaseClient.from('employee_documents').insert([insertRow]);

  if (insertError?.code === 'PGRST204' && String(insertError.message || '').includes('review_id')) {
    delete insertRow.review_id;
    const retry = await supabaseClient.from('employee_documents').insert([insertRow]);
    insertError = retry.error;
    if (!insertError) {
      showToast('File uploaded, but review link requires the latest database migration.', 'warning');
    }
  }

  if (insertError) {
    console.error('[ReviewAttachments] DB insert failed:', insertError);
    showToast(`Saved file but database insert failed: ${insertError.message}`, 'error');
    return;
  }

  showToast('Attachment uploaded.');
  if (fileInput) fileInput.value = '';

  await loadPerformanceReviewAttachments(employeeId);
}

window.loadEmployeeDocuments = loadEmployeeDocuments;
window.uploadEmployeeDocument = uploadEmployeeDocument;
window.deleteEmployeeDocument = deleteEmployeeDocument;
window.loadPerformanceReviewAttachments = loadPerformanceReviewAttachments;
window.uploadPerformanceReviewAttachment = uploadPerformanceReviewAttachment;
