import { canViewSalaries } from '../services/accessScopes';

type SalaryModule = typeof import('./salary');

let modulePromise: Promise<SalaryModule> | null = null;

function ensureModule(): Promise<SalaryModule> {
  if (!modulePromise) {
    modulePromise = import('./salary').catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

/** Matthew-only: the module is never fetched for anyone else. */
export async function loadSalarySection(force = false): Promise<void> {
  if (!canViewSalaries()) {
    clearSalaryState();
    return;
  }
  try {
    const mod = await ensureModule();
    await mod.loadSalarySection(force);
  } catch (err) {
    console.error('[Salary] Module load failed:', err);
    window.showToast?.('Could not load the Salary page.', 'error');
  }
}

export function clearSalaryState(): void {
  if (modulePromise) {
    void modulePromise.then((mod) => mod.clearSalaryState()).catch(() => undefined);
  }
  const panel = document.getElementById('salaryPanel');
  if (panel) panel.innerHTML = '';
}

window.loadSalarySection = loadSalarySection;
window.clearSalaryState = clearSalaryState;
