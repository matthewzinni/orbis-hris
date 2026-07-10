/** Breakpoint: mobile-first below this width; desktop shell at and above. */
export const DESKTOP_MIN_WIDTH_PX = 1024;

/** Responsive bands aligned with design spec. */
export const BREAKPOINT_SM_PX = 640;
export const BREAKPOINT_MD_PX = 768;
export const BREAKPOINT_LG_PX = DESKTOP_MIN_WIDTH_PX;

export type LayoutMode = 'mobile' | 'desktop';
export type BreakpointBand = 'xs' | 'sm' | 'md' | 'lg';

const DESKTOP_MQ = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;

export function getBreakpointBand(): BreakpointBand {
  if (typeof window === 'undefined') return 'lg';
  const width = window.innerWidth;
  if (width >= BREAKPOINT_LG_PX) return 'lg';
  if (width >= BREAKPOINT_MD_PX) return 'md';
  if (width >= BREAKPOINT_SM_PX) return 'sm';
  return 'xs';
}

export function applyBreakpointBand(): void {
  document.documentElement.dataset.bp = getBreakpointBand();
}

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
  applyBreakpointBand();

  const media = window.matchMedia(DESKTOP_MQ);
  const onChange = () => {
    const next = media.matches ? 'desktop' : 'mobile';
    const prev = document.body.dataset.layout;
    applyLayoutMode(next);
    applyBreakpointBand();
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

  window.addEventListener('resize', applyBreakpointBand, { passive: true });
}
