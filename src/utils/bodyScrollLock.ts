/**
 * Central body/html scroll lock for drawers, sheets, and modals.
 *
 * Prefer applyBodyScrollLock() on open and clearBodyScrollLock() (or
 * unlockBodyScrollIfIdle via mobileOverlays) on every close path so styles
 * cannot linger after unmount or early returns.
 */

type ScrollLockSnapshot = {
  scrollX: number;
  scrollY: number;
  bodyOverflow: string;
  htmlOverflow: string;
  bodyTouchAction: string;
  htmlTouchAction: string;
};

let lockDepth = 0;
let snapshot: ScrollLockSnapshot | null = null;

function captureSnapshot(): ScrollLockSnapshot {
  return {
    scrollX: window.scrollX || window.pageXOffset || 0,
    scrollY: window.scrollY || window.pageYOffset || 0,
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    bodyTouchAction: document.body.style.touchAction,
    htmlTouchAction: document.documentElement.style.touchAction,
  };
}

function restoreInline(
  el: HTMLElement,
  property: string,
  previous: string
): void {
  if (previous) {
    el.style.setProperty(property, previous);
  } else {
    el.style.removeProperty(property);
  }
}

/** Apply scroll lock. Nested opens are reference-counted. */
export function applyBodyScrollLock(): void {
  if (typeof document === 'undefined') return;

  if (lockDepth === 0) {
    snapshot = captureSnapshot();
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  lockDepth += 1;
}

/**
 * Release one nested lock. When the last lock releases, restores the prior
 * overflow/touch-action and scroll position.
 */
export function releaseBodyScrollLock(): void {
  if (typeof document === 'undefined') return;

  if (lockDepth <= 1) {
    clearBodyScrollLock();
    return;
  }

  lockDepth -= 1;
}

/**
 * Force-clear every scroll lock and orphaned overflow styles on body/html.
 * Safe to call on unexpected unmount or when overlay state says nothing is open.
 */
export function clearBodyScrollLock(): void {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const html = document.documentElement;
  const snap = snapshot;

  lockDepth = 0;
  snapshot = null;

  if (snap) {
    restoreInline(body, 'overflow', snap.bodyOverflow);
    restoreInline(html, 'overflow', snap.htmlOverflow);
    restoreInline(body, 'touch-action', snap.bodyTouchAction);
    restoreInline(html, 'touch-action', snap.htmlTouchAction);
    window.scrollTo(snap.scrollX, snap.scrollY);
    return;
  }

  clearOrphanedScrollLockStyles();
}

/** Scrub leftover lock-related inline styles without requiring a snapshot. */
export function clearOrphanedScrollLockStyles(): void {
  if (typeof document === 'undefined') return;

  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('touch-action');
  document.documentElement.style.removeProperty('touch-action');
}

export function getBodyScrollLockDepth(): number {
  return lockDepth;
}

/** Test-only reset. */
export function __resetBodyScrollLockForTests(): void {
  lockDepth = 0;
  snapshot = null;
  if (typeof document !== 'undefined') {
    clearOrphanedScrollLockStyles();
  }
}
