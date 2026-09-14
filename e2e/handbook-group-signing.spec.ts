import { expect, test } from '@playwright/test';
const summary = 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook. I understand that the handbook is not a contract of employment and that policies may change at any time.';

test('same group link accepts different employees using only first and last name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const submissions: Array<Record<string, unknown>> = [];
  await page.route('**/functions/v1/form-signature?group=shared-test', async route => {
    if (route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true, status: 'signed' } });
    } else {
      await route.fulfill({ json: { title: 'Employee Handbook Acknowledgement', subtitle: 'BTW Global LLC',
        summary, formType: 'handbook', groupSigning: true } });
    }
  });
  for (const first of ['Alex', 'Taylor']) {
    await page.goto('/sign.html?group=shared-test');
    await expect(page.locator('#signName')).toHaveCount(0);
    await page.getByLabel('First name', { exact: true }).fill(first);
    await page.getByLabel('Last name', { exact: true }).fill('Example');
    await page.locator('#signAgree').check();
    await page.getByRole('button', { name: 'Preview signature' }).click();
    if (first === 'Alex') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: '../handbook-group-mobile.png', fullPage: true });
    }
    await page.getByRole('button', { name: 'Sign document' }).click();
    await expect(page.locator('.sign-success')).toContainText('Your signature has been recorded.');
  }
  expect(submissions.map(item => [item.firstName,item.lastName])).toEqual([['Alex','Example'],['Taylor','Example']]);
  expect(submissions.every(item => item.agreed === true && !item.employeeId && !item.email)).toBe(true);
});

test('unmatched name shows an error, keeps entered names, and allows correction', async ({ page }) => {
  await page.route('**/functions/v1/form-signature?group=shared-test', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 422, json: { error: 'We could not match your name to one employee record. Check your first and last name or contact HR. Your signature has not been saved.' } });
    }
    return route.fulfill({ json: { title: 'Employee Handbook Acknowledgement', summary, groupSigning: true } });
  });
  await page.goto('/sign.html?group=shared-test');
  await page.getByLabel('First name', { exact: true }).fill('Unknown');
  await page.getByLabel('Last name', { exact: true }).fill('Example');
  await page.locator('#signAgree').check();
  await page.getByRole('button', { name: 'Sign document' }).click();
  await expect(page.getByRole('alert')).toContainText('contact HR');
  await expect(page.getByRole('button', { name: 'Sign document' })).toBeEnabled();
  await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Unknown');
  await expect(page.locator('.sign-success')).toHaveCount(0);
});
