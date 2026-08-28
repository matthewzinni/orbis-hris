import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260828143500_discipline_access_short_circuit.sql'
  ),
  'utf8'
).toLowerCase();

describe('discipline access short-circuit migration', () => {
  it('returns immediately for organization-wide discipline access', () => {
    expect(migration).toContain('if public.orbis_has_org_wide_discipline_access() then');
    expect(migration).toContain('return true;');
  });

  it('checks supervisor scope only after the organization-wide branch', () => {
    const orgWideBranch = migration.indexOf('if public.orbis_has_org_wide_discipline_access() then');
    const supervisorCheck = migration.indexOf('public.orbis_supervisor_sees_employee(e)');

    expect(orgWideBranch).toBeGreaterThanOrEqual(0);
    expect(supervisorCheck).toBeGreaterThan(orgWideBranch);
  });
});
