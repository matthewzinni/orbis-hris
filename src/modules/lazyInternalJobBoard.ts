import type { EmployeeDrawerLoadContext } from './employeeDrawerRenderGuard';

type InternalJobBoardModule = typeof import('./internalJobBoard');

let modulePromise: Promise<InternalJobBoardModule> | null = null;

function ensureModule(): Promise<InternalJobBoardModule> {
  if (!modulePromise) {
    modulePromise = import('./internalJobBoard').catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

export async function loadInternalJobBoard(force = false): Promise<void> {
  const mod = await ensureModule();
  await mod.loadInternalJobBoard(force);
}

export function ensureInternalJobBoardLoaded(force = false): void {
  void ensureModule().then((mod) => mod.ensureInternalJobBoardLoaded(force));
}

export function openInternalJobBoardView(
  postingId?: string,
  tab: 'openings' | 'manage' | 'pipeline' = 'openings'
): void {
  void ensureModule().then((mod) => mod.openInternalJobBoardView(postingId, tab));
}

export async function loadEmployeeInternalJobInterests(
  employeeId: string,
  context?: EmployeeDrawerLoadContext
): Promise<void> {
  if (context && !context.isCurrent()) return;
  const mod = await ensureModule();
  if (context && !context.isCurrent()) return;
  await mod.loadEmployeeInternalJobInterests(employeeId, context);
}

window.loadInternalJobBoard = loadInternalJobBoard;
window.ensureInternalJobBoardLoaded = ensureInternalJobBoardLoaded;
window.openInternalJobBoardView = openInternalJobBoardView;
window.loadEmployeeInternalJobInterests = loadEmployeeInternalJobInterests;
