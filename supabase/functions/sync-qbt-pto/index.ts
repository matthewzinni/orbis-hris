// Admin "Refresh PTO from QuickBooks Time" (Reports). Same sync as scripts/sync_qbt_pto_balances.py
// (daily GitHub Action): reads each active QuickBooks Time user's pto_balances, matches them to Orbis
// employees, and writes pto_balance_hours / _as_of / _source / _breakdown with the service role.
//
// Matching (never creates or deletes employees): exact name → email (names must agree) →
// first name/nickname + last-name word. See matchUsers.
//
// Secrets: QBT_ACCESS_TOKEN, optional QBT_PTO_TYPES (comma list of PTO type names to count;
// default "Paid Time Off (PTO)", "all" = every type).
// SUPABASE_SERVICE_ROLE_KEY is provided by Supabase.
//
// Body: { dry_run?: boolean }

import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsonResponse, requireOrbisAuth } from '../_shared/orbisEdgeAuth.ts';

const QBT_API = 'https://rest.tsheets.com/api/v1';
const ET = 'America/New_York';
const SOURCE = 'quickbooks_time';

type QbtUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  pto_balances?: Record<string, number> | null;
};

type Employee = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  work_email?: string | null;
  personal_email?: string | null;
  status?: string | null;
  termination_date?: string | null;
  pto_balance_hours?: number | null;
};

class QbtError extends Error {}

function todayInEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date());
}

