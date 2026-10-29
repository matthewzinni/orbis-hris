const QBT_API = 'https://rest.tsheets.com/api/v1';

export class QbtError extends Error {}

/** Reports use POST with filters under data; ordinary resources use GET query parameters. */
export async function qbtGetAll(
  token: string,
  path: string,
  key: string,
  params: Record<string, string>,
  method: 'GET' | 'POST' = 'GET'
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (let page = 1; page <= 50; page++) {
    const filters = { ...params, limit: 200, page };
    const url = method === 'POST'
      ? `${QBT_API}/${path}`
      : `${QBT_API}/${path}?${new URLSearchParams(
          Object.entries(filters).map(([name, value]) => [name, String(value)])
        )}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ data: filters }) } : {}),
    });
    if (res.status === 417) break;
    if (res.status === 401) {
      throw new QbtError(
        'QuickBooks Time rejected QBT_ACCESS_TOKEN (HTTP 401). Create a new token and update the secret.'
      );
    }
    if (!res.ok) throw new QbtError(`QuickBooks Time HTTP ${res.status} on ${path}.`);
    const body = (await res.json()) as {
      results?: Record<string, Record<string, Record<string, unknown>>>;
      more?: boolean;
    };
    Object.assign(out, body.results?.[key] || {});
    if (!body.more) break;
  }
  return out;
}

export function qbtCurrentTotals(token: string): Promise<Record<string, Record<string, unknown>>> {
  return qbtGetAll(token, 'reports/current_totals', 'current_totals', { on_the_clock: 'both' }, 'POST');
}
