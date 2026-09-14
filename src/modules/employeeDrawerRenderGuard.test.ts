import { describe, expect, it } from 'vitest';
import {
  applyEmployeeDrawerAbortSignal,
  createEmployeeDrawerRenderer,
  isEmployeeDrawerLoadAbort,
  isEmployeeDrawerLoadCurrent,
  type EmployeeDrawerLoadContext,
} from './employeeDrawerRenderGuard';

function liveContext(employeeId = 'emp-a'): EmployeeDrawerLoadContext & { abort(): void } {
  const controller = new AbortController();
  return {
    employeeId,
    tab: 'notes',
    signal: controller.signal,
    isCurrent: () => !controller.signal.aborted,
    abort() {
      controller.abort();
    },
  };
}

describe('employee drawer render guard', () => {
  it('lets a current request write loading, success, empty, and error HTML', () => {
    const context = liveContext();
    const render = createEmployeeDrawerRenderer(context, 'emp-a');
    const panel = { innerHTML: '' };

    expect(render.write(panel as HTMLElement, '<div>loading</div>')).toBe(true);
    expect(panel.innerHTML).toBe('<div>loading</div>');
    expect(render.write(panel as HTMLElement, '<div>success</div>')).toBe(true);
    expect(render.write(panel as HTMLElement, '<div class="empty">none</div>')).toBe(true);
    expect(render.write(panel as HTMLElement, '<div class="empty">error</div>')).toBe(true);
    expect(panel.innerHTML).toBe('<div class="empty">error</div>');
  });

  it('ignores Employee A finishing after Employee B is selected', () => {
    const contextA = liveContext('emp-a');
    const panel = { innerHTML: 'b-loading' };
    contextA.abort();
    const renderA = createEmployeeDrawerRenderer(contextA, 'emp-a');
    expect(renderA.write(panel as HTMLElement, '<div>a-done</div>')).toBe(false);
    expect(panel.innerHTML).toBe('b-loading');
  });

  it('ignores an invalidated request after its replacement starts', () => {
    const context = liveContext();
    const panel = { innerHTML: 'replacement' };
    context.abort();
    expect(createEmployeeDrawerRenderer(context, 'emp-a').write(panel as HTMLElement, 'stale')).toBe(false);
    expect(panel.innerHTML).toBe('replacement');
  });

  it('ignores writes after the drawer is closed or reset', () => {
    const context = liveContext();
    const render = createEmployeeDrawerRenderer(context, 'emp-a');
    const panel = { innerHTML: '' };
    render.write(panel as HTMLElement, 'loading');
    context.abort();
    expect(render.write(panel as HTMLElement, 'done')).toBe(false);
    expect(panel.innerHTML).toBe('loading');
  });

  it('does not replace the current panel with a stale rejection error', () => {
    const context = liveContext();
    const panel = { innerHTML: 'current' };
    context.abort();
    const error = new DOMException('Aborted', 'AbortError');
    expect(isEmployeeDrawerLoadAbort(error)).toBe(true);
    expect(createEmployeeDrawerRenderer(context, 'emp-a').write(panel as HTMLElement, '<div>error</div>')).toBe(false);
    expect(panel.innerHTML).toBe('current');
  });

  it('treats a missing context as a legacy caller that may still render', () => {
    expect(isEmployeeDrawerLoadCurrent(undefined, 'emp-a')).toBe(true);
    const panel = { innerHTML: '' };
    expect(createEmployeeDrawerRenderer(undefined, 'emp-a').write(panel as HTMLElement, 'ok')).toBe(true);
  });

  it('applies abort signals only when the query supports them', () => {
    const applied: AbortSignal[] = [];
    const query = {
      abortSignal(signal: AbortSignal) {
        applied.push(signal);
        return this;
      },
    };
    const signal = new AbortController().signal;
    expect(applyEmployeeDrawerAbortSignal(query, signal)).toBe(query);
    expect(applied).toEqual([signal]);
    expect(applyEmployeeDrawerAbortSignal({ select: true }, signal)).toEqual({ select: true });
  });
});
