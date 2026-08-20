import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrl = vi.fn();

vi.mock('../services/supabaseClient', () => ({
  supabaseClient: {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

vi.mock('../services/access', () => ({
  canAccessPerformanceReviews: vi.fn(() => true),
}));

vi.mock('../ui/confirmModal', () => ({
  showOrbisConfirm: vi.fn(),
}));

import { openEmployeeDocument } from './employeeDocuments';

describe('openEmployeeDocument', () => {
  const replace = vi.fn();
  const close = vi.fn();
  const assign = vi.fn();
  const showToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('opens a viewer during the click and replaces it with the signed URL', async () => {
    const viewer = {
      opener: {} as Window | null,
      document: { title: '', body: { textContent: '' } },
      location: { replace },
      close,
    };
    const open = vi.fn(() => viewer);
    vi.stubGlobal('window', { open, location: { assign }, showToast });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.test/document' },
      error: null,
    });

    await openEmployeeDocument('employee/file.pdf');

    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(viewer.opener).toBeNull();
    expect(viewer.document.body.textContent).toBe('Opening document...');
    expect(createSignedUrl).toHaveBeenCalledWith('employee/file.pdf', 3600);
    expect(replace).toHaveBeenCalledWith('https://example.test/document');
    expect(assign).not.toHaveBeenCalled();
  });

  it('closes the viewer and reports a signed URL failure', async () => {
    const viewer = {
      opener: null,
      document: { title: '', body: { textContent: '' } },
      location: { replace },
      close,
    };
    vi.stubGlobal('window', { open: vi.fn(() => viewer), location: { assign }, showToast });
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('Denied') });

    await openEmployeeDocument('employee/file.pdf');

    expect(close).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Could not open document. Please try again.', 'error');
  });

  it('falls back to the current tab when the browser blocks the viewer', async () => {
    vi.stubGlobal('window', { open: vi.fn(() => null), location: { assign }, showToast });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.test/document' },
      error: null,
    });

    await openEmployeeDocument('employee/file.pdf');

    expect(assign).toHaveBeenCalledWith('https://example.test/document');
  });
});
