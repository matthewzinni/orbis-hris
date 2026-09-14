import { expect, test } from '@playwright/test';

test('drawer tab navigation does not depend on the legacy window loader', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.loadEmployeeDrawerTab === 'function');
  const switched = await page.evaluate(() => {
    // No employee context: this checks wiring without querying employee records.
    window.currentEmployee = null;
    window.selectedEmployeeId = '';
    window.loadEmployeeDrawerTab = () => { throw new Error('Legacy lookup used'); };
    return window.activateDrawerTab?.('employee', 'notes', false);
  });
  expect(switched).toBe(true);
  await expect(page.locator('#tab-notes')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#tab-profile')).toHaveAttribute('aria-hidden', 'true');
  expect(errors).toEqual([]);
});
