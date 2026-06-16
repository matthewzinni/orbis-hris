import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlIncludesPlugin } from './vite/plugins/htmlIncludes.js';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [htmlIncludesPlugin(projectRoot)],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        sign: 'sign.html',
      },
    },
  },
  server: {
    port: 5173,
  },
});
