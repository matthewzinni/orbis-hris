// Admin "Refresh PTO from QuickBooks Time" (Reports). Same sync as scripts/sync_qbt_pto_balances.py
// (daily GitHub Action): reads each active QuickBooks Time user's pto_balances, matches them to Orbis
// employees, and writes pto_balance_hours / _as_of / _source / _breakdown with the service role.
//
// Matching (never creates or deletes employees):
//   1. QBT email = employees.work_email or personal_email (case-insensitive)
//   2. exact first + last name (accents/punctuation ignored)
//   3. first name + a shared last-name word, only if unique
//
// Secrets: QBT_ACCESS_TOKEN, optional QBT_PTO_TYPES (comma list of PTO type names to count).
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

function fullName(first: unknown, last: unknown): string {
  return `${normText(first)} ${normText(last)}`.trim();
}

function buildMatcher(employees: Employee[]) {
  const current = employees.filter((e) => !isTerminated(e));
  const byEmail = new Map<string, Map<string, Employee>>();
  const byName = new Map<string, Map<string, Employee>>();
  const add = (map: Map<string, Map<string, Employee>>, key: string, e: Employee) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Map());
    map.get(key)!.set(String(e.id), e);
  };
  current.forEach((e) => {
    add(byEmail, normEmail(e.work_email), e);
    add(byEmail, normEmail(e.personal_email), e);
    add(byName, fullName(e.first_name, e.last_name), e);
  });
  const terminatedNames = new Set(employees.filter(isTerminated).map((e) => fullName(e.first_name, e.last_name)));

  return (user: QbtUser): { employee: Employee | null; how: string } => {
    const email = normEmail(user.email);
    if (email && byEmail.has(email)) {
      const hits = [...byEmail.get(email)!.values()];
      return hits.length === 1
        ? { employee: hits[0], how: 'email' }
        : { employee: null, how: `email matches ${hits.length} employees` };
    }
    const first = normText(user.first_name);
    const last = normText(user.last_name);
    const full = `${first} ${last}`.trim();
    if (byName.has(full)) {
      const hits = [...byName.get(full)!.values()];
      return hits.length === 1
        ? { employee: hits[0], how: 'name' }
        : { employee: null, how: `name matches ${hits.length} employees` };
    }
    const lastWords = new Set(last.split(' ').filter(Boolean));
    if (first && lastWords.size) {
      const hits = current.filter(
        (e) => normText(e.first_name) === first && normText(e.last_name).split(' ').some((w) => lastWords.has(w))
      );
      if (hits.length === 1) return { employee: hits[0], how: 'first + last-name word' };
      if (hits.length > 1) return { employee: null, how: `partial name matches ${hits.length} employees` };
    }
    if (terminatedNames.has(full)) {
      return { employee: null, how: 'terminated in Orbis (still active in QuickBooks Time)' };
    }
    return { employee: null, how: 'no matching employee' };
  };
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
    const allowed = new Set(
      String(Deno.env.get('QBT_PTO_TYPES') || '')
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
    const match = buildMatcher(employees);
    const asOf = todayInEt();

    const matched: Array<{
      employee_id: string;
      name: string;
      hours: number;
      previous: number | null;
      how: string;
      breakdown: Record<string, number>;
    }> = [];
    const unmatched: Array<{ name: string; email: string; reason: string }> = [];
    const claimed = new Map<string, string>();

    const sorted = (Object.values(users) as QbtUser[]).sort((a, b) =>
      `${normText(a.last_name)} ${normText(a.first_name)}`.localeCompare(`${normText(b.last_name)} ${normText(b.first_name)}`)
    );
    for (const user of sorted) {
      const qbtName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      const { employee, how } = match(user);
      if (!employee) {
        unmatched.push({ name: qbtName, email: normEmail(user.email), reason: how });
        continue;
      }
      const id = String(employee.id);
      if (claimed.has(id)) {
        unmatched.push({ name: qbtName, email: normEmail(user.email), reason: `employee already matched to ${claimed.get(id)}` });
        continue;
      }
      claimed.set(id, qbtName);
      const breakdown = userBalances(user, jobcodes, allowed);
      const hours = Math.round(Object.values(breakdown).reduce((s, h) => s + h, 0) * 100) / 100;
      matched.push({
        employee_id: id,
        name: `${employee.first_name || ''} ${employee.last_name || ''}`.trim(),
        hours,
        previous: employee.pto_balance_hours ?? null,
        how,
        breakdown,
      });
    }

    let updated = 0;
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
        if (error) throw new Error(`Updating ${m.name}: ${error.message}`);
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
