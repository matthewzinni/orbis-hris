import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('production bundle boundaries', () => {
  it('loads the PDF engine only when an acknowledgment PDF is requested', () => {
    const signaturePads = read('src/ui/signaturePads.ts');
    expect(signaturePads).toContain("await import('../services/erAcknowledgmentPdf')");
    expect(signaturePads).not.toMatch(/import\s+\{[^}]*openErAcknowledgmentPdf[^}]*\}\s+from/);
  });

  it('keeps optional application sections out of the main entry chunk', () => {
    const main = read('src/main.ts');

    expect(main).toContain("from './modules/lazyCandidates'");
    expect(main).toContain("from './modules/lazyOperationsIssues'");
    expect(main).toContain("import './modules/lazyInternalJobBoard'");
    expect(main).toContain("import './modules/lazyReports'");
    expect(main).toContain("import './modules/lazySettingsAdmin'");

    expect(main).not.toContain("from './modules/candidates'");
    expect(main).not.toContain("from './modules/operationsIssues'");
    expect(main).not.toContain("import './modules/internalJobBoard'");
    expect(main).not.toContain("import './modules/reports'");
    expect(main).not.toContain("import './modules/settingsAdmin'");
  });

  it('does not pull the full Candidates module back through dashboard boot', () => {
    const dashboardBoot = read('src/modules/dashboardBoot.ts');
    expect(dashboardBoot).toContain("from './lazyCandidates'");
    expect(dashboardBoot).not.toContain("from './candidates'");
  });
});
