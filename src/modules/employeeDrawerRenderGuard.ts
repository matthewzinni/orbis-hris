export type EmployeeDrawerLoadContext = {
  readonly employeeId: string;
  readonly tab: string;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
};

export type EmployeeDrawerRenderer = {
  isCurrent(): boolean;
  write(target: HTMLElement | null | undefined, html: string): boolean;
  mutate(target: HTMLElement | null | undefined, update: (element: HTMLElement) => void): boolean;
};

export function isEmployeeDrawerLoadCurrent(
  context: EmployeeDrawerLoadContext | undefined,
  employeeId?: string
): boolean {
  if (!context) return true;
  if (context.signal.aborted) return false;
  if (!context.isCurrent()) return false;
  if (employeeId && context.employeeId !== employeeId) return false;
  return true;
}

export function isEmployeeDrawerLoadAbort(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const candidate = error as { name?: string; code?: string };
  return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR';
}

export function applyEmployeeDrawerAbortSignal<T>(query: T, signal?: AbortSignal): T {
  if (!signal || !query || typeof query !== 'object') return query;
  const withAbort = query as T & { abortSignal?: (signal: AbortSignal) => T };
  if (typeof withAbort.abortSignal !== 'function') return query;
  return withAbort.abortSignal(signal);
}

export function createEmployeeDrawerRenderer(
  context: EmployeeDrawerLoadContext | undefined,
  employeeId: string
): EmployeeDrawerRenderer {
  const isCurrent = () => isEmployeeDrawerLoadCurrent(context, employeeId);
  return {
    isCurrent,
    write(target, html) {
      if (!target || !isCurrent()) return false;
      target.innerHTML = html;
      return true;
    },
    mutate(target, update) {
      if (!target || !isCurrent()) return false;
      update(target);
      return true;
    },
  };
}
