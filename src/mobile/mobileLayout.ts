/** Breakpoint: mobile-first below this width; desktop shell at and above. */
export const DESKTOP_MIN_WIDTH_PX = 1024;

export type LayoutMode = 'mobile' | 'desktop';

const DESKTOP_MQ = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;

export function getLayoutMode(): LayoutMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'desktop';
  }
  return window.matchMedia(DESKTOP_MQ).matches ? 'desktop' : 'mobile';
}

export function applyLayoutMode(mode: LayoutMode = getLayoutMode()): void {
  document.documentElement.dataset.layout = mode;
  document.body.dataset.layout = mode;
}

export function isMobileLayout(): boolean {
  return getLayoutMode() === 'mobile';
}

export function initMobileLayout(): void {
  applyLayoutMode();

  const media = window.matchMedia(DESKTOP_MQ);
  const onChange = () => {
    const next = media.matches ? 'desktop' : 'mobile';
    const prev = document.body.dataset.layout;
    applyLayoutMode(next);
    if (prev !== next) {
      window.dispatchEvent(
        new CustomEvent('orbis:layout-change', { detail: { layout: next } })
      );
    }
  };

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
  } else {
    media.addListener(onChange);
  }
}

initMobileLayout();
