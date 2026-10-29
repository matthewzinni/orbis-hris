import { afterEach, describe, expect, it, vi } from 'vitest';
import { QbtError, qbtCurrentTotals, qbtGetAll } from '../../supabase/functions/sync-qbt-attendance/qbtApi';

afterEach(() => vi.unstubAllGlobals());

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('QuickBooks attendance requests', () => {
  it('retrieves current totals through the report POST and includes on- and off-clock users', async () => {
    const rows = { '11': { user_id: 11, on_the_clock: true }, '12': { user_id: 12, on_the_clock: false } };
    const fetchMock = vi.fn().mockResolvedValue(reply({ results: { current_totals: rows }, more: false }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await qbtCurrentTotals('test-token')).toEqual(rows);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://rest.tsheets.com/api/v1/reports/current_totals');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ data: { on_the_clock: 'both', limit: 200, page: 1 } });
  });

  it('paginates reports using the JSON data filters and merges each page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ results: { current_totals: { '11': { on_the_clock: true } } }, more: true }))
      .mockResolvedValueOnce(reply({ results: { current_totals: { '12': { on_the_clock: false } } }, more: false }));
    vi.stubGlobal('fetch', fetchMock);

    expect(Object.keys(await qbtCurrentTotals('test-token'))).toEqual(['11', '12']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).data).toEqual({ on_the_clock: 'both', limit: 200, page: 2 });
  });

  it('keeps ordinary resources as paginated GET requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ results: { users: { '11': { id: 11 } } }, more: true }))
      .mockResolvedValueOnce(reply({ results: { users: { '12': { id: 12 } } }, more: false }));
    vi.stubGlobal('fetch', fetchMock);

    expect(Object.keys(await qbtGetAll('test-token', 'users', 'users', { active: 'yes' }))).toEqual(['11', '12']);
    const [url, options] = fetchMock.mock.calls[1];
    expect(new URL(url).searchParams.get('page')).toBe('2');
    expect(new URL(url).searchParams.get('active')).toBe('yes');
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
  });

  it('reports rejected credentials rather than treating failure as an empty report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({}, 401)));
    await expect(qbtCurrentTotals('test-token')).rejects.toThrow('QBT_ACCESS_TOKEN (HTTP 401)');
  });

  it('preserves the failing report path in server errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({}, 500)));
    await expect(qbtCurrentTotals('test-token')).rejects.toThrow(new QbtError('QuickBooks Time HTTP 500 on reports/current_totals.'));
  });
});
