import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/confirmModal', () => ({
  showOrbisConfirm: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('./documentSigning', () => ({
  loadDocumentSigning: vi.fn(() => Promise.resolve()),
}));

import { deleteDocument, type DocumentRecord } from './documents';

function baseDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    title: 'Employee Handbook',
    file_name: 'handbook.pdf',
    file_url: 'documents/handbook/123-handbook.pdf',
    category: 'handbook',
    ...overrides,
  } as DocumentRecord;
}

describe('deleteDocument', () => {
  let remove: ReturnType<typeof vi.fn>;
  let deleteEq: ReturnType<typeof vi.fn>;
  let fromTable: ReturnType<typeof vi.fn>;
  let fromStorage: ReturnType<typeof vi.fn>;
  let toastSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    remove = vi.fn(() => Promise.resolve({ data: [], error: null }));
    deleteEq = vi.fn(() => Promise.resolve({ error: null }));
    fromStorage = vi.fn(() => ({ remove }));
    fromTable = vi.fn(() => ({ delete: () => ({ eq: deleteEq }) }));
    toastSpy = vi.fn();

    vi.stubGlobal('window', {
      supabaseClient: {
        storage: { from: fromStorage },
        from: fromTable,
      },
      showToast: toastSpy,
    });
    vi.stubGlobal('document', { getElementById: () => null });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deletes storage and the DB row, then succeeds', async () => {
    await deleteDocument(baseDoc());

    expect(fromStorage).toHaveBeenCalledWith('documents');
    expect(fromStorage).toHaveBeenCalledWith('document-library');
    expect(remove).toHaveBeenCalledTimes(2);
    expect(fromTable).toHaveBeenCalledWith('document_library');
    expect(deleteEq).toHaveBeenCalledWith('id', 'doc-1');
  });

  it('stops and reports an error when a storage delete fails, without touching the DB row', async () => {
    remove.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });

    await deleteDocument(baseDoc());

    expect(remove).toHaveBeenCalledTimes(1);
    expect(deleteEq).not.toHaveBeenCalled();
  });

  it('reports an error and does not pretend to succeed when the DB delete fails', async () => {
    deleteEq.mockResolvedValueOnce({ error: { message: 'denied' } });

    await deleteDocument(baseDoc());

    expect(remove).toHaveBeenCalledTimes(2);
    expect(deleteEq).toHaveBeenCalledTimes(1);
  });
});
