import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('shared HR notes leadership training-safe migration', () => {
  const sql = readMigration('20261029220000_shared_hr_notes_leadership_training_safe.sql');

  it('only enforces the exact-three-accounts check when the tenant has any btwglobal.com account', () => {
    expect(sql).toContain("like '%@btwglobal.com'");
    expect(sql).toMatch(/if has_btw_accounts and matched_count <> 3 then/);
  });

  it('is idempotent everywhere it writes, so it is safe to also run on production', () => {
    expect(sql).toContain('create table if not exists public.hr_notes_access');
    expect(sql).toContain('on conflict (user_id) do nothing');
    expect(sql).toContain('create or replace function public.orbis_can_access_hr_notes()');
  });

  it('still inserts exactly the three real leadership accounts by email', () => {
    expect(sql).toContain('matthew.zinni@btwglobal.com');
    expect(sql).toContain('brent.wynne@btwglobal.com');
    expect(sql).toContain('trent.wynne@btwglobal.com');
  });
});
