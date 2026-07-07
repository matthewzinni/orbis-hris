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
