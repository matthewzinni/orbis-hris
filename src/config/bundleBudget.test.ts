import { describe, expect, it } from 'vitest';
import { bundleBudgetPlugin, JAVASCRIPT_CHUNK_BUDGET } from '../../vite/plugins/bundleBudget.js';

function check(bundle: Record<string, unknown>) {
  bundleBudgetPlugin().generateBundle.call(
    { error: (message: string) => { throw new Error(message); } },
    {},
    bundle
  );
}

describe('production JavaScript chunk budget', () => {
  it('accepts chunks at the budget and ignores non-JavaScript assets', () => {
    expect(() => check({
      main: { type: 'chunk', fileName: 'main.js', code: 'x'.repeat(JAVASCRIPT_CHUNK_BUDGET) },
      css: { type: 'asset', fileName: 'main.css', source: 'x'.repeat(600_000) },
    })).not.toThrow();
  });

  it('rejects oversized entry and lazy chunks', () => {
    for (const fileName of ['main.js', 'lazy-feature.js']) {
      expect(() => check({
        output: { type: 'chunk', fileName, code: 'x'.repeat(JAVASCRIPT_CHUNK_BUDGET + 1) },
      })).toThrow(`${fileName} is 500.00 kB`);
    }
  });

  it('measures UTF-8 bytes rather than character count', () => {
    expect(() => check({
      main: { type: 'chunk', fileName: 'main.js', code: 'é'.repeat(250_001) },
    })).toThrow('500 kB budget');
  });
});
