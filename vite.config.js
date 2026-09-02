import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlIncludesPlugin } from './vite/plugins/htmlIncludes.js';
import { bundleBudgetPlugin } from './vite/plugins/bundleBudget.js';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [htmlIncludesPlugin(projectRoot), bundleBudgetPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        sign: 'sign.html',
      },
      output: {
        // Preserve legacy window registrations when modules cross chunk boundaries.
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'app-ui',
              test: /src[\\/](ui|mobile)[\\/]/,
              tags: ['$initial'],
              entriesAware: true,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
