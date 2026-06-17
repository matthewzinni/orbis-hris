import { canAccessJanus, canEditJanus } from '../services/access';

type JanusModule = typeof import('./janus');

let janusModulePromise: Promise<JanusModule> | null = null;
let janusModulesLoaded = false;

async function ensureJanusModules(): Promise<JanusModule> {
  if (janusModulePromise) {
    return janusModulePromise;
  }

  janusModulePromise = (async () => {
    try {
      const [janus] = await Promise.all([
        import('./janus'),
        import('./janusAccountDrawer'),
        import('./janusAccountPanels'),
      ]);
      janusModulesLoaded = true;
      return janus;
    } catch (err) {
      janusModulePromise = null;
      throw err;
    }
  })();

  return janusModulePromise;
}

export function applyJanusAccess(): void {
  const visible = canAccessJanus();
  document.querySelectorAll<HTMLElement>('[data-janus-access]').forEach((element) => {
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  const newBtn = document.getElementById('janusNewAccountBtn');
  const logBtn = document.getElementById('janusLogMeetingBtn');
  const importLabel = document.getElementById('janusCopperImportLabel');
  if (newBtn) newBtn.classList.toggle('hidden', !canEditJanus());
  if (logBtn) logBtn.classList.toggle('hidden', !canEditJanus());
  if (importLabel) importLabel.classList.toggle('hidden', !canEditJanus());

  if (typeof window.applyJanusDrawerAccess === 'function') {
    window.applyJanusDrawerAccess();
  }
}

export async function loadJanus(force = false): Promise<void> {
  try {
    const janus = await ensureJanusModules();
    await janus.loadJanus(force);
  } catch (err) {
    console.error('[Janus] Module load failed:', err);
    if (typeof window.showToast === 'function') {
      window.showToast('Could not load Janus module. Try a hard refresh.', 'error');
    }
  }
}

export function isJanusModuleLoaded(): boolean {
  return janusModulesLoaded;
}

window.loadJanus = loadJanus;
window.applyJanusAccess = applyJanusAccess;
