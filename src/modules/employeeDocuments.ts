import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';

const EMPLOYEE_DOCUMENTS_BUCKET = 'employee-documents';

interface EmployeeDocumentRecord {
  id?: string;
  employee_id?: string;
  document_type?: string;
  file_name?: string;
  file_path?: string;
  file_ext?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string;
  signedUrl?: string | null;
  [key: string]: unknown;
}

interface EmployeeDocumentEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    currentEmployee?: EmployeeDocumentEmployee;

    loadEmployeeDocuments?: (employeeId: string) => Promise<void>;
    uploadEmployeeDocument?: () => Promise<void>;
    deleteEmployeeDocument?: (docId: string) => Promise<void>;

    showToast?: (message: string, type?: string) => void;
    safeGet?: (id: string) => HTMLElement | null;
  }
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
  }
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
      return;
    }

    const rows = (data || []) as EmployeeDocumentRecord[];

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No documents for this employee.</div>';
      return;
    }

    const docsWithUrls = await Promise.all(
      rows.map(async (row) => {
        if (!row.file_path) {
          return { ...row, signedUrl: null };
        }

        const { data: signedData, error: signedError } = await supabaseClient.storage
          .from(EMPLOYEE_DOCUMENTS_BUCKET)
          .createSignedUrl(String(row.file_path), 3600);

        return {
          ...row,
          signedUrl: signedError ? null : signedData?.signedUrl || null,
        };
      })
    );

    target.innerHTML = docsWithUrls
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
              row.signedUrl
                ? `<a href="${escapeHtml(row.signedUrl)}" target="_blank" rel="noopener noreferrer" class="button soft">View</a>`
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
    showToast(`Saved file but DB insert failed: ${insertError.message}`, 'error');
    return;
  }

  showToast('Document uploaded.');

  const docType = safeGet<HTMLSelectElement>('docType');
  if (docType) docType.value = '';
  if (fileInput) fileInput.value = '';

  await loadEmployeeDocuments(employeeId);
}

window.loadEmployeeDocuments = loadEmployeeDocuments;
window.uploadEmployeeDocument = uploadEmployeeDocument;
window.deleteEmployeeDocument = deleteEmployeeDocument;
