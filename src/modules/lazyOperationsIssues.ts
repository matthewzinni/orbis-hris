import { canAccessOperationsCenter } from '../services/operationsAccess';

type OperationsModule = typeof import('./operationsIssues');

let modulePromise: Promise<OperationsModule> | null = null;

function ensureOperationsModule(): Promise<OperationsModule> {
  if (!modulePromise) {
    modulePromise = import('./operationsIssues').catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

function reportFailure(err: unknown): void {
  console.error('[Operations] Module load failed:', err);
  window.showToast?.('Could not load the Operations module.', 'error');
}

export function applyOperationsCenterAccess(): void {
  const allowed = canAccessOperationsCenter();
  document.querySelectorAll<HTMLElement>('[data-operations-access]').forEach((element) => {
    element.classList.toggle('hidden', !allowed);
  });
  document.getElementById('operationsCenterTop')?.classList.toggle('hidden', !allowed);
}

export async function loadOperationsIssues(): Promise<void> {
  const mod = await ensureOperationsModule();
  await mod.loadOperationsIssues();
}

export function ensureOperationsIssuesLoaded(force = false): void {
  void ensureOperationsModule()
    .then((mod) => mod.ensureOperationsIssuesLoaded(force))
    .catch(reportFailure);
}

export function exportOperationsIssuesCsv(): void {
  void ensureOperationsModule().then((mod) => mod.exportOperationsIssuesCsv()).catch(reportFailure);
}

export function openOperationsView(): void {
  void ensureOperationsModule().then((mod) => mod.openOperationsView()).catch(reportFailure);
}

export function openNewOperationsIssueForm(): void {
  void ensureOperationsModule().then((mod) => mod.openNewOperationsIssueForm()).catch(reportFailure);
}

export function openOperationsIssueDrawer(issueId: string): Promise<void> {
  return ensureOperationsModule().then((mod) => mod.openOperationsIssueDrawer(issueId));
}

export function closeOperationsIssueDrawer(): void {
  void ensureOperationsModule().then((mod) => mod.closeOperationsIssueDrawer()).catch(reportFailure);
}

export async function saveOperationsIssueRecord(): Promise<void> {
  const mod = await ensureOperationsModule();
  await mod.saveOperationsIssueRecord();
}

export async function deleteOperationsIssueRecord(): Promise<void> {
  const mod = await ensureOperationsModule();
  await mod.deleteOperationsIssueRecord();
}

export async function deleteOperationsIssueById(issueId: string): Promise<void> {
  const mod = await ensureOperationsModule();
  await mod.deleteOperationsIssueById(issueId);
}

export function cancelOperationsIssueEdit(): void {
  void ensureOperationsModule().then((mod) => mod.cancelOperationsIssueEdit()).catch(reportFailure);
}

export function isOperationsIssueDrawerOpen(): boolean {
  return Boolean(document.getElementById('operationsIssueDrawer')?.classList.contains('open'));
}
