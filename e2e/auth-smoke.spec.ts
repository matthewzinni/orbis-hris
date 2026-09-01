import { expect, test } from '@playwright/test';

test.describe('auth shell', () => {
  test('shows branded login form before sign-in', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#authView')).toBeVisible();
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.getByText('ORBIS', { exact: true })).toBeVisible();
    await expect(page.getByText('HR Intelligence & Operations')).toBeVisible();
  });
});

test.describe('document library upload controls', () => {
  test('upload remains active when the document section is re-rendered', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      window.initializeDocumentsLibrary?.();

      const original = document.getElementById('uploadDocumentBtn');
      if (!original) throw new Error('Upload button is missing');

      original.remove();
      document.body.insertAdjacentHTML(
        'beforeend',
        '<button id="uploadDocumentBtn" type="button" style="position:fixed;inset:20px auto auto 20px;z-index:99999">Upload Document</button>'
      );
    });

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#uploadDocumentBtn').click({ force: true });
    const fileChooser = await fileChooserPromise;

    expect(fileChooser.isMultiple()).toBe(false);
  });
});
