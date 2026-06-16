import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const INCLUDE_PATTERN = /<!--\s*@include\s+["'](.+?)["']\s*-->/g;

function processHtmlIncludes(html, baseDir) {
  return html.replace(INCLUDE_PATTERN, (_, includePath) => {
    const fullPath = resolve(baseDir, includePath);
    const nested = readFileSync(fullPath, 'utf-8');
    return processHtmlIncludes(nested, dirname(fullPath));
  });
}

export function htmlIncludesPlugin(projectRoot) {
  const root = projectRoot;

  return {
    name: 'orbis-html-includes',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return processHtmlIncludes(html, root);
      },
    },
  };
}
