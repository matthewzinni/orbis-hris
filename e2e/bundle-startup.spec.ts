import { expect, test } from '@playwright/test';

test('split startup bundles register legacy controls without loading optional sections', async ({ page }) => {
  const errors: string[] = [];
  const scripts: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.signIn === 'function');

  const functions = await page.evaluate(() => {
    const bridge = window as unknown as Record<string, unknown>;
    return ['signIn', 'saveReviewRecord', 'loadCandidates', 'loadReportsSection',
      'openOperationsView', 'initializeDocumentsLibrary'].map((name) => [name, typeof bridge[name]]);
  });
  expect(functions.every(([, type]) => type === 'function')).toBe(true);
  expect(scripts.some((url) => /\/(erAcknowledgmentPdf|candidates|reports|operationsIssues)-/.test(url))).toBe(false);
  expect(errors).toEqual([]);
});

test('standalone signing initializes shared chunks without application startup errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // No credentials or live signing request are needed to exercise this entry point.
  await page.goto('/sign.html');
  await expect(page.locator('#signBody')).toContainText('This signing link is missing a token.');
  expect(errors).toEqual([]);
});
