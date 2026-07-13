import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('mobileNav more items', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: !String(query).includes('min-width: 1024px'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
      innerWidth: 390,
    });
  });

  it('includes Internal Job Board in More for admins', async () => {
    vi.doMock('../services/access', () => ({
      canAccessAppSection: (sectionId: string) => sectionId !== 'myTasksView',
      isEmployeeUser: () => false,
      isAdminUser: () => true,
      isSupervisorUser: () => false,
    }));

    const { getMobileMoreItems } = await import('./mobileNav');
    const items = getMobileMoreItems();
    expect(items.some((item) => item.sectionId === 'internalJobBoardView')).toBe(true);
    expect(items.find((item) => item.sectionId === 'internalJobBoardView')?.label).toBe(
      'Internal Job Board'
    );
  });
});
