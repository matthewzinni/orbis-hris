import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const helpers = vi.hoisted(() => ({
  safeGet: vi.fn(),
  showToast: vi.fn(),
}));

const queryResult = vi.hoisted(() => ({
  data: [] as unknown[],
  error: null as { message?: string } | null,
}));

const query = vi.hoisted(() => {
  const q = {
    select: vi.fn(() => q),
    in: vi.fn(() => q),
    order: vi.fn(() => q),
    abortSignal: vi.fn(() => q),
    then(resolve: (value: typeof queryResult) => unknown) {
      return Promise.resolve(queryResult).then(resolve);
    },
  };
  return q;
});

vi.mock('./supabaseClient', () => ({
  supabaseClient: { from: () => query },
}));

vi.mock('../utils/helpers', () => helpers);

vi.mock('../ui/confirmModal', () => ({
  showOrbisConfirm: vi.fn(),
}));

import { loadEmployeeRecordHistory } from './employeeRecordCrud';
import type { EmployeeDrawerLoadContext } from '../modules/employeeDrawerRenderGuard';

function contextFor(employeeId: string, live = true): EmployeeDrawerLoadContext {
  const controller = new AbortController();
  if (!live) controller.abort();
  return {
    employeeId,
    tab: 'notes',
    signal: controller.signal,
    isCurrent: () => live && !controller.signal.aborted,
  };
}

describe('employee record history render guard', () => {
  const panel = { innerHTML: '' };

  beforeEach(() => {
    panel.innerHTML = '';
    queryResult.data = [];
    queryResult.error = null;
    helpers.safeGet.mockReturnValue(panel);
    helpers.showToast.mockReset();
    vi.stubGlobal('window', { currentEmployee: { dbId: 'emp-a' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders loading then empty, success, and error for a current request', async () => {
    await loadEmployeeRecordHistory({
      historyContainerId: 'notesHistory',
      table: 'employee_notes',
      employeeId: 'emp-a',
      logPrefix: 'Notes',
      emptyMessage: 'No notes.',
      renderRows: () => '<div>unused</div>',
      bindActions: () => undefined,
      loadContext: contextFor('emp-a'),
    });
    expect(panel.innerHTML).toContain('No notes.');

    queryResult.data = [{ id: '1', created_at: '2026-01-01' }];
    await loadEmployeeRecordHistory({
      historyContainerId: 'notesHistory',
      table: 'employee_notes',
      employeeId: 'emp-a',
      logPrefix: 'Notes',
      renderRows: () => '<div>success</div>',
      bindActions: () => undefined,
      loadContext: contextFor('emp-a'),
    });
    expect(panel.innerHTML).toBe('<div>success</div>');

    queryResult.data = [];
    queryResult.error = { message: 'denied' };
    await loadEmployeeRecordHistory({
      historyContainerId: 'notesHistory',
      table: 'employee_notes',
      employeeId: 'emp-a',
      logPrefix: 'Notes',
      errorMessage: 'Could not load notes.',
      renderRows: () => '<div>success</div>',
      bindActions: () => undefined,
      loadContext: contextFor('emp-a'),
    });
    expect(panel.innerHTML).toContain('Could not load notes.');
    expect(helpers.showToast).toHaveBeenCalled();
  });

  it('does not write a stale employee result or error', async () => {
    panel.innerHTML = 'current-b';
    queryResult.data = [{ id: '1', created_at: '2026-01-01' }];
    await loadEmployeeRecordHistory({
      historyContainerId: 'notesHistory',
      table: 'employee_notes',
      employeeId: 'emp-a',
      logPrefix: 'Notes',
      errorMessage: 'stale error',
      renderRows: () => '<div>stale success</div>',
      bindActions: () => undefined,
      loadContext: contextFor('emp-a', false),
    });
    expect(panel.innerHTML).toBe('current-b');
    expect(helpers.showToast).not.toHaveBeenCalled();
  });
});
