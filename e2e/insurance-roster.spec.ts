import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

test('Reports roster button downloads a populated Excel with eligible employees', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.loadReportsSection === 'function');
  await page.evaluate(async () => {
    // Load the optional Reports module without a live account or employee data.
    await window.loadReportsSection?.();
    window.EMPLOYEES = [
      { id: 'TEST1', first_name: 'Ada', last_name: 'Example', status: 'ACTIVE',
        pay_type: 'Hourly', is_remote: false, standard_hours: 40,
        department: 'Operations, West', position: 'Coordinator',
        hire_date: '2026-01-15', email: 'ada@example.com' },
      { id: 'TEST2', first_name: 'Former', last_name: 'Example', status: 'TERMINATED', pay_type: 'Hourly' },
      { id: 'TEST3', first_name: 'Remote', last_name: 'Example', status: 'ACTIVE', pay_type: 'Hourly', is_remote: true },
    ];
    const button = document.getElementById('exportReportsInsuranceRosterExcelBtn');
    if (!button) throw new Error('Roster export button missing');
    document.body.appendChild(button);
  });
  const button = page.getByRole('button', { name: 'Export insurance roster Excel', exact: true });
  await expect(button).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^orbis-insurance-roster-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const files = unzipSync(await readFile(path!));
  expect(files['[Content_Types].xml']).toBeDefined();
  const strings = strFromU8(files['xl/sharedStrings.xml']);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  expect(sheet.match(/<row /g)).toHaveLength(2);
  for (const value of ['Employee ID', 'Employee Name', 'TEST1', 'Ada Example', 'Operations, West', 'Coordinator', '2026-01-15']) {
    expect(strings).toContain(value);
  }
  expect(strings).not.toContain('TEST2');
  expect(strings).not.toContain('TEST3');
});
