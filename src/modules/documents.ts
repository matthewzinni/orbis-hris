export interface DocumentRecord {
  id: string;
  title: string;
  category: string;
  description?: string;
  file_url: string;
  file_name?: string;
  version?: string;
  language?: string;
  effective_date?: string;
  is_active: boolean;
  uploaded_by?: string;
  created_at: string;
}

export interface DocumentFilters {
  search: string;
  category: string;
  activeOnly: boolean;
}

export interface UploadDocumentPayload {
  title: string;
  category: string;
  description?: string;
  version?: string;
  language?: string;
  effective_date?: string;
  uploaded_by?: string;
  file: File;
}

declare global {
  interface Window {
    supabase: any;
    supabaseClient?: any;
    getOrbisSupabaseClient?: () => any;
    initializeDocumentsLibrary?: () => void;
    orbisSupabase?: any;
    db?: any;
  }
}

const DOCUMENT_TABLE = 'document_library';
const DOCUMENT_BUCKETS = ['documents', 'document-library'];
const DOCUMENT_UPLOAD_BUCKET = 'documents';

function getDocumentsSupabaseClient(): any {
  const possibleWindow = window as any;

  const candidates = [
    possibleWindow.supabaseClient,
    possibleWindow.orbisSupabase,
    possibleWindow.db,
    possibleWindow.getOrbisSupabaseClient?.(),
    possibleWindow.supabase,
  ];

  const realClient = candidates.find((client) => {
    return (
      client &&
      typeof client.from === 'function' &&
      client.storage &&
      typeof client.storage.from === 'function'
    );
  });

  if (!realClient) {
    console.error('No usable Supabase client found for Documents Library.', candidates);
  }

  return realClient || null;
}

let documents: DocumentRecord[] = [];
let documentEventsBound = false;

let documentFilters: DocumentFilters = {
  search: '',
  category: 'All',
  activeOnly: true,
};

export function initializeDocumentsLibrary(): void {
  console.log('Documents Library initializing...');
  injectDocumentUploadModalStyles();
  bindDocumentEvents();
  loadDocuments();
}

export function setDocumentFilters(filters: Partial<DocumentFilters>): void {
  documentFilters = {
    ...documentFilters,
    ...filters,
  };

  renderDocumentsLibrary();
}

export function getFilteredDocuments(): DocumentRecord[] {
  return documents.filter((doc) => {
    const searchTerm = documentFilters.search.toLowerCase();

    const matchesSearch =
      !searchTerm ||
      doc.title.toLowerCase().includes(searchTerm) ||
      doc.category.toLowerCase().includes(searchTerm) ||
      (doc.description || '').toLowerCase().includes(searchTerm) ||
      (doc.file_name || '').toLowerCase().includes(searchTerm);

    const matchesCategory =
      documentFilters.category === 'All' || doc.category === documentFilters.category;

    const matchesActive = !documentFilters.activeOnly || doc.is_active;

    return matchesSearch && matchesCategory && matchesActive;
  });
}

export function renderDocumentsLibrary(): void {
  const container = getDocumentsContainer();

  if (!container) {
    console.warn('Documents container not found. Expected #documentsLibrary or #documentsList.');
    return;
  }

  const filteredDocs = getFilteredDocuments();

  if (!filteredDocs.length) {
    container.innerHTML = `
            <div class="empty-state">
                No documents found.
            </div>
        `;
    return;
  }

  container.innerHTML = filteredDocs
    .map(
      (doc) => `
        <div class="document-card">
            <div class="document-card-header">
                <h3>${escapeHtml(doc.title)}</h3>
                <span class="document-category">${escapeHtml(doc.category)}</span>
            </div>

            <div class="document-meta">
                <span>Version: ${escapeHtml(doc.version || 'N/A')}</span>
                <span>Language: ${escapeHtml(doc.language || 'English')}</span>
            </div>

            <p class="document-description">
                ${escapeHtml(doc.description || '')}
            </p>

            <div class="document-actions">
                <button type="button" data-doc-id="${doc.id}" class="button soft sm document-action-btn view-document-btn">
                    View
                </button>
                <button type="button" data-doc-id="${doc.id}" class="button soft sm document-action-btn download-document-btn">
                    Download
                </button>
                <button type="button" data-doc-id="${doc.id}" class="button danger sm document-action-btn delete-document-btn">
                    Delete
                </button>
            </div>
        </div>
    `
    )
    .join('');

  bindDocumentActionButtons();
}

