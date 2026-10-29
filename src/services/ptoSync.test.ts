import { describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('./supabaseClient', () => ({
  supabaseClient: { functions: { invoke } },
}));

import { syncPtoFromQuickBooksTime } from './ptoSync';

describe('syncPtoFromQuickBooksTime', () => {
  it('surfaces per-employee failures from the edge function without dropping successful updates', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        dry_run: false,
        as_of: '2026-10-29',
        qbt_users: 3,
        updated: 2,
        failed: [{ name: 'Jordan Lee', employee_id: 'BTW2101', reason: 'Supabase HTTP 500' }],
        matched: [],
        unmatched: [],
        active_without_qbt_match: [],
      },
      error: null,
    });

    const result = await syncPtoFromQuickBooksTime({ dryRun: false });

    expect(result.updated).toBe(2);
    expect(result.failed).toEqual([
      { name: 'Jordan Lee', employeeId: 'BTW2101', reason: 'Supabase HTTP 500' },
    ]);
  });

  it('defaults failed to an empty array when the edge function omits it', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, dry_run: true, as_of: '2026-10-29', qbt_users: 0, updated: 0 },
      error: null,
    });

    const result = await syncPtoFromQuickBooksTime({ dryRun: true });

    expect(result.failed).toEqual([]);
  });
});
