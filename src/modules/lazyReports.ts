type ReportsModule = typeof import('./reports');

let modulePromise: Promise<ReportsModule> | null = null;

function ensureModule(): Promise<ReportsModule> {
  if (!modulePromise) {
    modulePromise = import('./reports').catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

export async function loadReportsSection(force = false): Promise<void> {
  const mod = await ensureModule();
  await mod.loadReportsSection(force);
}

window.loadReportsSection = loadReportsSection;