export async function loadDocuments(): Promise<void> {
  const container = getDocumentsContainer();

  if (container) {
    container.innerHTML = `
            <div class="empty-state">
                Loading documents...
            </div>
        `;
  }

  try {
    const db = getDocumentsSupabaseClient();
    console.log('Documents Supabase client found:', !!db);
    console.log('Documents container found:', !!getDocumentsContainer());
    console.log('Documents Supabase client has .from:', typeof db?.from === 'function');

    if (!db || typeof db.from !== 'function') {
      console.error('Documents library could not find a usable Supabase client.');
      documents = [];
      renderDocumentsLibrary();
      return;
    }

    const { data, error } = await db
      .from(DOCUMENT_TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load documents from document_library table:', error);
      await loadDocumentsFromStorage();
      return;
    }

    documents = ((data || []) as DocumentRecord[])
      .filter((doc) => doc.is_active !== false)
      .map(normalizeDocumentRecord);
    console.log('Documents loaded from table:', documents.length, documents);

    if (!documents.length) {
      await loadDocumentsFromStorage();
      return;
    }

    renderDocumentsLibrary();
  } catch (err) {
    console.error('Unexpected document load error:', err);
    await loadDocumentsFromStorage();
  }
}

async function loadDocumentsFromStorage(): Promise<void> {
  try {
    const db = getDocumentsSupabaseClient();

    if (!db || !db.storage || typeof db.storage.from !== 'function') {
      console.error(
        'Documents storage cannot load because the Supabase client is missing storage.from.'
      );
      documents = [];
      renderDocumentsLibrary();
      return;
    }

    const storageDocs: DocumentRecord[] = [];

    for (const bucketName of DOCUMENT_BUCKETS) {
      const files = await listStorageFilesRecursive(db, bucketName, '');
      storageDocs.push(...files);
    }

    documents = storageDocs;
    console.log('Documents loaded from storage:', documents.length, documents);
    renderDocumentsLibrary();
  } catch (err) {
    console.error('Unexpected storage document load error:', err);
    documents = [];
    renderDocumentsLibrary();
  }
}

async function listStorageFilesRecursive(
  db: any,
  bucketName: string,
  folderPath: string
): Promise<DocumentRecord[]> {
  const { data, error } = await db.storage.from(bucketName).list(folderPath, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    console.warn(`Could not read storage bucket ${bucketName}/${folderPath}:`, error);
    return [];
  }

  const results: DocumentRecord[] = [];

  for (const item of data || []) {
    if (!item.name || item.name === '.emptyFolderPlaceholder') continue;

    const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
    const isFolder = !item.metadata || Object.keys(item.metadata || {}).length === 0;

    if (isFolder) {
      const nestedFiles = await listStorageFilesRecursive(db, bucketName, fullPath);
      results.push(...nestedFiles);
      continue;
    }

    const { data: publicUrlData } = db.storage.from(bucketName).getPublicUrl(fullPath);

    results.push({
      id: `${bucketName}/${fullPath}`,
      title: cleanDocumentTitle(item.name),
      category: categoryFromPath(fullPath),
      description: `Uploaded document from ${bucketName} storage.`,
      file_url: publicUrlData.publicUrl,
      file_name: item.name,
      version: '1.0',
      language: 'English',
      effective_date: '',
      is_active: true,
      uploaded_by: 'System',
      created_at: item.created_at || new Date().toISOString(),
    });
  }

  return results;
}

