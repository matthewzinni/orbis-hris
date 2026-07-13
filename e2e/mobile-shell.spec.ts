import { expect, test, devices } from '@playwright/test';

const iphone = devices['iPhone 13'];
const pixel = devices['Pixel 5'];

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe('mobile auth shell', () => {
  for (const viewport of [
    { name: '320px', width: 320, height: 640 },
    { name: 'iPhone-ish', ...iphone.viewport! },
    { name: 'Pixel-ish', ...pixel.viewport! },
  ]) {
    test(`login fits without horizontal overflow @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      await expect(page.locator('#authView')).toBeVisible();
      await expect(page.locator('#loginEmail')).toBeVisible();
      await expect(page.locator('#loginPassword')).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });
  }
});

test.describe('mobile shell chrome (unauthenticated DOM)', () => {
  test('mobile chrome markup exists and drawers start closed', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('#orbisMobileTabBar')).toHaveCount(1);
    await expect(page.locator('#employeeDrawer')).toHaveCount(1);
    await expect(page.locator('#candidateDrawer')).toHaveCount(1);
    await expect(page.locator('#drawerBackdrop')).toHaveCount(1);

    await expect(page.locator('#employeeDrawer.open')).toHaveCount(0);
    await expect(page.locator('#candidateDrawer.open')).toHaveCount(0);
    await expect(page.locator('#drawerBackdrop.open')).toHaveCount(0);
    await expect(page.locator('body.orbis-drawer-open')).toHaveCount(0);
  });

  test('closeActiveDrawer helper clears idle scroll lock', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.evaluate(() => {
      document.body.classList.add('orbis-drawer-open');
      document.body.style.overflow = 'hidden';
      document.getElementById('drawerBackdrop')?.classList.add('open');
    });

    await page.evaluate(() => {
      if (typeof window.unlockBodyScrollIfIdle === 'function') {
        window.unlockBodyScrollIfIdle();
      }
    });

    await expect
      .poll(async () =>
        page.evaluate(() => ({
          drawerOpen: document.body.classList.contains('orbis-drawer-open'),
          overflow: document.body.style.overflow,
          backdropOpen: document.getElementById('drawerBackdrop')?.classList.contains('open'),
        }))
      )
      .toEqual({
        drawerOpen: false,
        overflow: '',
        backdropOpen: true,
      });
  });
});
