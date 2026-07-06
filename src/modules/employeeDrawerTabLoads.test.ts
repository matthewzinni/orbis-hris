import { beforeEach, describe, expect, it, vi } from 'vitest';

type DrawerTabLoads = typeof import('./employeeDrawerTabLoads');

describe.sequential('employeeDrawerTabLoads', () => {
  let loadEmployeeNotes: ReturnType<typeof vi.fn>;
  let tabLoads: DrawerTabLoads;
  const drawerWindow: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.resetModules();
    loadEmployeeNotes = vi.fn().mockResolvedValue(undefined);
    drawerWindow.currentEmployee = { dbId: 'emp-1' };
    drawerWindow.loadEmployeeNotes = loadEmployeeNotes;

    vi.stubGlobal('window', drawerWindow);

    tabLoads = await import('./employeeDrawerTabLoads');
    tabLoads.resetEmployeeDrawerTabLoadState();
  });

  it('loads a tab once per employee until invalidated', async () => {
    tabLoads.loadEmployeeDrawerTab('notes', 'emp-1');
    await vi.waitFor(() => expect(loadEmployeeNotes).toHaveBeenCalledTimes(1));

    tabLoads.loadEmployeeDrawerTab('notes', 'emp-1');
    expect(loadEmployeeNotes).toHaveBeenCalledTimes(1);

    tabLoads.invalidateEmployeeDrawerTab('notes');
    tabLoads.loadEmployeeDrawerTab('notes', 'emp-1');
    await vi.waitFor(() => expect(loadEmployeeNotes).toHaveBeenCalledTimes(2));
  });

  it('ignores stale tab completion after employee switch', async () => {
    let resolveFirst: (() => void) | undefined;
    const loader = vi.fn((id: string) => {
      if (id === 'emp-1') {
        return new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve();
    });
    drawerWindow.loadEmployeeNotes = loader;

    tabLoads.loadEmployeeDrawerTab('notes', 'emp-1');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));

    tabLoads.loadEmployeeDrawerTab('notes', 'emp-2');
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    resolveFirst?.();
    await Promise.resolve();

    loader.mockClear();
    tabLoads.loadEmployeeDrawerTab('notes', 'emp-2');
    expect(loader).not.toHaveBeenCalled();
  });
});
