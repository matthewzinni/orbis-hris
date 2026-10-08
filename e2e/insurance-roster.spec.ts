import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Reports roster button downloads a populated CSV with eligible employees', async ({ page }) => {
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
    const button = document.getElementById('exportReportsInsuranceRosterCsvBtn');
    if (!button) throw new Error('Roster export button missing');
    document.body.appendChild(button);
  });
  const button = page.getByRole('button', { name: 'Export insurance roster CSV', exact: true });
  await expect(button).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^orbis-insurance-roster-\d{4}-\d{2}-\d{2}\.csv$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const csv = await readFile(path!, 'utf8');
  expect(csv.split('\n')).toHaveLength(2);
  expect(csv).toContain('Employee ID,Employee Name,Department,Position,Hire Date');
  expect(csv).toContain('TEST1,Ada Example,"Operations, West",Coordinator,2026-01-15');
  expect(csv).not.toContain('TEST2');
  expect(csv).not.toContain('TEST3');
});
