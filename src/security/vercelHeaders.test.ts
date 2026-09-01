import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../vercel.json'), 'utf8')
) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

describe('Vercel response security headers', () => {
  it('protects every route against framing, MIME sniffing, and referrer leakage', () => {
    const globalRule = config.headers?.find((rule) => rule.source === '/(.*)');
    const headers = new Map(
      (globalRule?.headers || []).map((header) => [header.key.toLowerCase(), header.value])
    );

    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('permissions-policy')).toContain('camera=()');
  });
});