export async function uploadDocument(payload: UploadDocumentPayload): Promise<void> {
  try {
    const db = getDocumentsSupabaseClient();

    if (
      !db ||
      typeof db.from !== 'function' ||
      !db.storage ||
      typeof db.storage.from !== 'function'
    ) {
      console.error('Documents upload could not find a usable Supabase client.');
      return;
    }

    const safeCategory = normalizeCategoryForStorage(payload.category || 'Documents');
    const fileName = `${Date.now()}-${payload.file.name}`;
    const filePath = `${safeCategory}/${fileName}`;

    let uploadBucket = DOCUMENT_UPLOAD_BUCKET;

    let { error: uploadError } = await db.storage
      .from(uploadBucket)
      .upload(filePath, payload.file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError && uploadBucket === 'documents') {
      console.warn(
        'Upload to documents bucket failed. Trying document-library bucket...',
        uploadError
      );

      uploadBucket = 'document-library';

      const retryResult = await db.storage.from(uploadBucket).upload(filePath, payload.file, {
        cacheControl: '3600',
        upsert: true,
      });

      uploadError = retryResult.error;
    }

    if (uploadError) {
      console.error('Document upload failed:', uploadError);
      alert(`Document upload failed: ${uploadError.message || 'Unknown error'}`);
      return;
    }

    const { data: publicUrlData } = db.storage.from(uploadBucket).getPublicUrl(filePath);

    const fileUrl = publicUrlData.publicUrl;

    const { error: insertError } = await db.from(DOCUMENT_TABLE).insert([
      {
        title: payload.title || payload.file.name,
        category: payload.category || 'Documents',
        description: payload.description || '',
        file_url: fileUrl,
        file_name: payload.file.name,
        version: payload.version || '1.0',
        language: payload.language || 'English',
        effective_date: payload.effective_date || null,
        uploaded_by: payload.uploaded_by || 'System',
        is_active: true,
      },
    ]);

    if (insertError) {
      console.error(
        'Document insert failed. File uploaded, but table row was not created:',
        insertError
      );
    }

    await loadDocuments();
  } catch (err) {
    console.error('Unexpected upload error:', err);
  }
}

function bindDocumentEvents(): void {
  if (documentEventsBound) return;

  const searchInput = (document.getElementById('documentsSearchInput') ||
    document.getElementById('documentsSearch')) as HTMLInputElement | null;

  const categoryFilter = document.getElementById(
    'documentsCategoryFilter'
  ) as HTMLSelectElement | null;
  const searchButton = document.getElementById('documentsSearchBtn') as HTMLButtonElement | null;
  const uploadButton = document.getElementById('uploadDocumentBtn') as HTMLButtonElement | null;
  const uploadInput = ensureDocumentUploadInput();

  searchInput?.addEventListener('input', () => {
    setDocumentFilters({ search: searchInput.value });
  });

  searchButton?.addEventListener('click', () => {
    setDocumentFilters({ search: searchInput?.value || '' });
    loadDocuments();
  });

  categoryFilter?.addEventListener('change', () => {
    setDocumentFilters({ category: categoryFilter.value || 'All' });
  });

  uploadButton?.addEventListener('click', () => {
    uploadInput.click();
  });

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];

    if (!file) return;

    const uploadDetails = await collectDocumentUploadDetails(file, categoryFilter);

    if (!uploadDetails) {
      uploadInput.value = '';
      return;
    }

    await uploadDocument({
      title: uploadDetails.title,
      category: uploadDetails.category,
      file,
      description: '',
      version: '1.0',
      language: 'English',
      uploaded_by: 'System',
    });

    uploadInput.value = '';
  });

  documentEventsBound = true;
}

function bindDocumentActionButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.view-document-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = documents.find((item) => item.id === button.dataset.docId);
      if (!doc) return;

      await openDocument(doc);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.download-document-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = documents.find((item) => item.id === button.dataset.docId);
      if (!doc) return;

      await downloadDocument(doc);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.delete-document-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const doc = documents.find((item) => item.id === button.dataset.docId);
      if (!doc) return;

      await deleteDocument(doc);
    });
  });
}

