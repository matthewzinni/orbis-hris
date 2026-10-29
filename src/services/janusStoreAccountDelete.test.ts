import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./access', () => ({ getCurrentUserAccess: vi.fn(() => null) }));

const { list, remove, from } = vi.hoisted(() => {
  const list = vi.fn();
  const remove = vi.fn(() => Promise.resolve({ error: null }));
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === 'janus_accounts') {
      return { delete: () => ({ eq: deleteEq }) };
    }
    return {};
  });
  return { list, remove, from, deleteEq };
});

vi.mock('./supabaseClient', () => ({
  supabaseClient: {
    storage: { from: () => ({ list, remove }) },
    from,
  },
}));

import { deleteJanusAccount } from './janusStore';

describe('deleteJanusAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes every stored file under the account prefix before deleting the account row', async () => {
    list.mockResolvedValue({
      data: [{ name: '1700000000000_contract.pdf' }, { name: '1700000000001_nda.pdf' }],
      error: null,
    });

    await deleteJanusAccount('acct-1');

    expect(list).toHaveBeenCalledWith('acct-1');
    expect(remove).toHaveBeenCalledWith([
      'acct-1/1700000000000_contract.pdf',
      'acct-1/1700000000001_nda.pdf',
    ]);
    expect(from).toHaveBeenCalledWith('janus_accounts');
  });

  it('still deletes the account row even if listing storage files fails', async () => {
    list.mockResolvedValue({ data: null, error: { message: 'bucket unavailable' } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(deleteJanusAccount('acct-2')).resolves.toBeUndefined();

    expect(remove).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('janus_accounts');
  });
});
