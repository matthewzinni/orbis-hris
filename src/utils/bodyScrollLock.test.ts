import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBodyScrollLockForTests,
  applyBodyScrollLock,
  clearBodyScrollLock,
  clearOrphanedScrollLockStyles,
  getBodyScrollLockDepth,
  releaseBodyScrollLock,
} from './bodyScrollLock';

function createStyleBag() {
  const values = new Map<string, string>();

  return {
    get overflow() {
      return values.get('overflow') || '';
    },
    set overflow(value: string) {
      if (value) values.set('overflow', value);
      else values.delete('overflow');
    },
    get touchAction() {
      return values.get('touch-action') || '';
    },
    set touchAction(value: string) {
      if (value) values.set('touch-action', value);
      else values.delete('touch-action');
    },
    setProperty(name: string, value: string) {
      values.set(name, value);
    },
    removeProperty(name: string) {
      values.delete(name);
    },
    getPropertyValue(name: string) {
      return values.get(name) || '';
    },
  };
}

describe('bodyScrollLock', () => {
  let bodyStyle: ReturnType<typeof createStyleBag>;
  let htmlStyle: ReturnType<typeof createStyleBag>;
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bodyStyle = createStyleBag();
    htmlStyle = createStyleBag();
    scrollTo = vi.fn();

    vi.stubGlobal('document', {
      body: { style: bodyStyle },
      documentElement: { style: htmlStyle },
    });
    vi.stubGlobal('window', {
      scrollX: 0,
      scrollY: 80,
      pageXOffset: 0,
      pageYOffset: 80,
      scrollTo,
    });
  });

  afterEach(() => {
    __resetBodyScrollLockForTests();
    vi.unstubAllGlobals();
  });

  it('locks body and html overflow and increments depth', () => {
    applyBodyScrollLock();

    expect(bodyStyle.overflow).toBe('hidden');
    expect(htmlStyle.overflow).toBe('hidden');
    expect(getBodyScrollLockDepth()).toBe(1);
  });

  it('reference-counts nested locks and restores on final release', () => {
    bodyStyle.overflow = 'auto';

    applyBodyScrollLock();
    applyBodyScrollLock();
    expect(getBodyScrollLockDepth()).toBe(2);

    releaseBodyScrollLock();
    expect(getBodyScrollLockDepth()).toBe(1);
    expect(bodyStyle.overflow).toBe('hidden');

    releaseBodyScrollLock();
    expect(getBodyScrollLockDepth()).toBe(0);
    expect(bodyStyle.overflow).toBe('auto');
    expect(htmlStyle.overflow).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 80);
  });

  it('force-clears nested locks and orphaned styles', () => {
    applyBodyScrollLock();
    applyBodyScrollLock();
    bodyStyle.touchAction = 'none';
    htmlStyle.touchAction = 'none';

    clearBodyScrollLock();

    expect(getBodyScrollLockDepth()).toBe(0);
    expect(bodyStyle.overflow).toBe('');
    expect(htmlStyle.overflow).toBe('');
  });

  it('scrubs orphaned styles without a snapshot', () => {
    bodyStyle.overflow = 'hidden';
    htmlStyle.overflow = 'hidden';
    bodyStyle.touchAction = 'none';

    clearOrphanedScrollLockStyles();

    expect(bodyStyle.overflow).toBe('');
    expect(htmlStyle.overflow).toBe('');
    expect(bodyStyle.touchAction).toBe('');
  });
});
