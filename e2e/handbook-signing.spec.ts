import { expect, test } from '@playwright/test';
const text = 'I acknowledge that I have received and reviewed the BTW Global LLC Employee Handbook. I understand that the handbook is not a contract of employment and that policies may change at any time.';

test('employee reviews and signs the handbook from a public link on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let submitted: { signerName: string; agreed: boolean; signature: string } | undefined;
  await page.route('**/functions/v1/form-signature*', async route => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true, status: 'signed' } });
    } else {
      await route.fulfill({ json: { title: 'Employee Handbook Acknowledgement', subtitle: 'BTW Global LLC',
        date: '2026-09-14T15:00:00Z', summary: text, signerName: 'Test Employee', formType: 'handbook' } });
    }
  });
  await page.goto('/sign.html?token=handbook-test');
  await expect(page.locator('#signTitle')).toHaveText('Employee Handbook Acknowledgement');
  await expect(page.locator('.sign-summary-body')).toHaveText(text);
  await page.locator('#signApplyBtn').click();
  const firstSignature = await page.locator('#signPreview img').getAttribute('src');
  await page.locator('#signName').fill('Test Updated Name');
  await page.locator('#signAgree').check();
  await page.screenshot({ path: '../handbook-signing-mobile.png', fullPage: true });
  await page.locator('#signSubmitBtn').click();
  await expect(page.locator('.sign-success')).toContainText('Your signature has been recorded.');
  expect(submitted?.signerName).toBe('Test Updated Name');
  expect(submitted?.agreed).toBe(true);
  expect(submitted?.signature).toMatch(/^data:image\/png;base64,/);
  expect(submitted?.signature).not.toBe(firstSignature);
});

for (const message of ['This document has already been signed.', 'This signing link has expired.']) {
  test(`public link reports: ${message}`, async ({ page }) => {
    await page.route('**/functions/v1/form-signature*', route => route.fulfill({ status: 410, json: { error: message } }));
    await page.goto('/sign.html?token=closed-test');
    await expect(page.locator('.sign-error')).toHaveText(message);
    await expect(page.locator('#signSubmitBtn')).toHaveCount(0);
  });
}