async function openDocument(doc: DocumentRecord): Promise<void> {
  const url = await getUsableDocumentUrl(doc, false);

  if (!url) {
    alert('Could not open this document. Check the console for details.');
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

async function downloadDocument(doc: DocumentRecord): Promise<void> {
  const url = await getUsableDocumentUrl(doc, true);

  if (!url) {
    alert('Could not download this document. Check the console for details.');
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = doc.file_name || doc.title;
  link.click();
}

async function deleteDocument(doc: DocumentRecord): Promise<void> {
  const confirmed = window.confirm(`Delete "${doc.title}" from the Document Library?`);
  if (!confirmed) return;

  const db = getDocumentsSupabaseClient();

  if (!db || !db.storage || typeof db.storage.from !== 'function') {
    console.error('Delete failed because Supabase storage is unavailable.');
    alert('Delete failed. Check the console for details.');
    return;
  }

  const targets = getAllPossibleStorageTargets(doc);

  for (const target of targets) {
    if (!target.bucket || !target.path) continue;

    const { error: storageError } = await db.storage.from(target.bucket).remove([target.path]);

    if (storageError) {
      console.warn(`Storage delete warning for ${target.bucket}/${target.path}:`, storageError);
    } else {
      console.log(`Deleted storage file: ${target.bucket}/${target.path}`);
    }
  }

  if (doc.id && !doc.id.includes('/')) {
    const { error: tableError } = await db.from(DOCUMENT_TABLE).delete().eq('id', doc.id);

    if (tableError) {
      console.warn('Table delete warning:', tableError);
    }
  }

  documents = documents.filter((item) => {
    return !(item.file_name === doc.file_name && item.title === doc.title);
  });

  renderDocumentsLibrary();

  setTimeout(async () => {
    await loadDocuments();
  }, 500);
}

async function getUsableDocumentUrl(doc: DocumentRecord, download: boolean): Promise<string> {
  const db = getDocumentsSupabaseClient();
  const target = getDocumentStorageTarget(doc);

  if (db?.storage && target.bucket && target.path) {
    const { data, error } = await db.storage.from(target.bucket).createSignedUrl(target.path, 60, {
      download: download ? doc.file_name || doc.title : false,
    });

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    console.warn('Signed URL failed, falling back to saved URL:', error);
  }

  return normalizeDocumentUrl(doc.file_url || '');
}

function getDocumentStorageTarget(doc: DocumentRecord): { bucket: string; path: string } {
  if (doc.id && doc.id.includes('/')) {
    const [bucket, ...pathParts] = doc.id.split('/');
    return {
      bucket,
      path: pathParts.join('/'),
    };
  }

  const url = doc.file_url || '';
  const publicMarker = '/storage/v1/object/public/';
  const signMarker = '/storage/v1/object/sign/';
  const marker = url.includes(publicMarker) ? publicMarker : signMarker;

  if (url.includes(marker)) {
    const afterMarker = url.split(marker)[1]?.split('?')[0] || '';
    const [bucketFromUrl, ...pathParts] = afterMarker.split('/');
    const cleanPath = pathParts.join('/');

    return {
      bucket: bucketFromUrl,
      path: cleanPath,
    };
  }

  return {
    bucket: DOCUMENT_UPLOAD_BUCKET,
    path: doc.file_name || '',
  };
}

function getAllPossibleStorageTargets(
  doc: DocumentRecord
): Array<{ bucket: string; path: string }> {
  const primary = getDocumentStorageTarget(doc);

  const targets: Array<{ bucket: string; path: string }> = [];

  if (primary.bucket && primary.path) {
    targets.push(primary);
  }

  const alternateBucket = primary.bucket === 'documents' ? 'document-library' : 'documents';

  if (primary.path) {
    targets.push({
      bucket: alternateBucket,
      path: primary.path,
    });
  }

  return targets.filter((target, index, self) => {
    return (
      index === self.findIndex((item) => item.bucket === target.bucket && item.path === target.path)
    );
  });
}

function getDocumentsContainer(): HTMLElement | null {
  return document.getElementById('documentsList');
}

function ensureDocumentUploadInput(): HTMLInputElement {
  let input = document.getElementById('documentUploadInput') as HTMLInputElement | null;

  if (!input) {
    input = document.createElement('input');
    input.id = 'documentUploadInput';
    input.type = 'file';
    input.hidden = true;
    document.body.appendChild(input);
  }

  return input;
}

function cleanDocumentTitle(fileName: string): string {
  return fileName
    .replace(/^\d+-/, '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function categoryFromPath(filePath: string): string {
  const firstFolder = filePath.split('/')[0];

  if (!firstFolder || firstFolder === filePath) return 'Documents';

  return firstFolder.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeCategoryForStorage(category: string): string {
  const normalized = category
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized === 'handbook' || normalized === 'handbooks') return 'handbook';
  if (normalized === 'standalone-forms' || normalized === 'forms') return 'forms';
  if (normalized === 'policies' || normalized === 'policy') return 'policies';

  return normalized || 'documents';
}

function normalizeDocumentRecord(doc: DocumentRecord): DocumentRecord {
  return {
    ...doc,
    file_url: normalizeDocumentUrl(doc.file_url || ''),
  };
}

function normalizeDocumentUrl(url: string): string {
  return url || '';
}
type DocumentUploadDetails = {
  title: string;
  category: string;
};

function collectDocumentUploadDetails(
  file: File,
  categoryFilter: HTMLSelectElement | null
): Promise<DocumentUploadDetails | null> {
  return new Promise((resolve) => {
    const existingOptions = categoryFilter
      ? Array.from(categoryFilter.options)
          .map((option) => option.value || option.textContent || '')
          .filter((value) => value && value !== 'All')
      : [];

    const categories = existingOptions.length
      ? existingOptions
      : ['Documents', 'Handbook', 'Forms', 'Policies', 'Standalone Forms'];

    const overlay = document.createElement('div');
    overlay.className = 'document-upload-modal-overlay';
    overlay.innerHTML = `
            <div class="document-upload-modal-card">
                <h3>Upload Document</h3>
                <p class="document-upload-modal-help">Name the document and choose the matching library category.</p>

                <label class="document-upload-modal-label" for="uploadDocumentTitleInput">Document Title</label>
                <input id="uploadDocumentTitleInput" class="document-upload-modal-input" value="${escapeHtml(cleanDocumentTitle(file.name))}" />

                <label class="document-upload-modal-label" for="uploadCategorySelect">Category</label>
                <select id="uploadCategorySelect" class="document-upload-modal-select">
                    ${categories
                      .map(
                        (category) => `
                        <option value="${escapeHtml(category)}">${escapeHtml(category)}</option>
                    `
                      )
                      .join('')}
                </select>

                <div class="document-upload-modal-actions">
                    <button type="button" id="cancelCategoryBtn" class="button soft">Cancel</button>
                    <button type="button" id="confirmCategoryBtn" class="button primary">Upload</button>
                </div>
            </div>
        `;

    document.body.appendChild(overlay);

    const titleInput = document.getElementById(
      'uploadDocumentTitleInput'
    ) as HTMLInputElement | null;
    const select = document.getElementById('uploadCategorySelect') as HTMLSelectElement | null;
    const cancelBtn = document.getElementById('cancelCategoryBtn');
    const confirmBtn = document.getElementById('confirmCategoryBtn');

    titleInput?.focus();
    titleInput?.select();

    cancelBtn?.addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    confirmBtn?.addEventListener('click', () => {
      const title = titleInput?.value.trim() || cleanDocumentTitle(file.name) || file.name;
      const category = select?.value || 'Documents';
      overlay.remove();
      resolve({ title, category });
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function injectDocumentUploadModalStyles(): void {
  if (document.getElementById('documentUploadModalStyles')) return;

  const style = document.createElement('style');
  style.id = 'documentUploadModalStyles';
  style.textContent = `
        .document-upload-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(15, 23, 42, 0.45);
            backdrop-filter: blur(3px);
        }

        .document-upload-modal-card {
            width: min(440px, calc(100vw - 32px));
            background: #ffffff;
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 18px;
            padding: 22px;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.25);
        }

        .document-upload-modal-card h3 {
            margin: 0 0 6px;
            color: #0f172a;
            font-size: 20px;
            font-weight: 800;
        }

        .document-upload-modal-help {
            margin: 0 0 16px;
            color: #64748b;
            font-size: 14px;
            line-height: 1.4;
        }

        .document-upload-modal-label {
            display: block;
            margin: 12px 0 6px;
            color: #334155;
            font-size: 13px;
            font-weight: 700;
        }

        .document-upload-modal-input,
        .document-upload-modal-select {
            width: 100%;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 10px 12px;
            color: #0f172a;
            background: #ffffff;
            font-size: 14px;
            outline: none;
        }

        .document-upload-modal-input:focus,
        .document-upload-modal-select:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }

        .document-upload-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 18px;
        }

        .document-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 14px;
        }

        .document-actions .button {
            min-width: 88px;
        }
    `;

  document.head.appendChild(style);
}

console.log('documents.ts module loaded');
console.log('Documents module using buckets:', DOCUMENT_BUCKETS);

window.initializeDocumentsLibrary = initializeDocumentsLibrary;
