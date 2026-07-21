import { expect, test, devices } from '@playwright/test';

const iphone = devices['iPhone 13'];
const pixel = devices['Pixel 5'];

const MODULE_DRAWERS = [
  'employeeDrawer',
  'candidateDrawer',
  'investigationDrawer',
  'operationsIssueDrawer',
  'careEngagementDrawer',
  'janusAccountDrawer',
] as const;

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

async function openDrawerFixture(
  page: import('@playwright/test').Page,
  drawerId: (typeof MODULE_DRAWERS)[number]
) {
  await page.evaluate((id) => {
    document.body.classList.remove('auth-only');
    document.body.classList.add('authenticated');
    document.body.setAttribute('data-layout', 'mobile');
    document.documentElement.dataset.layout = 'mobile';

    const appView = document.getElementById('appView');
    if (appView) {
      appView.classList.remove('hidden');
      appView.style.display = '';
    }
    document.getElementById('authView')?.classList.add('hidden');

    document.querySelectorAll('.drawer.open').forEach((drawer) => {
      drawer.classList.remove('open');
      drawer.classList.add('hidden');
      drawer.setAttribute('aria-hidden', 'true');
    });

    const drawer = document.getElementById(id);
    if (!drawer) return;
    drawer.classList.remove('hidden');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.getElementById('drawerBackdrop')?.classList.add('open');
    document.body.classList.add('orbis-drawer-open');
    window.refreshMobileDrawerForms?.();
  }, drawerId);
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
          htmlOverflow: document.documentElement.style.overflow,
          backdropOpen: document.getElementById('drawerBackdrop')?.classList.contains('open'),
        }))
      )
      .toEqual({
        drawerOpen: false,
        overflow: '',
        htmlOverflow: '',
        backdropOpen: false,
      });
  });

  for (const viewport of [
    { name: '320px', width: 320, height: 640 },
    { name: '390px', width: 390, height: 844 },
  ]) {
    test(`module drawers open fullscreen without page overflow @ ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      for (const drawerId of MODULE_DRAWERS) {
        await expect(page.locator(`#${drawerId}`)).toHaveCount(1);
        await openDrawerFixture(page, drawerId);

        await expect(page.locator(`#${drawerId}.open`)).toHaveCount(1);
        await assertNoHorizontalOverflow(page);

        const metrics = await page.evaluate((id) => {
          const drawer = document.getElementById(id);
          if (!drawer) return null;
          const rect = drawer.getBoundingClientRect();
          const styles = window.getComputedStyle(drawer);
          return {
            width: rect.width,
            height: rect.height,
            display: styles.display,
            visibility: styles.visibility,
          };
        }, drawerId);

        expect(metrics).toBeTruthy();
        expect(metrics!.display).not.toBe('none');
        expect(metrics!.visibility).not.toBe('hidden');
        expect(metrics!.width).toBeGreaterThanOrEqual(viewport.width - 2);
      }
    });
  }

  test('investigation and ops drawers get mobile footer treatment', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await openDrawerFixture(page, 'investigationDrawer');
    await expect(page.locator('#investigationDrawer .orbis-mobile-drawer-footer')).toHaveCount(1);

    await openDrawerFixture(page, 'operationsIssueDrawer');
    await expect(page.locator('#operationsIssueDrawer .orbis-mobile-drawer-footer')).toHaveCount(1);

    await openDrawerFixture(page, 'careEngagementDrawer');
    await expect(page.locator('#careEngagementDrawer .orbis-mobile-drawer-footer')).toHaveCount(1);
  });

  test('candidate and janus drawers pin a save footer outside the scroll body', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await openDrawerFixture(page, 'candidateDrawer');
    await expect(
      page.locator('#candidateDrawer > .orbis-mobile-pinned-save-footer')
    ).toHaveCount(1);

    await openDrawerFixture(page, 'janusAccountDrawer');
    await expect(
      page.locator('#janusAccountDrawer > .orbis-mobile-pinned-save-footer')
    ).toHaveCount(1);
  });

  test('investigation multi-select becomes checkbox picker on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.evaluate(() => {
      const targeted = document.getElementById(
        'invTargetedEmployeesInput'
      ) as HTMLSelectElement | null;
      const focus = document.getElementById('invFocusEmployeesInput') as HTMLSelectElement | null;
      if (targeted) {
        targeted.innerHTML =
          '<option value="e1">Ada Lovelace</option><option value="e2">Grace Hopper</option>';
      }
      if (focus) {
        focus.innerHTML =
          '<option value="e1">Ada Lovelace</option><option value="e3">Alan Turing</option>';
      }
    });

    await openDrawerFixture(page, 'investigationDrawer');

    await expect(page.locator('#investigationDrawer .orbis-mobile-multi-picker')).toHaveCount(2);
    await expect(
      page.locator('#invTargetedEmployeesInput.orbis-mobile-native-hidden')
    ).toHaveCount(1);

    const selected = await page.evaluate(() => {
      const input = document.querySelector(
        '#investigationDrawer .orbis-mobile-multi-picker input[value="e1"]'
      ) as HTMLInputElement | null;
      if (!input) return [];
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const select = document.getElementById(
        'invTargetedEmployeesInput'
      ) as HTMLSelectElement | null;
      return Array.from(select?.selectedOptions || []).map((option) => option.value);
    });
    expect(selected).toEqual(['e1']);
  });
});
