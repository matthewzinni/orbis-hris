/**
 * Drawer loading coordination. UI implementations and selected-employee state are
 * supplied by the application layer, never discovered through browser globals.
 */
import {
  type EmployeeDrawerLoadContext,
  isEmployeeDrawerLoadAbort,
} from './employeeDrawerRenderGuard';

export const EMPLOYEE_DRAWER_TABS = [
  'profile', 'notes', 'discipline', 'incidents', 'meetings', 'stay-interviews',
  'reviews', 'emergency', 'onboarding', 'offboarding', 'time-off', 'documents',
  'history', 'care-support', 'employee',
] as const;
export type EmployeeDrawerTab = typeof EMPLOYEE_DRAWER_TABS[number];
export type EmployeeDrawerLoader = (
  employeeId: string,
  context?: EmployeeDrawerLoadContext
) => void | Promise<void>;
export type EmployeeDrawerLoaders = Readonly<Record<EmployeeDrawerTab, EmployeeDrawerLoader>>;
export type EmployeeDrawerDependencies = {
  loaders: EmployeeDrawerLoaders;
  getEmployeeId: () => string;
  canLoad: (tab: EmployeeDrawerTab, employeeId: string) => boolean;
  onError: (error: unknown, tab: EmployeeDrawerTab, employeeId: string) => void;
};

type PendingRequest = {
  promise: Promise<void>;
  controller: AbortController;
};

export function createEmployeeDrawerTabLoader(dependencies: EmployeeDrawerDependencies) {
  const loaders = { ...dependencies.loaders };
  let selectedEmployeeId: string | null = null;
  const loaded = new Set<EmployeeDrawerTab>();
  // Request identity protects both employee switches and invalidation during a load.
  const pending = new Map<EmployeeDrawerTab, PendingRequest>();

  function abortPending(tab?: EmployeeDrawerTab): void {
    if (tab) {
      pending.get(tab)?.controller.abort();
      pending.delete(tab);
      return;
    }
    for (const request of pending.values()) request.controller.abort();
    pending.clear();
  }

  function reset(): void {
    abortPending();
    selectedEmployeeId = null;
    loaded.clear();
  }

  function invalidate(tab: string): void {
    loaded.delete(tab as EmployeeDrawerTab);
    abortPending(tab as EmployeeDrawerTab);
  }

  function load(tabName: string, employeeId?: string): Promise<void> {
    const id = String(employeeId || dependencies.getEmployeeId() || '').trim();
    if (!id) return Promise.resolve();
    if (selectedEmployeeId !== id) {
      reset();
      selectedEmployeeId = id;
    }
    if (!EMPLOYEE_DRAWER_TABS.includes(tabName as EmployeeDrawerTab)) return Promise.resolve();
    const tab = tabName as EmployeeDrawerTab;
    if (!dependencies.canLoad(tab, id)) return Promise.resolve();
    if (loaded.has(tab)) return Promise.resolve();
    const existing = pending.get(tab);
    if (existing) return existing.promise;

    const controller = new AbortController();
    const request: PendingRequest = { promise: Promise.resolve(), controller };
    const isCurrent = () =>
      selectedEmployeeId === id && pending.get(tab) === request && !controller.signal.aborted;
    const context: EmployeeDrawerLoadContext = {
      employeeId: id,
      tab,
      signal: controller.signal,
      isCurrent,
    };

    request.promise = Promise.resolve()
      .then(() => {
        // A drawer can be closed/switched before this queued callback even starts.
        if (!isCurrent() || !dependencies.canLoad(tab, id)) return false;
        return Promise.resolve(loaders[tab](id, context)).then(() => true);
      })
      .then((didLoad) => {
        if (didLoad && isCurrent()) loaded.add(tab);
      })
      .catch((error) => {
        if (isEmployeeDrawerLoadAbort(error) || !isCurrent()) return;
        dependencies.onError(error, tab, id);
      })
      .finally(() => {
        if (isCurrent()) pending.delete(tab);
      });
    pending.set(tab, request);
    return request.promise;
  }

  return { load, reset, invalidate };
}

let applicationLoader: ReturnType<typeof createEmployeeDrawerTabLoader> | undefined;

export function configureEmployeeDrawerTabLoads(dependencies: EmployeeDrawerDependencies): void {
  applicationLoader?.reset();
  applicationLoader = createEmployeeDrawerTabLoader(dependencies);
}

function getApplicationLoader() {
  if (!applicationLoader) throw new Error('Employee drawer loaders are not configured.');
  return applicationLoader;
}

export function resetEmployeeDrawerTabLoadState(): void {
  getApplicationLoader().reset();
}

export function invalidateEmployeeDrawerTab(tabName: string): void {
  getApplicationLoader().invalidate(tabName);
}

export function loadEmployeeDrawerTab(tabName: string, employeeId?: string): Promise<void> {
  return getApplicationLoader().load(tabName, employeeId);
}
