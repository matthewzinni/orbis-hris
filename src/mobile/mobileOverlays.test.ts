import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeEl = {
  id: string;
  className: string;
  classList: {
    contains: (name: string) => boolean;
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
    toggle: (name: string, force?: boolean) => void;
  };
  style: {
    setProperty: (name: string, value: string, priority?: string) => void;
    removeProperty: (name: string) => void;
    getPropertyValue: (name: string) => string;
  };
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  attrs: Record<string, string>;
  styleMap: Map<string, string>;
  classes: Set<string>;
};

function createEl(id: string, className = ''): FakeEl {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  const attrs: Record<string, string> = {};
  const styleMap = new Map<string, string>();

  const el: FakeEl = {
    id,
    className,
    classes,
    attrs,
    styleMap,
    classList: {
      contains: (name) => classes.has(name),
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        if (force === true) classes.add(name);
        else if (force === false) classes.delete(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
    },
    style: {
      setProperty: (name, value) => {
        styleMap.set(name, value);
      },
      removeProperty: (name) => {
        styleMap.delete(name);
      },
      getPropertyValue: (name) => styleMap.get(name) || '',
    },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => {
      attrs[name] = value;
    },
    removeAttribute: (name) => {
      delete attrs[name];
      if (name === 'style') styleMap.clear();
    },
  };

  return el;
}

describe('mobileOverlays scroll lock integration', () => {
  let elements: Map<string, FakeEl>;
  let bodyClasses: Set<string>;
  let bodyStyle: { overflow: string; removeProperty: (n: string) => void; setProperty?: never };
  let htmlStyle: { overflow: string; removeProperty: (n: string) => void };

  beforeEach(async () => {
    vi.resetModules();
    elements = new Map();
    bodyClasses = new Set();
    let bodyOverflow = '';
    let htmlOverflow = '';

    bodyStyle = {
      get overflow() {
        return bodyOverflow;
      },
      set overflow(value: string) {
        bodyOverflow = value || '';
      },
      removeProperty: (name: string) => {
        if (name === 'overflow') bodyOverflow = '';
      },
    };
    htmlStyle = {
      get overflow() {
        return htmlOverflow;
      },
      set overflow(value: string) {
        htmlOverflow = value || '';
      },
      removeProperty: (name: string) => {
        if (name === 'overflow') htmlOverflow = '';
      },
    };

    const ids = [
      'drawerBackdrop',
      'employeeDrawer',
      'candidateDrawer',
      'investigationDrawer',
      'operationsIssueDrawer',
      'careEngagementDrawer',
      'janusAccountDrawer',
    ];
    ids.forEach((id) => {
      const el = createEl(id, id === 'drawerBackdrop' ? 'drawer-backdrop' : 'drawer hidden');
      el.setAttribute('aria-hidden', 'true');
      elements.set(id, el);
    });

    vi.doMock('./mobileLayout', () => ({
      isMobileLayout: () => false,
    }));

    vi.stubGlobal('document', {
      body: {
        classList: {
          contains: (name: string) => bodyClasses.has(name),
          add: (...names: string[]) => names.forEach((n) => bodyClasses.add(n)),
          remove: (...names: string[]) => names.forEach((n) => bodyClasses.delete(n)),
          toggle: (name: string, force?: boolean) => {
            if (force === true) bodyClasses.add(name);
            else if (force === false) bodyClasses.delete(name);
            else if (bodyClasses.has(name)) bodyClasses.delete(name);
            else bodyClasses.add(name);
          },
        },
        style: bodyStyle,
      },
      documentElement: { style: htmlStyle },
      getElementById: (id: string) => elements.get(id) || null,
      querySelector: () => null,
    });

    vi.stubGlobal('window', {
      scrollX: 0,
      scrollY: 0,
      pageXOffset: 0,
      pageYOffset: 0,
      scrollTo: vi.fn(),
      closeMobileNavDrawer: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('locks on open and unlocks after open class is cleared first', async () => {
    const { applySharedDrawerOpenStyles, unlockBodyScrollIfIdle } = await import('./mobileOverlays');
    const { getBodyScrollLockDepth, __resetBodyScrollLockForTests } = await import(
      '../utils/bodyScrollLock'
    );

    const drawer = elements.get('employeeDrawer')!;
    const backdrop = elements.get('drawerBackdrop')!;

    applySharedDrawerOpenStyles(drawer as unknown as HTMLElement, backdrop as unknown as HTMLElement, {
      drawerId: 'employeeDrawer',
    });

    expect(bodyClasses.has('orbis-drawer-open')).toBe(true);
    expect(bodyStyle.overflow).toBe('hidden');
    expect(htmlStyle.overflow).toBe('hidden');

    drawer.classList.remove('open');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.removeAttribute('style');
    unlockBodyScrollIfIdle();

    expect(bodyClasses.has('orbis-drawer-open')).toBe(false);
    expect(bodyStyle.overflow).toBe('');
    expect(htmlStyle.overflow).toBe('');
    expect(getBodyScrollLockDepth()).toBe(0);

    __resetBodyScrollLockForTests();
  });

  it('does not unlock while a drawer still has the open class', async () => {
    const { lockBodyScrollForDrawer, unlockBodyScrollIfIdle } = await import('./mobileOverlays');
    const { __resetBodyScrollLockForTests } = await import('../utils/bodyScrollLock');

    lockBodyScrollForDrawer();
    const drawer = elements.get('employeeDrawer')!;
    drawer.classList.add('open');
    drawer.classList.remove('hidden');

    unlockBodyScrollIfIdle();

    expect(bodyClasses.has('orbis-drawer-open')).toBe(true);
    expect(bodyStyle.overflow).toBe('hidden');

    __resetBodyScrollLockForTests();
  });

  it('clears stale modal class when no modal surface is open', async () => {
    const { unlockBodyScrollIfIdle } = await import('./mobileOverlays');
    const { __resetBodyScrollLockForTests } = await import('../utils/bodyScrollLock');

    bodyClasses.add('orbis-drawer-open');
    bodyClasses.add('orbis-modal-open');
    bodyStyle.overflow = 'hidden';
    htmlStyle.overflow = 'hidden';

    unlockBodyScrollIfIdle();

    expect(bodyClasses.has('orbis-drawer-open')).toBe(false);
    expect(bodyClasses.has('orbis-modal-open')).toBe(false);
    expect(bodyStyle.overflow).toBe('');
    expect(htmlStyle.overflow).toBe('');

    __resetBodyScrollLockForTests();
  });
});
