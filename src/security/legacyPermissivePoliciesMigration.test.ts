import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8');
}

describe('drop legacy permissive policies migration', () => {
  const sql = readMigration('20261030130000_drop_legacy_permissive_policies.sql');

  it('drops every legacy wide-open stay_interviews policy', () => {
    expect(sql).toContain('drop policy if exists "Allow authenticated users to delete stay interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Allow authenticated users to insert stay interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Allow authenticated users to select stay interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Allow authenticated users to update stay interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Only Matthew can delete stay interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Scoped insert stay_interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Scoped select stay_interviews" on public.stay_interviews');
    expect(sql).toContain('drop policy if exists "Scoped update stay_interviews" on public.stay_interviews');
  });

  it('drops every legacy wide-open onboarding_tasks policy', () => {
    expect(sql).toContain('drop policy if exists "Allow delete for all" on public.onboarding_tasks');
    expect(sql).toContain('drop policy if exists "Allow insert for all" on public.onboarding_tasks');
    expect(sql).toContain('drop policy if exists "Allow read for all" on public.onboarding_tasks');
    expect(sql).toContain('drop policy if exists "Allow update for all" on public.onboarding_tasks');
  });

  it('only drops policies, never the orbis_* replacements', () => {
    expect(sql).not.toMatch(/drop policy if exists orbis_/);
  });
});
