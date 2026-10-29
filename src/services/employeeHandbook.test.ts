import { describe, expect, it, vi } from 'vitest';

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));

vi.mock('./supabaseClient', () => ({
  supabaseClient: { storage: { from: () => ({ createSignedUrl }) } },
}));

import { getHandbookDocumentUrl, type HandbookDocument } from './employeeHandbook';

function baseDoc(overrides: Partial<HandbookDocument> = {}): HandbookDocument {
  return {
    id: 'doc-1',
    title: 'Employee Handbook',
    category: 'Handbook',
    file_url: 'documents/handbook/1700000000000-Employee_Handbook.pdf',
    file_name: 'Employee_Handbook.pdf',
    ...overrides,
  } as HandbookDocument;
}

describe('getHandbookDocumentUrl', () => {
  it('resolves the full bucket/path ref the current upload flow writes, not just the filename', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/doc' }, error: null });

    const url = await getHandbookDocumentUrl(baseDoc());

    expect(url).toBe('https://signed.example/doc');
    expect(createSignedUrl).toHaveBeenCalledWith(
      'handbook/1700000000000-Employee_Handbook.pdf',
      3600,
      expect.any(Object)
    );
  });

  it('falls back to the raw file_url when no bucket resolves a signed URL', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const url = await getHandbookDocumentUrl(baseDoc());

    expect(url).toBe('documents/handbook/1700000000000-Employee_Handbook.pdf');
  });
});
