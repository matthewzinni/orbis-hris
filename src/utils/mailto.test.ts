import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildMailtoUrl, openMailtoUrl } from './mailto';

describe('mailto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes spaces as %20 for Apple Mail', () => {
    const url = buildMailtoUrl('a@example.com', {
      subject: 'Hello there',
      body: 'Line one\nLine two',
    });

    expect(url).toContain('subject=Hello%20there');
    expect(url).toContain('body=Line%20one%0ALine%20two');
    expect(url).not.toContain('+');
  });

  it('opens mailto via location.assign', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { assign },
    });
    vi.stubGlobal('document', {
      createElement: vi.fn(),
      body: { appendChild: vi.fn() },
    });

    openMailtoUrl('mailto:trent.wynne@btwglobal.com?subject=Hi');

    expect(assign).toHaveBeenCalledWith('mailto:trent.wynne@btwglobal.com?subject=Hi');
  });

  it('rejects non-mailto urls', () => {
    expect(() => openMailtoUrl('https://example.com')).toThrow('Invalid email link.');
  });
});