async function qbtGetAll(token: string, path: string, key: string, params: Record<string, string>) {
  const out: Record<string, Record<string, unknown>> = {};
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({ ...params, limit: '200', page: String(page) });
    const res = await fetch(`${QBT_API}/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 417) break; // QBT: filter matched nothing
    if (res.status === 401) {
      throw new QbtError('QuickBooks Time rejected QBT_ACCESS_TOKEN (HTTP 401). Create a new token and update the secret.');
    }
    if (!res.ok) throw new QbtError(`QuickBooks Time HTTP ${res.status} on ${path}.`);
    const body = (await res.json()) as { results?: Record<string, Record<string, Record<string, unknown>>>; more?: boolean };
    Object.assign(out, body.results?.[key] || {});
    if (!body.more) break;
  }
  return out;
}

function normText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isTerminated(e: Employee): boolean {
  return String(e.status || '').trim().toUpperCase() === 'TERMINATED' && Boolean(e.termination_date);
}

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

// Common nicknames -> formal first name (both directions are checked).
const NICKNAMES: Record<string, string> = {
  nick: 'nicholas', sam: 'samuel', matt: 'matthew', mike: 'michael', will: 'william',
  bill: 'william', rob: 'robert', bob: 'robert', jim: 'james', tom: 'thomas',
  tony: 'anthony', alex: 'alexander', chris: 'christopher', dan: 'daniel', dave: 'david',
  joe: 'joseph', kate: 'katherine', katie: 'katherine', liz: 'elizabeth', beth: 'elizabeth',
  andy: 'andrew', drew: 'andrew', ben: 'benjamin', steve: 'steven', josh: 'joshua',
  jake: 'jacob', abby: 'abigail', jen: 'jennifer', jenny: 'jennifer', zach: 'zachary',
};

function nameTokens(value: unknown): string[] {
  return normText(value).split(' ').filter((t) => t && !NAME_SUFFIXES.has(t));
}

function firstCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if (NICKNAMES[a] === b || NICKNAMES[b] === a) return true;
  return Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a));
}

/**
 * Match QBT users to Orbis employees in passes so the strongest matches claim employees first:
 *   1. exact name (accents, punctuation, Jr/III ignored)
 *   2. email (work or personal), only when the names are compatible
 *   3. Orbis first name (nickname / prefix ok) + an Orbis last-name word in the QBT name
 * Same logic as scripts/sync_qbt_pto_balances.py (match_users).
 */
function matchUsers(users: QbtUser[], employees: Employee[]) {
  const current = employees.filter((e) => !isTerminated(e));
  const first = new Map<string, string[]>();
  const last = new Map<string, string[]>();
  const full = new Map<string, string>();
  employees.forEach((e) => {
    const k = String(e.id);
    first.set(k, nameTokens(e.first_name));
    last.set(k, nameTokens(e.last_name));
    full.set(k, [...first.get(k)!, ...last.get(k)!].join(' '));
  });
  const userTokens = users.map((u) => nameTokens(`${u.first_name || ''} ${u.last_name || ''}`));

  const compatible = (i: number, e: Employee): boolean => {
    const k = String(e.id);
    const toks = new Set(userTokens[i]);
    if (last.get(k)!.some((w) => toks.has(w))) return true;
    return first.get(k)!.some((f) => [...toks].some((t) => firstCompatible(f, t)));
  };
  const tokenMatch = (i: number, e: Employee): boolean => {
    const k = String(e.id);
    const toks = userTokens[i];
    const f = first.get(k)![0];
    return Boolean(f) && last.get(k)!.some((w) => toks.includes(w)) && toks.some((t) => firstCompatible(f, t));
  };

  const matches = new Map<number, { employee: Employee; how: string }>();
  const reasons = new Map<number, string>();
  const claimed = new Set<string>();

  const runPass = (label: string, candidatesFor: (i: number) => Employee[]) => {
    users.forEach((_u, i) => {
      if (matches.has(i)) return;
      const byId = new Map<string, Employee>();
      candidatesFor(i)
        .filter((e) => !claimed.has(String(e.id)))
        .forEach((e) => byId.set(String(e.id), e));
      const hits = [...byId.values()];
      if (hits.length === 1) {
        matches.set(i, { employee: hits[0], how: label });
        claimed.add(String(hits[0].id));
      } else if (hits.length > 1 && !reasons.has(i)) {
        reasons.set(i, `${label} matches ${hits.length} employees`);
      }
    });
  };

  runPass('name', (i) =>
    userTokens[i].length ? current.filter((e) => full.get(String(e.id)) === userTokens[i].join(' ')) : []
  );
  runPass('email', (i) => {
    const em = normEmail(users[i].email);
    if (!em) return [];
    const hits = current.filter((e) => em === normEmail(e.work_email) || em === normEmail(e.personal_email));
    const ok = hits.filter((e) => compatible(i, e));
    if (hits.length && !ok.length && !reasons.has(i)) {
      reasons.set(i, 'email belongs to a different-named employee — check QuickBooks Time');
    }
    return ok;
  });
  runPass('partial name', (i) => current.filter((e) => tokenMatch(i, e)));

  const terminatedFull = new Set(employees.filter(isTerminated).map((e) => full.get(String(e.id))));
  const unmatched = new Map<number, string>();
  users.forEach((_u, i) => {
    if (matches.has(i)) return;
    unmatched.set(
      i,
      terminatedFull.has(userTokens[i].join(' '))
        ? 'terminated in Orbis (still active in QuickBooks Time)'
        : reasons.get(i) || 'no matching employee'
    );
  });
  return { matches, unmatched, claimed };
}

function userBalances(
  user: QbtUser,
  jobcodes: Record<string, Record<string, unknown>>,
  allowed: Set<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(user.pto_balances || {}).forEach(([jobcodeId, seconds]) => {
    const name = String(jobcodes[String(jobcodeId)]?.name || `PTO type ${jobcodeId}`);
    if (allowed.size && !allowed.has(name.toLowerCase())) return;
    const hours = Number(seconds || 0) / 3600;
    if (!Number.isFinite(hours)) return;
    out[name] = Math.round(((out[name] || 0) + hours) * 100) / 100;
  });
  return out;
}

Deno.serve(async (req) => {
  const auth = await requireOrbisAuth(req, 'orbis_is_admin', 'sync-qbt-pto');
  if (!auth.ok) return auth.response;

  try {
    const token = String(Deno.env.get('QBT_ACCESS_TOKEN') || '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!token) {
      return jsonResponse({ error: 'QuickBooks Time is not connected. Set the QBT_ACCESS_TOKEN secret.' }, 503);
    }
    if (!serviceKey) return jsonResponse({ error: 'SUPABASE_SERVICE_ROLE_KEY is not available.' }, 503);

    const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean };
    const dryRun = body.dry_run === true;
    // Default counts only "Paid Time Off (PTO)" (not Holiday, Sick, ...). QBT_PTO_TYPES=all counts every type.
    const typesRaw = String(Deno.env.get('QBT_PTO_TYPES') || '').trim() || 'Paid Time Off (PTO)';
    const allowed = new Set(
      typesRaw.toLowerCase() === 'all'
        ? []
        : typesRaw
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
    );

    const [jobcodes, users] = await Promise.all([
      qbtGetAll(token, 'jobcodes', 'jobcodes', { type: 'pto' }),
      qbtGetAll(token, 'users', 'users', { active: 'true' }),
    ]);

    const admin = createClient(auth.supabaseUrl, serviceKey);
    const { data: empRows, error: empErr } = await admin
      .from('employees')
      .select('id,first_name,last_name,work_email,personal_email,status,termination_date,pto_balance_hours');
    if (empErr) throw new Error(empErr.message);
    const employees = (empRows || []) as Employee[];
    const asOf = todayInEt();

    const matched: Array<{
      employee_id: string;
      name: string;
      hours: number;
      previous: number | null;
      how: string;
      breakdown: Record<string, number>;
    }> = [];
    const sorted = (Object.values(users) as QbtUser[]).sort((a, b) =>
      `${normText(a.last_name)} ${normText(a.first_name)}`.localeCompare(`${normText(b.last_name)} ${normText(b.first_name)}`)
    );
    const result = matchUsers(sorted, employees);
    const claimed = result.claimed;
    const unmatched = [...result.unmatched.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, reason]) => ({
        name: `${sorted[i].first_name || ''} ${sorted[i].last_name || ''}`.trim(),
        email: normEmail(sorted[i].email),
        reason,
      }));
    [...result.matches.entries()]
      .sort(([a], [b]) => a - b)
      .forEach(([i, { employee, how }]) => {
        const breakdown = userBalances(sorted[i], jobcodes, allowed);
        const hours = Math.round(Object.values(breakdown).reduce((s, h) => s + h, 0) * 100) / 100;
        matched.push({
          employee_id: String(employee.id),
          name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
          hours,
          previous: employee.pto_balance_hours ?? null,
          how,
          breakdown,
        });
      });

    let updated = 0;
    const failed: Array<{ name: string; employee_id: string; reason: string }> = [];
    if (!dryRun) {
      for (const m of matched) {
        const { error } = await admin
          .from('employees')
          .update({
            pto_balance_hours: m.hours,
            pto_balance_as_of: asOf,
            pto_balance_source: SOURCE,
            pto_balance_breakdown: m.breakdown,
          })
          .eq('id', m.employee_id);
        if (error) {
          console.error(`[sync-qbt-pto] Updating ${m.name}:`, error.message);
          failed.push({ name: m.name, employee_id: m.employee_id, reason: error.message });
          continue;
        }
        updated++;
      }
    }

    const notInQbt = employees
      .filter((e) => !isTerminated(e) && String(e.status || '').toUpperCase() === 'ACTIVE' && !claimed.has(String(e.id)))
      .map((e) => `${e.first_name || ''} ${e.last_name || ''}`.trim());

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      as_of: asOf,
      qbt_users: sorted.length,
      updated,
      failed,
      matched,
      unmatched,
      active_without_qbt_match: notInQbt,
    });
  } catch (err) {
    console.error('[sync-qbt-pto]', err instanceof Error ? err.message : err);
    const message = err instanceof QbtError ? err.message : `Could not sync PTO: ${String(err instanceof Error ? err.message : err)}`;
    return jsonResponse({ error: message }, 500);
  }
});
