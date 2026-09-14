import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmployeeDrawerRenderer, type EmployeeDrawerLoadContext } from './employeeDrawerRenderGuard';
import { createEmployeeDrawerTabLoader, EMPLOYEE_DRAWER_TABS, type EmployeeDrawerLoaders } from './employeeDrawerTabLoads';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('employee drawer coordination', () => {
  let loaders: EmployeeDrawerLoaders;
  let onError: ReturnType<typeof vi.fn>;
  let canLoad: ReturnType<typeof vi.fn>;
  let tabs: ReturnType<typeof createEmployeeDrawerTabLoader>;

  beforeEach(() => {
    loaders = Object.fromEntries(EMPLOYEE_DRAWER_TABS.map(tab => [tab, vi.fn().mockResolvedValue(undefined)])) as unknown as EmployeeDrawerLoaders;
    onError = vi.fn();
    canLoad = vi.fn().mockReturnValue(true);
    tabs = createEmployeeDrawerTabLoader({ loaders, onError, canLoad, getEmployeeId: () => 'emp-1' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(EMPLOYEE_DRAWER_TABS)('dispatches %s to its typed loader without window', async tab => {
    vi.stubGlobal('window', undefined);
    await tabs.load(tab);
    expect(loaders[tab]).toHaveBeenCalledWith('emp-1', expect.objectContaining({ employeeId: 'emp-1', tab }));
    expect(Object.values(loaders).filter(fn => vi.mocked(fn).mock.calls.length)).toHaveLength(1);
  });

  it('loads once per employee until invalidated', async () => {
    await tabs.load('notes');
    await tabs.load('notes');
    expect(loaders.notes).toHaveBeenCalledTimes(1);
    tabs.invalidate('notes');
    await tabs.load('notes');
    expect(loaders.notes).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent requests and waits for their shared completion', async () => {
    const first = deferred();
    vi.mocked(loaders.notes).mockReturnValueOnce(first.promise);
    const one = tabs.load('notes');
    const two = tabs.load('notes');
    expect(one).toBe(two);
    await Promise.resolve();
    expect(loaders.notes).toHaveBeenCalledTimes(1);
    first.resolve();
    await one;
  });

  it('does not let an older employee completion clear a new pending request', async () => {
    const first = deferred(), second = deferred();
    vi.mocked(loaders.notes).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const one = tabs.load('notes', 'emp-1');
    await Promise.resolve();
    const two = tabs.load('notes', 'emp-2');
    await Promise.resolve();
    first.resolve();
    await one;
    expect(tabs.load('notes', 'emp-2')).toBe(two);
    second.resolve();
    await two;
    await tabs.load('notes', 'emp-2');
    expect(loaders.notes).toHaveBeenCalledTimes(2);
  });

  it('does not let an invalidated request mark the tab loaded or erase its replacement', async () => {
    const first = deferred(), second = deferred();
    vi.mocked(loaders.notes).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const one = tabs.load('notes');
    await Promise.resolve();
    tabs.invalidate('notes');
    const two = tabs.load('notes');
    await Promise.resolve();
    first.resolve();
    await one;
    expect(tabs.load('notes')).toBe(two);
    second.reject(new Error('replacement failed'));
    await two;
    await tabs.load('notes');
    expect(loaders.notes).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not cache completion after closing the drawer', async () => {
    const first = deferred();
    vi.mocked(loaders.notes).mockReturnValueOnce(first.promise);
    const one = tabs.load('notes');
    await Promise.resolve();
    tabs.reset();
    first.resolve();
    await one;
    await tabs.load('notes');
    expect(loaders.notes).toHaveBeenCalledTimes(2);
  });

  it('does not start an obsolete queued request', async () => {
    const one = tabs.load('notes', 'emp-1');
    const two = tabs.load('notes', 'emp-2');
    await Promise.all([one, two]);
    expect(loaders.notes).toHaveBeenCalledExactlyOnceWith('emp-2', expect.objectContaining({ employeeId: 'emp-2', tab: 'notes' }));
  });

  it('retries after synchronous and asynchronous failures', async () => {
    vi.mocked(loaders.notes).mockImplementationOnce(() => { throw new Error('sync'); })
      .mockRejectedValueOnce(new Error('async'));
    await tabs.load('notes');
    await tabs.load('notes');
    await tabs.load('notes');
    expect(onError).toHaveBeenCalledTimes(2);
    expect(loaders.notes).toHaveBeenCalledTimes(3);
  });

  it('checks access before loading and again before starting queued work', async () => {
    canLoad.mockReturnValue(false);
    await tabs.load('reviews');
    expect(loaders.reviews).not.toHaveBeenCalled();
    canLoad.mockReturnValueOnce(true).mockReturnValueOnce(false);
    await tabs.load('reviews');
    expect(loaders.reviews).not.toHaveBeenCalled();
    canLoad.mockReturnValue(true);
    await tabs.load('reviews');
    expect(loaders.reviews).toHaveBeenCalledTimes(1);
  });

  it('ignores unsupported tabs and empty employee context', async () => {
    await tabs.load('toString');
    const empty = createEmployeeDrawerTabLoader({ loaders, onError, canLoad, getEmployeeId: () => '' });
    await empty.load('notes');
    for (const loader of Object.values(loaders)) expect(loader).not.toHaveBeenCalled();
  });

  it('passes a typed request context and aborts the previous signal on employee switch', async () => {
    const first = deferred();
    const signals: AbortSignal[] = [];
    vi.mocked(loaders.notes).mockImplementation(async (_id: string, context?: EmployeeDrawerLoadContext) => {
      if (context) signals.push(context.signal);
      await first.promise;
    });
    const one = tabs.load('notes', 'emp-1');
    await Promise.resolve();
    const two = tabs.load('notes', 'emp-2');
    await Promise.resolve();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    first.resolve();
    await Promise.all([one, two]);
  });

  it('does not let a stale employee request write over the current panel', async () => {
    const first = deferred();
    const panel = { innerHTML: '' };
    vi.mocked(loaders.notes).mockImplementation(async (id: string, context?: EmployeeDrawerLoadContext) => {
      const render = createEmployeeDrawerRenderer(context, id);
      render.write(panel as HTMLElement, `loading-${id}`);
      if (id === 'emp-1') await first.promise;
      render.write(panel as HTMLElement, `done-${id}`);
    });
    const one = tabs.load('notes', 'emp-1');
    await Promise.resolve();
    const two = tabs.load('notes', 'emp-2');
    await Promise.resolve();
    first.resolve();
    await Promise.all([one, two]);
    expect(panel.innerHTML).toBe('done-emp-2');
  });

  it('does not paint a stale rejection after reset or invalidation', async () => {
    const first = deferred();
    const panel = { innerHTML: '' };
    vi.mocked(loaders.notes)
      .mockImplementationOnce(async (id: string, context?: EmployeeDrawerLoadContext) => {
        const render = createEmployeeDrawerRenderer(context, id);
        render.write(panel as HTMLElement, 'loading-old');
        await first.promise;
        render.write(panel as HTMLElement, '<div class="empty">stale error</div>');
        throw new Error('stale failure');
      })
      .mockImplementationOnce(async (id: string, context?: EmployeeDrawerLoadContext) => {
        createEmployeeDrawerRenderer(context, id).write(panel as HTMLElement, 'current');
      });
    const one = tabs.load('notes', 'emp-1');
    await Promise.resolve();
    tabs.reset();
    const two = tabs.load('notes', 'emp-1');
    first.reject(new Error('stale failure'));
    await Promise.allSettled([one, two]);
    expect(panel.innerHTML).toBe('current');
    expect(onError).not.toHaveBeenCalled();
  });
});
