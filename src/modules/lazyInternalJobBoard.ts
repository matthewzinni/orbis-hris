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

export async function loadEmployeeInternalJobInterests(employeeId: string): Promise<void> {
  const mod = await ensureModule();
  await mod.loadEmployeeInternalJobInterests(employeeId);
}

window.loadInternalJobBoard = loadInternalJobBoard;
window.ensureInternalJobBoardLoaded = ensureInternalJobBoardLoaded;
window.openInternalJobBoardView = openInternalJobBoardView;
window.loadEmployeeInternalJobInterests = loadEmployeeInternalJobInterests;
