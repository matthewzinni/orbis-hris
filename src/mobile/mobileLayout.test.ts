import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  BREAKPOINT_LG_PX,
  BREAKPOINT_MD_PX,
  BREAKPOINT_SM_PX,
  getBreakpointBand,
} from './mobileLayout';

describe('mobileLayout breakpoints', () => {
  let originalInnerWidth = 1024;

  beforeEach(() => {
    originalInnerWidth =
      typeof window !== 'undefined' && typeof window.innerWidth === 'number'
        ? window.innerWidth
        : 1024;

    vi.stubGlobal('window', {
      innerWidth: originalInnerWidth,
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        addListener: () => undefined,
      }),
      addEventListener: () => undefined,
    });

    vi.stubGlobal('document', {
      documentElement: { dataset: {} as DOMStringMap },
      body: { dataset: {} as DOMStringMap },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports aligned breakpoint constants', () => {
    expect(BREAKPOINT_SM_PX).toBe(640);
    expect(BREAKPOINT_MD_PX).toBe(768);
    expect(BREAKPOINT_LG_PX).toBe(1024);
  });

  it('maps viewport widths to breakpoint bands', () => {
    const setWidth = (width: number) => {
      vi.stubGlobal('window', {
        innerWidth: width,
        matchMedia: () => ({
          matches: width >= 1024,
          addEventListener: () => undefined,
          addListener: () => undefined,
        }),
        addEventListener: () => undefined,
      });
    };

    setWidth(320);
    expect(getBreakpointBand()).toBe('xs');

    setWidth(640);
    expect(getBreakpointBand()).toBe('sm');

    setWidth(768);
    expect(getBreakpointBand()).toBe('md');

    setWidth(1440);
    expect(getBreakpointBand()).toBe('lg');
  });
});
