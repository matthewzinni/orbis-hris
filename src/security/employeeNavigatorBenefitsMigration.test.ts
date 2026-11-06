import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20261106150000_employee_navigator_benefits.sql'),
  'utf8'
);
const tables = [
  'employee_navigator_imports', 'employee_navigator_links',
  'employee_navigator_people', 'employee_benefit_enrollments',
];

describe('Employee Navigator benefits migration', () => {
  it('keeps every benefits table HR-admin read-only with RLS', () => {
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toMatch(new RegExp(`on public\\.${table}\\s+for select to authenticated using \\(public\\.orbis_is_admin\\(\\)\\)`));
    }
    expect(migration).toMatch(/revoke all on public\.employee_navigator_imports[\s\S]*from anon, authenticated/);
    expect(migration).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/i);
  });

  it('writes only through an admin-checked security definer RPC', () => {
    expect(migration).toMatch(/security definer set search_path = pg_catalog, public/);
    expect(migration).toMatch(/if not coalesce\(public\.orbis_is_admin\(\), false\) then/);
    expect(migration).toMatch(/revoke all on function public\.orbis_replace_employee_navigator_snapshot[\s\S]*from public, anon/);
  });

  it('stores no SSN or email columns', () => {
    expect(migration).not.toMatch(/\bssn\b|social_security|email\s+text/i);
  });
});
