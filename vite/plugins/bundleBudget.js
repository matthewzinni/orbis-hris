import { Buffer } from 'node:buffer';

// Match Vite's default 500 kB (uncompressed, minified) advisory budget.
export const JAVASCRIPT_CHUNK_BUDGET = 500_000;

export function bundleBudgetPlugin() {
  return {
    name: 'orbis-bundle-budget',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        const bytes = Buffer.byteLength(output.code, 'utf8');
        if (bytes > JAVASCRIPT_CHUNK_BUDGET) {
          this.error(
            `${output.fileName} is ${(bytes / 1000).toFixed(2)} kB; ` +
              'split the JavaScript chunk to keep it within the 500 kB budget.'
          );
        }
      }
    },
  };
}
