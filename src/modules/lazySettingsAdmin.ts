type SettingsModule = typeof import('./settingsAdmin');

let modulePromise: Promise<SettingsModule> | null = null;

function ensureModule(): Promise<SettingsModule> {
  if (!modulePromise) {
    modulePromise = import('./settingsAdmin').catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

export async function loadSettingsAdmin(force = false): Promise<void> {
  const mod = await ensureModule();
  await mod.loadSettingsAdmin(force);
}

window.loadSettingsAdmin = loadSettingsAdmin;
