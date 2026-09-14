import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('migrated architecture boundaries', () => {
  it('keeps drawer coordination independent of browser globals and concrete feature imports', () => {
    const source = readFileSync(resolve(root, 'src/modules/employeeDrawerTabLoads.ts'), 'utf8');
    expect(source).not.toMatch(/\b(window|globalThis|document)\s*[.[]/);
    expect(source).toContain("from './employeeDrawerRenderGuard'");
    expect(source).not.toMatch(/(?:from\s*|import\s*\()\s*['"][^'"]*(?:ui|app|services)\//);
    const tabs = readFileSync(resolve(root, 'src/ui/drawerTabs.ts'), 'utf8');
    expect(tabs).not.toContain('window.loadEmployeeDrawerTab');
    expect(tabs).toContain('void loadEmployeeDrawerTab(tabName)');
  });

  it('keeps the employee-drawer render guard free of window lookups and feature imports', () => {
    const source = readFileSync(resolve(root, 'src/modules/employeeDrawerRenderGuard.ts'), 'utf8');
    expect(source).not.toMatch(/\b(window|globalThis|document)\s*[.[]/);
    expect(source).not.toMatch(/(?:from\s*|import\s*\()\s*['"]/);
  });

  it('keeps migrated drawer loaders on the typed render guard instead of window lookups', () => {
    const files = [
      'src/modules/lazyInternalJobBoard.ts',
      'src/modules/internalJobBoard.ts',
      'src/modules/notes.ts',
      'src/modules/discipline.ts',
      'src/modules/incidents.ts',
      'src/modules/meetings.ts',
      'src/modules/stayInterviews.ts',
      'src/modules/reviews.ts',
      'src/modules/emergencyContacts.ts',
      'src/modules/onboarding.ts',
      'src/modules/offboarding.ts',
      'src/modules/leaveRequests.ts',
      'src/modules/employeeDocuments.ts',
      'src/ui/history.ts',
      'src/modules/employeeCareSupport.ts',
      'src/modules/employeeFlags.ts',
      'src/modules/payrollHandoff.ts',
      'src/services/employeeRecordCrud.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source, file).toMatch(/employeeDrawerRenderGuard|EmployeeDrawerLoadContext|createEmployeeDrawerRenderer/);
      expect(source, file).not.toContain('window.loadEmployeeDrawerTab');
    }
  });
  it('keeps refresh coordination independent of browser globals and UI imports', () => {
    const source = readFileSync(resolve(root, 'src/services/derivedDataRefresh.ts'), 'utf8');
    expect(source).not.toMatch(/\b(window|globalThis|document)\s*[.[]/);
    expect(source).not.toMatch(/(?:from\s*|import\s*\()\s*['"][^'"]*(?:ui|modules|app)\//);
  });

  it('initializes the typed connections before legacy bridges and authentication boot', () => {
    const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    const wiring = source.indexOf('initializeDerivedRefreshBindings();');
    expect(wiring).toBeGreaterThan(-1);
    expect(wiring).toBeLessThan(source.indexOf('const bridge = window'));
    expect(wiring).toBeLessThan(source.indexOf('initAuthBindings();'));
    const drawerWiring = source.indexOf('initializeEmployeeDrawerBindings();');
    expect(drawerWiring).toBeGreaterThan(wiring);
    expect(drawerWiring).toBeLessThan(source.indexOf('const bridge = window'));
  });
});
