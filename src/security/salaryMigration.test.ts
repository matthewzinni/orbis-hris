import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261106170000_salary_matthew_only.sql'),
  'utf8'
);
const tables = [
  'employee_salary_imports', 'employee_salary_history',
  'employee_compensation_extras', 'employee_salary_notes',
];
const rpcs = [
  'orbis_replace_salary_snapshot', 'orbis_save_compensation_extra',
  'orbis_delete_compensation_extra', 'orbis_save_salary_notes',
];

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf('$$;', start);
  return migration.slice(start, end);
}

describe('Salary migration (Matthew only)', () => {
  it('gates on Matthew\'s approved email, not on HR admin', () => {
    const gate = functionBody('orbis_can_view_salaries');
    expect(gate).toContain('public.orbis_access_is_approved()');
    expect(gate).toMatch(/lower\(trim\(coalesce\(public\.orbis_auth_email\(\), ''\)\)\) = 'matthew\.zinni@btwglobal\.com'/);
    expect(gate).not.toMatch(/orbis_is_admin/);
    expect(migration).toMatch(/security definer\s+set search_path = pg_catalog, public/);
    expect(migration).toMatch(/revoke all on function public\.orbis_can_view_salaries\(\) from public, anon/);
  });

  it('keeps every salary table behind RLS that only Matthew passes', () => {
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toMatch(new RegExp(
        `on public\\.${table}\\s+for select to authenticated using \\(public\\.orbis_can_view_salaries\\(\\)\\)`
      ));
    }
    const policies = migration.match(/create policy[\s\S]*?;/g) || [];
    expect(policies).toHaveLength(tables.length);
    for (const policy of policies) {
      expect(policy).toMatch(/for select to authenticated using \(public\.orbis_can_view_salaries\(\)\)/);
      expect(policy).not.toMatch(/orbis_is_admin|using \(true\)/);
    }
  });

  it('grants no direct writes or anon access', () => {
    expect(migration).toMatch(/revoke all on public\.employee_salary_imports[\s\S]*?from public, anon, authenticated;/);
    expect(migration).not.toMatch(/grant (all|insert|update|delete)[^;]*to (authenticated|anon)/i);
    expect(migration).not.toMatch(/grant [^;]*to anon/i);
  });

  it('checks Matthew in every write RPC and locks them down', () => {
    for (const name of rpcs) {
      const body = functionBody(name);
      expect(body).toMatch(/security definer set search_path = pg_catalog, public/);
      expect(body).toMatch(/if not coalesce\(public\.orbis_can_view_salaries\(\), false\) then\s+raise exception 'Not authorized' using errcode = '42501'/);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`));
    }
  });

  it('stores no SSN or email columns', () => {
    expect(migration).not.toMatch(/\bssn\b|social_security|email\s+text/i);
  });

  it('is the only migration that touches the salary tables', () => {
    const dir = resolve(root, 'supabase/migrations');
    const others = readdirSync(dir)
      .filter((file) => file.endsWith('.sql') && file !== '20261106170000_salary_matthew_only.sql')
      .filter((file) => /employee_salary_|employee_compensation_extras|orbis_can_view_salaries/.test(
        readFileSync(resolve(dir, file), 'utf8')
      ));
    expect(others).toEqual([]);
  });
});
